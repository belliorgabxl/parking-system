import "server-only";
import { Types } from "mongoose";
import {
  Booking,
  Building,
  CancelReason,
  Listing,
  Report,
  User,
  WalletTransaction,
  type BookingDoc,
  type ListingDoc,
  type UserDoc,
} from "./models";
import { addTx, getBalance } from "./ledger";
import { rateLimit, MINUTE } from "./ratelimit";
import {
  ARRIVAL_GRACE_MS,
  EXTEND_STEP_MINUTES,
  FREE_SEEKER_CANCEL_MS,
  HANDOVER_AUTOCOMPLETE_MS,
  MAX_LEAVE_MINUTES,
  MIN_STANDING_TO_OFFER,
  NO_SHOW_PROVIDER_SHARE,
  PAYMENT_HOLD_MS,
  PENALTY,
  PROVIDER_LEAVE_TIMEOUT_MS,
} from "./pricing";
import { ACTIVE_BOOKING_STATUSES, ACTIVE_STATUSES, PAYMENT_LABEL, type ListingStatus, type PaymentMethod } from "./constants";
import { BOT_SEEKERS, SIMULATION_ON, carText, getBotUser } from "./seed";
import { ApiError } from "./api";
import { getUserVehicle, parseVehicleText, rememberVehicle } from "./vehicles";
import { notify } from "./notify";
import { baht } from "./format";

// Simulation timings (spec §10: match in ~5s, the other party arrives a few seconds later).
const SIM_MATCH_AFTER_MS = 5_000;
const SIM_ARRIVE_AFTER_MS = 8_000;
const SIM_PROVIDER_LEAVES_AFTER_MS = 3_000;
const SIM_SEEKER_PARKS_AFTER_MS = 4_000;

export const spotName = (l: { floor: string; zone: string }) => `${l.floor} Zone ${l.zone}`;

/** Gate for offering / grabbing: suspended accounts, low standing and unpaid penalties are blocked. */
export async function assertCanTransact(user: UserDoc) {
  if (user.isBanned) throw new ApiError(403, "ACCOUNT_SUSPENDED", "Your account is suspended. Please contact support.");
  if (user.standingScore < MIN_STANDING_TO_OFFER) {
    throw new ApiError(403, "LOW_STANDING", "Your account is paused after repeated issues. Please contact support.");
  }
  const balance = await getBalance(user._id);
  if (balance < 0) {
    throw new ApiError(402, "NEGATIVE_BALANCE", `Please top up to settle your -฿${Math.abs(balance)} balance first.`, {
      balance,
    });
  }
}

/**
 * Atomically move a listing (and its current booking) between states. Returns null if another request
 * already moved it, so money side effects run exactly once per transition.
 */
async function transition(
  listingId: Types.ObjectId,
  from: ListingStatus[],
  to: ListingStatus,
  listingSet: Record<string, unknown> = {},
  bookingSet: Record<string, unknown> = {},
) {
  const terminal = !ACTIVE_STATUSES.includes(to);
  const now = new Date();
  const listing = await Listing.findOneAndUpdate(
    { _id: listingId, status: { $in: from } },
    {
      $set: { status: to, ...(terminal ? { closedAt: now, heldBy: null, heldUntil: null } : {}), ...listingSet },
      ...(terminal ? { $unset: { activeProviderId: "" } } : {}),
    },
    { returnDocument: "after" },
  );
  if (!listing) return null;
  let booking: BookingDoc | null = null;
  if (listing.bookingId) {
    booking = await Booking.findByIdAndUpdate(
      listing.bookingId,
      {
        $set: { status: to, ...(terminal ? { closedAt: now } : {}), ...bookingSet },
        ...(terminal ? { $unset: { activeSeekerId: "" } } : {}),
      },
      { returnDocument: "after" },
    );
  }
  return { listing, booking };
}

// Notifications go to real people only.
const toProvider = (l: ListingDoc) => ({ skip: !!l.isBotListing });
const toSeeker = (b: BookingDoc | null) => ({ skip: !b || !!b.isBotSeeker });

// ---------------------------------------------------------------- matching

const notHeldByOthers = (userId: Types.ObjectId) => ({
  $or: [{ heldBy: null }, { heldUntil: { $lt: new Date() } }, { heldBy: userId }],
});

async function createMatch(
  listing: ListingDoc,
  seeker: UserDoc,
  method: PaymentMethod,
  opts: {
    isBot?: boolean;
    vehicle?: { makeModel?: string; color?: string; plate?: string; text: string } | null;
    paymentLabel?: string;
  } = {},
) {
  const matched = await Listing.findOneAndUpdate(
    {
      _id: listing._id,
      status: "OPEN",
      leaveAt: { $gt: new Date(Date.now() - ARRIVAL_GRACE_MS) },
      ...notHeldByOthers(seeker._id),
    },
    { $set: { status: "MATCHED", heldBy: null, heldUntil: null } },
    { returnDocument: "after" },
  );
  if (!matched) throw new ApiError(409, "SPOT_TAKEN", "Sorry, someone else just grabbed this spot.");

  const paymentLabel = opts.paymentLabel || PAYMENT_LABEL[method];
  let booking: BookingDoc;
  try {
    booking = await Booking.create({
      listingId: matched._id,
      seekerId: seeker._id,
      seekerVehicleSnapshot: opts.vehicle ?? null,
      paymentMethod: method,
      paymentLabel,
      amountHeld: matched.price,
      status: "MATCHED",
      isBotSeeker: !!opts.isBot,
      etaMinutes: 3 + Math.floor(Math.random() * 6),
      // Unique index: a second concurrent grab by the same seeker fails here.
      ...(opts.isBot ? {} : { activeSeekerId: seeker._id }),
    });
  } catch (err) {
    await Listing.updateOne({ _id: matched._id, status: "MATCHED" }, { $set: { status: "OPEN" } });
    if ((err as { code?: number }).code === 11000) {
      throw new ApiError(409, "ACTIVE_BOOKING", "You already have an active booking.");
    }
    throw err;
  }
  matched.bookingId = booking._id;
  await matched.save();

  // Escrow hold (spec §5). Wallet payments debit the balance; QR/card are recorded only.
  await addTx({
    userId: seeker._id,
    type: "payment_hold",
    amount: -matched.price,
    external: method !== "wallet",
    method,
    label: `Parked · ${spotName(matched)}`,
    bookingId: booking._id,
    listingId: matched._id,
    meta: { paymentLabel },
  });
  await notify(
    matched.providerId,
    "match",
    "Driver matched!",
    `${seeker.displayName === "Guest" ? "A driver" : seeker.displayName} is heading to ${spotName(matched)}. Be ready by the leave time.`,
    matched._id,
    toProvider(matched),
  );
  return { listing: matched, booking };
}

export async function grabSpot(
  user: UserDoc,
  listingId: string,
  method: PaymentMethod,
  paymentLabel?: string,
  vehicleText?: string,
) {
  await assertCanTransact(user);
  const found = await Listing.findById(listingId);
  if (!found) throw new ApiError(404, "NOT_FOUND", "This spot no longer exists.");
  const listing = await advanceListing(found);
  if (listing.status !== "OPEN") throw new ApiError(409, "SPOT_TAKEN", "Sorry, this spot is no longer available.");
  if (listing.providerId.equals(user._id)) throw new ApiError(400, "OWN_SPOT", "You can't grab your own spot.");
  if (listing.heldBy && !listing.heldBy.equals(user._id) && listing.heldUntil && listing.heldUntil.getTime() > Date.now()) {
    throw new ApiError(409, "SPOT_HELD", "Someone is paying for this spot right now. Try another one or check back in a minute.");
  }

  const active = await Booking.findOne({ seekerId: user._id, status: { $in: ACTIVE_BOOKING_STATUSES } });
  if (active)
    throw new ApiError(409, "ACTIVE_BOOKING", "You already have an active booking.", { listingId: String(active.listingId) });

  if (method === "wallet") {
    const balance = await getBalance(user._id);
    if (balance < listing.price) {
      throw new ApiError(402, "INSUFFICIENT_BALANCE", "Not enough wallet balance.", { balance, price: listing.price });
    }
  }
  // The provider needs the seeker's car to recognise them; typed at checkout or the default saved car.
  const vehicle = vehicleText ? parseVehicleText(vehicleText) : await getUserVehicle(user._id);
  const r = await createMatch(listing, user, method, { vehicle, paymentLabel });
  if (vehicleText && !user.isGuest) await rememberVehicle(user._id, vehicleText);
  return r;
}

/** Reserve an open spot for PAYMENT_HOLD_MS while the seeker scans a QR code. */
export async function holdSpot(user: UserDoc, listingId: Types.ObjectId) {
  await assertCanTransact(user);
  // One reservation per person, and only a few per 10 minutes — nobody can lock up a whole car park.
  await rateLimit(`hold:${user._id}`, 5, 10 * MINUTE, "Too many payment attempts. Try again in a few minutes.");
  await Listing.updateMany({ heldBy: user._id, _id: { $ne: listingId } }, { $set: { heldBy: null, heldUntil: null } });
  const heldUntil = new Date(Date.now() + PAYMENT_HOLD_MS);
  const held = await Listing.findOneAndUpdate(
    { _id: listingId, status: "OPEN", providerId: { $ne: user._id }, ...notHeldByOthers(user._id) },
    { $set: { heldBy: user._id, heldUntil } },
    { returnDocument: "after" },
  );
  if (!held) throw new ApiError(409, "SPOT_HELD", "Someone else is paying for this spot right now. Try another one.");
  return heldUntil;
}

export async function releaseHold(user: UserDoc, listingId: Types.ObjectId) {
  await Listing.updateOne({ _id: listingId, heldBy: user._id }, { $set: { heldBy: null, heldUntil: null } });
}

// ---------------------------------------------------------------- user actions

export async function seekerArrived(booking: BookingDoc) {
  const r = await transition(booking.listingId, ["MATCHED"], "SEEKER_ARRIVED", {}, { arrivedAt: new Date() });
  if (!r) throw new ApiError(409, "BAD_STATE", "This booking can't be marked as arrived anymore.");
  await notify(
    r.listing.providerId,
    "arrived",
    "Your seeker has arrived",
    "Please pull out now so they can take your spot.",
    r.listing._id,
    toProvider(r.listing),
  );
  return r;
}

export async function providerLeaving(listing: ListingDoc) {
  if (listing.status !== "SEEKER_ARRIVED" && listing.status !== "MATCHED") {
    throw new ApiError(409, "BAD_STATE", "No seeker is waiting for this spot.");
  }
  const r = await Listing.updateOne({ _id: listing._id, providerLeftAt: null }, { $set: { providerLeftAt: new Date() } });
  if (r.modifiedCount && listing.bookingId) {
    const b = await Booking.findById(listing.bookingId);
    await notify(
      b?.seekerId,
      "leaving",
      "The provider is leaving",
      `Pull into ${spotName(listing)} and confirm once you've parked.`,
      listing._id,
      toSeeker(b),
    );
  }
}

export async function completeHandover(listingId: Types.ObjectId, from: ListingStatus[] = ["SEEKER_ARRIVED"]) {
  const r = await transition(listingId, from, "COMPLETED", {}, { completedAt: new Date() });
  if (!r) return null;
  const { listing, booking } = r;
  await addTx({
    userId: listing.providerId,
    type: "earning",
    amount: listing.providerEarning,
    label: `Spot handover · ${spotName(listing)}`,
    bookingId: booking?._id,
    listingId: listing._id,
  });
  await notify(
    listing.providerId,
    "completed",
    `You earned ${baht(listing.providerEarning)}`,
    `Handover at ${spotName(listing)} is complete.`,
    listing._id,
    toProvider(listing),
  );
  if (booking) {
    // Remember where the seeker parked so they can offer the same spot when they leave (closes the loop).
    await User.updateOne(
      { _id: booking.seekerId },
      {
        $set: {
          lastParked: {
            buildingId: listing.buildingId,
            floor: listing.floor,
            zone: listing.zone,
            entrance: listing.entrance,
            landmark: listing.landmark,
            at: new Date(),
          },
        },
      },
    );
  }
  return r;
}

/**
 * Return a seeker's payment to their wallet. Wallet payments go back to the buckets they came from;
 * card/QR payments come back as non-withdrawable credit (no cashing out cards through refunds).
 */
async function refundSeeker(listing: ListingDoc, booking: BookingDoc) {
  const hold = await WalletTransaction.findOne({ bookingId: booking._id, type: "payment_hold" }).lean();
  const split = hold && !hold.external ? { credit: -(hold.creditAmount ?? 0), cash: -(hold.cashAmount ?? 0) } : undefined;
  await addTx({
    userId: booking.seekerId,
    type: "refund",
    amount: booking.amountHeld,
    label: `Refund · ${spotName(listing)}`,
    bookingId: booking._id,
    listingId: listing._id,
    split,
  });
}

async function chargeSeekerPenalty(listing: ListingDoc, booking: BookingDoc, label: string) {
  const base = { bookingId: booking._id, listingId: listing._id };
  await refundSeeker(listing, booking);
  await addTx({ ...base, userId: booking.seekerId, type: "penalty", amount: -PENALTY, label });
  await addTx({
    ...base,
    userId: listing.providerId,
    type: "compensation",
    amount: NO_SHOW_PROVIDER_SHARE,
    label: "Penalty from seeker",
  });
}

export async function seekerNoShow(listingId: Types.ObjectId) {
  const r = await transition(listingId, ["MATCHED"], "SEEKER_NO_SHOW");
  if (!r?.booking) return r;
  const { listing, booking } = r;
  await chargeSeekerPenalty(listing, booking, "Late arrival penalty");
  await User.updateOne({ _id: booking.seekerId }, { $inc: { standingScore: -2 } });
  await notify(
    listing.providerId,
    "penalty",
    "The seeker didn't come in time",
    `You're free to leave. ${baht(NO_SHOW_PROVIDER_SHARE)} was added to your wallet.`,
    listing._id,
    toProvider(listing),
  );
  await notify(
    booking.seekerId,
    "penalty",
    "You didn't arrive in time",
    `Refunded minus a ${baht(PENALTY)} penalty.`,
    listing._id,
    toSeeker(booking),
  );
  return r;
}

export async function providerNoLeave(listingId: Types.ObjectId) {
  const r = await transition(listingId, ["MATCHED", "SEEKER_ARRIVED"], "PROVIDER_NO_LEAVE");
  if (!r) return r;
  await refundSeekerAndPenalizeProvider(r.listing, r.booking, "Didn't leave in time");
  await User.updateOne({ _id: r.listing.providerId }, { $inc: { standingScore: -5 } });
  await notify(
    r.listing.providerId,
    "penalty",
    "You didn't leave in time",
    `A ${baht(PENALTY)} penalty was charged.`,
    r.listing._id,
    toProvider(r.listing),
  );
  await notify(
    r.booking?.seekerId,
    "refund",
    "The provider couldn't leave",
    `${baht(r.booking?.amountHeld ?? 0)} was refunded to your wallet.`,
    r.listing._id,
    toSeeker(r.booking),
  );
  return r;
}

async function refundSeekerAndPenalizeProvider(listing: ListingDoc, booking: BookingDoc | null, penaltyLabel: string | null) {
  const base = { bookingId: booking?._id, listingId: listing._id };
  if (penaltyLabel) await addTx({ ...base, userId: listing.providerId, type: "penalty", amount: -PENALTY, label: penaltyLabel });
  if (booking) await refundSeeker(listing, booking);
}

export async function cancelListing(user: UserDoc, listing: ListingDoc, reasons: string[], detailsText: string) {
  if (!listing.providerId.equals(user._id)) throw new ApiError(403, "FORBIDDEN", "Not your listing.");
  // Free while still looking for a driver; penalty once a seeker is matched (spec §4.4).
  const free = await transition(listing._id, ["OPEN"], "CANCELLED_FREE");
  if (free) {
    await CancelReason.create({ listingId: listing._id, userId: user._id, reasons, detailsText, penalty: 0 });
    return { penalty: 0, listing: free.listing };
  }
  const paid = await transition(listing._id, ["MATCHED", "SEEKER_ARRIVED"], "CANCELLED_BY_PROVIDER");
  if (!paid) throw new ApiError(409, "BAD_STATE", "This listing can no longer be cancelled.");
  await refundSeekerAndPenalizeProvider(paid.listing, paid.booking, "Cancellation fee");
  await User.updateOne({ _id: user._id }, { $inc: { standingScore: -2 } });
  await CancelReason.create({ listingId: listing._id, userId: user._id, reasons, detailsText, penalty: PENALTY });
  await notify(
    paid.booking?.seekerId,
    "cancelled",
    "The provider cancelled",
    `${baht(paid.booking?.amountHeld ?? 0)} was refunded to your wallet. Find another spot from Home.`,
    listing._id,
    toSeeker(paid.booking),
  );
  return { penalty: PENALTY, listing: paid.listing };
}

/**
 * Seeker cancels before arriving. Free within FREE_SEEKER_CANCEL_MS of matching, otherwise the
 * no-show penalty applies. The spot re-opens so the provider can get another driver.
 */
export async function seekerCancel(user: UserDoc, booking: BookingDoc, reason: string) {
  if (!booking.seekerId.equals(user._id)) throw new ApiError(403, "FORBIDDEN", "Not your booking.");
  if (booking.status !== "MATCHED") {
    throw new ApiError(409, "BAD_STATE", "You've already arrived — use “Having problems?” instead.");
  }
  const free = Date.now() < booking.matchedAt.getTime() + FREE_SEEKER_CANCEL_MS;
  const listing = await Listing.findOneAndUpdate(
    { _id: booking.listingId, status: "MATCHED", bookingId: booking._id },
    { $set: { status: "OPEN", bookingId: null, providerLeftAt: null, heldBy: null, heldUntil: null } },
    { returnDocument: "after" },
  );
  if (!listing) throw new ApiError(409, "BAD_STATE", "This booking can no longer be cancelled.");
  await Booking.updateOne(
    { _id: booking._id },
    { $set: { status: "CANCELLED_BY_SEEKER", closedAt: new Date(), cancelReason: reason }, $unset: { activeSeekerId: "" } },
  );
  if (free) {
    await refundSeekerAndPenalizeProvider(listing, booking, null);
  } else {
    await chargeSeekerPenalty(listing, booking, "Cancellation fee");
  }
  await notify(
    listing.providerId,
    "cancelled",
    "The driver cancelled",
    free
      ? "We're looking for another driver for your spot."
      : `We're looking for another driver. ${baht(NO_SHOW_PROVIDER_SHARE)} was added to your wallet for the wait.`,
    listing._id,
    toProvider(listing),
  );
  return { penalty: free ? 0 : PENALTY, refund: booking.amountHeld };
}

/** Provider asks for more time while still looking for a driver. */
export async function extendListing(user: UserDoc, listing: ListingDoc, minutes = EXTEND_STEP_MINUTES) {
  if (!listing.providerId.equals(user._id)) throw new ApiError(403, "FORBIDDEN", "Not your listing.");
  const base = Math.max(listing.leaveAt.getTime(), Date.now());
  const next = new Date(Math.min(base + minutes * 60_000, Date.now() + MAX_LEAVE_MINUTES * 60_000));
  const r = await Listing.findOneAndUpdate(
    { _id: listing._id, status: "OPEN" },
    { $set: { leaveAt: next } },
    { returnDocument: "after" },
  );
  if (!r) throw new ApiError(409, "BAD_STATE", "A driver is already matched — the leave time can't change now.");
  return r;
}

export async function reportProblem(user: UserDoc, booking: BookingDoc, reason: string, detailsText: string) {
  if (!booking.seekerId.equals(user._id)) throw new ApiError(403, "FORBIDDEN", "Not your booking.");
  const r = await transition(booking.listingId, ["MATCHED", "SEEKER_ARRIVED"], "DISPUTED");
  if (!r) throw new ApiError(409, "BAD_STATE", "This booking is already closed.");
  const { listing } = r;
  await refundSeeker(listing, booking);
  // Logged for review; repeated reports reduce provider standing (spec §4.4).
  await Report.create({
    bookingId: booking._id,
    listingId: listing._id,
    reporterId: user._id,
    reporterRole: "seeker",
    againstUserId: listing.providerId,
    reason,
    detailsText,
    resolution: "pending_review",
  });
  const reportCount = await Report.countDocuments({ againstUserId: listing.providerId });
  await User.updateOne({ _id: listing.providerId }, { $inc: { standingScore: reportCount >= 3 ? -10 : -3 } });
  await notify(
    listing.providerId,
    "report",
    "The seeker reported a problem",
    "We refunded the seeker and will review the handover.",
    listing._id,
    toProvider(listing),
  );
  return { refund: booking.amountHeld };
}

/** Provider flags a problem with the seeker. Logged for review; the handover keeps its own deadlines. */
export async function providerReport(user: UserDoc, listing: ListingDoc, reason: string, detailsText: string) {
  if (!listing.providerId.equals(user._id)) throw new ApiError(403, "FORBIDDEN", "Not your listing.");
  if (!["MATCHED", "SEEKER_ARRIVED"].includes(listing.status) || !listing.bookingId) {
    throw new ApiError(409, "BAD_STATE", "There's no active seeker to report.");
  }
  const booking = await Booking.findById(listing.bookingId);
  if (!booking) throw new ApiError(409, "BAD_STATE", "There's no active seeker to report.");
  if (await Report.exists({ bookingId: booking._id, reporterId: user._id })) {
    throw new ApiError(409, "ALREADY_REPORTED", "You've already reported this handover. Our team is on it.");
  }
  await Report.create({
    bookingId: booking._id,
    listingId: listing._id,
    reporterId: user._id,
    reporterRole: "provider",
    againstUserId: booking.seekerId,
    reason,
    detailsText,
    resolution: "pending_review",
  });
  return { reported: true };
}

/** Support closes a live handover: open spots are cancelled, matched ones refunded without penalties. */
export async function adminClose(listingId: Types.ObjectId) {
  const open = await transition(listingId, ["OPEN"], "CANCELLED_FREE");
  if (open) {
    await notify(
      open.listing.providerId,
      "system",
      "Your spot offer was closed by support",
      "",
      listingId,
      toProvider(open.listing),
    );
    return open.listing.status;
  }
  const live = await transition(listingId, ["MATCHED", "SEEKER_ARRIVED"], "DISPUTED");
  if (!live) throw new ApiError(409, "BAD_STATE", "This handover is already closed.");
  await refundSeekerAndPenalizeProvider(live.listing, live.booking, null);
  await notify(
    live.listing.providerId,
    "system",
    "Handover closed by support",
    "No penalty was charged.",
    listingId,
    toProvider(live.listing),
  );
  await notify(
    live.booking?.seekerId,
    "refund",
    "Handover closed by support",
    `${baht(live.booking?.amountHeld ?? 0)} was refunded to your wallet.`,
    listingId,
    toSeeker(live.booking),
  );
  return live.listing.status;
}

/** A simulated seeker grabs the listing (pays by card). No-op if someone matched it first. */
export async function botMatch(listing: ListingDoc) {
  const bot = BOT_SEEKERS[Math.floor(Math.random() * BOT_SEEKERS.length)];
  const seeker = await getBotUser(bot.name);
  try {
    return await createMatch(listing, seeker, "card", { isBot: true, vehicle: { ...bot.car, text: carText(bot.car) } });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- deadlines

export function deadlinesFor(listing: ListingDoc, booking: BookingDoc | null) {
  const leaveAt = listing.leaveAt.getTime();
  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
  const arrivedAt = booking?.arrivedAt?.getTime() ?? null;
  const leftAt = listing.providerLeftAt?.getTime() ?? null;
  return {
    /** OPEN: expires; MATCHED: seeker becomes a no-show */
    arrivalBy: iso(leaveAt + ARRIVAL_GRACE_MS),
    /** SEEKER_ARRIVED without the provider leaving: provider no-leave after this */
    providerLeaveBy: arrivedAt !== null && leftAt === null ? iso(Math.max(arrivedAt, leaveAt) + PROVIDER_LEAVE_TIMEOUT_MS) : null,
    /** Provider left: auto-completes after this unless the seeker reports */
    autoCompleteAt: leftAt !== null ? iso(leftAt + HANDOVER_AUTOCOMPLETE_MS) : null,
    /** Seeker may cancel for free until this */
    freeCancelUntil: booking ? iso(booking.matchedAt.getTime() + FREE_SEEKER_CANCEL_MS) : null,
    heldUntil: listing.heldUntil && listing.heldUntil.getTime() > Date.now() ? listing.heldUntil.toISOString() : null,
  };
}

/**
 * Applies deadline rules and simulation bots. Called on reads (and by the sweeper) so no worker is needed.
 * Returns the listing with fresh state (callers must use the return value).
 */
export async function advanceListing(listing: ListingDoc): Promise<ListingDoc> {
  const now = Date.now();
  const leaveAt = listing.leaveAt.getTime();
  let changed = false;

  if (listing.status === "OPEN") {
    if (now > leaveAt + ARRIVAL_GRACE_MS) {
      const r = await transition(listing._id, ["OPEN"], "EXPIRED");
      if (r)
        await notify(
          listing.providerId,
          "system",
          "No driver this time",
          "Your leave time passed with no match. No charge.",
          listing._id,
          toProvider(listing),
        );
      changed = !!r;
    } else if (
      SIMULATION_ON &&
      listing.simulateSeeker &&
      now > listing.createdAt.getTime() + SIM_MATCH_AFTER_MS &&
      !(listing.heldUntil && listing.heldUntil.getTime() > now)
    ) {
      changed = !!(await botMatch(listing));
    }
  } else if (listing.status === "MATCHED" || listing.status === "SEEKER_ARRIVED") {
    const booking = listing.bookingId ? await Booking.findById(listing.bookingId) : null;
    if (listing.status === "MATCHED") {
      if (now > leaveAt + ARRIVAL_GRACE_MS) {
        changed = !!(await seekerNoShow(listing._id));
      } else if (SIMULATION_ON && booking?.isBotSeeker && now > booking.matchedAt.getTime() + SIM_ARRIVE_AFTER_MS) {
        changed = !!(await transition(listing._id, ["MATCHED"], "SEEKER_ARRIVED", {}, { arrivedAt: new Date() }));
        if (changed)
          await notify(
            listing.providerId,
            "arrived",
            "Your seeker has arrived",
            "Please pull out now so they can take your spot.",
            listing._id,
            toProvider(listing),
          );
      }
    } else if (booking?.arrivedAt) {
      const arrivedAt = booking.arrivedAt.getTime();
      if (!listing.providerLeftAt) {
        if (SIMULATION_ON && listing.isBotListing && now > arrivedAt + SIM_PROVIDER_LEAVES_AFTER_MS) {
          await providerLeaving(listing);
          changed = true;
        } else if (now > Math.max(arrivedAt, leaveAt) + PROVIDER_LEAVE_TIMEOUT_MS) {
          // Seeker is waiting but the provider never pulled out: refund the seeker, penalise the provider.
          changed = !!(await providerNoLeave(listing._id));
        }
      } else {
        const leftAt = listing.providerLeftAt.getTime();
        if (SIMULATION_ON && booking.isBotSeeker && now > leftAt + SIM_SEEKER_PARKS_AFTER_MS) {
          changed = !!(await completeHandover(listing._id));
        } else if (now > leftAt + HANDOVER_AUTOCOMPLETE_MS) {
          changed = !!(await completeHandover(listing._id));
        }
      }
    }
  }

  if (changed) return (await Listing.findById(listing._id)) ?? listing;
  return listing;
}

/** Expire stale open spots in bulk (no money involved). */
export async function expireStaleOpen(buildingId?: Types.ObjectId) {
  await Listing.updateMany(
    {
      status: "OPEN",
      leaveAt: { $lt: new Date(Date.now() - ARRIVAL_GRACE_MS) },
      ...(buildingId ? { buildingId } : {}),
    },
    { $set: { status: "EXPIRED", closedAt: new Date(), heldBy: null, heldUntil: null }, $unset: { activeProviderId: "" } },
  );
}

/**
 * Push every live handover through its deadlines even if nobody has the app open.
 * Throttled per server instance; also exposed as /api/cron/sweep for a scheduler.
 */
/** Guests who never did anything that touches money or history are removed after 30 days. */
async function purgeIdleGuests() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const candidates = await User.find({ isGuest: true, isBot: false, updatedAt: { $lt: cutoff } }, { _id: 1 })
    .limit(200)
    .lean();
  for (const { _id } of candidates) {
    const used = await Promise.all([
      WalletTransaction.exists({ userId: _id }),
      Listing.exists({ providerId: _id }),
      Booking.exists({ seekerId: _id }),
    ]);
    if (!used.some(Boolean)) await User.deleteOne({ _id, isGuest: true });
  }
}

let lastSweep = 0;
export async function sweepDue(force = false) {
  if (!force && Date.now() - lastSweep < 15_000) return 0;
  lastSweep = Date.now();
  await expireStaleOpen();
  const live = await Listing.find({
    $or: [{ status: { $in: ["MATCHED", "SEEKER_ARRIVED"] } }, { status: "OPEN", simulateSeeker: true }],
  })
    .sort({ leaveAt: 1 })
    .limit(200);
  let advanced = 0;
  for (const l of live) {
    const before = l.status;
    const after = await advanceListing(l);
    if (after.status !== before) advanced++;
  }
  if (force) await purgeIdleGuests(); // cron only — keeps request paths fast
  return advanced;
}

export async function activeFor(userId: Types.ObjectId) {
  let listing = await Listing.findOne({ providerId: userId, status: { $in: ACTIVE_STATUSES } }).sort({ createdAt: -1 });
  if (listing) {
    listing = await advanceListing(listing);
    if (!ACTIVE_STATUSES.includes(listing.status as ListingStatus)) listing = null;
  }
  let booking = await Booking.findOne({ seekerId: userId, status: { $in: ACTIVE_BOOKING_STATUSES } }).sort({ createdAt: -1 });
  if (booking) {
    const l = await Listing.findById(booking.listingId);
    if (l) await advanceListing(l);
    booking = await Booking.findById(booking._id);
    if (booking && !ACTIVE_BOOKING_STATUSES.includes(booking.status as ListingStatus)) booking = null;
  }
  return { listing, booking };
}

/** The viewer's own (latest) booking on a listing — survives the listing being re-opened after a seeker cancel. */
export async function seekerBookingFor(listingId: Types.ObjectId, userId: Types.ObjectId) {
  return Booking.findOne({ listingId, seekerId: userId }).sort({ createdAt: -1 });
}

// ---------------------------------------------------------------- views

/** Role-aware view of a handover, or null if the viewer isn't a participant. */
export async function transactionView(listing: ListingDoc, viewer: UserDoc) {
  const isProvider = listing.providerId.equals(viewer._id);
  const booking = isProvider
    ? listing.bookingId
      ? await Booking.findById(listing.bookingId)
      : null
    : await seekerBookingFor(listing._id, viewer._id);
  if (!isProvider && !booking) return null;
  const role = isProvider ? ("provider" as const) : ("seeker" as const);

  const [building, seeker, provider, ledger, balance, report] = await Promise.all([
    Building.findById(listing.buildingId).lean(),
    booking ? User.findById(booking.seekerId).lean() : null,
    User.findById(listing.providerId).lean(),
    WalletTransaction.find({ userId: viewer._id, listingId: listing._id }).sort({ createdAt: 1 }).lean(),
    getBalance(viewer._id),
    booking ? Report.findOne({ bookingId: booking._id, reporterId: viewer._id }).lean() : null,
  ]);
  // A seeker sees their own booking's outcome (e.g. CANCELLED_BY_SEEKER even if the spot re-opened).
  const status = (role === "seeker" ? booking!.status : listing.status) as ListingStatus;
  const showCar = role === "provider" || ACTIVE_BOOKING_STATUSES.includes(status) || status === "COMPLETED";

  return {
    serverNow: new Date().toISOString(),
    role,
    balance,
    deadlines: deadlinesFor(listing, booking),
    report: report ? { reason: report.reason, resolution: report.resolution } : null,
    listing: {
      id: String(listing._id),
      status,
      building: { id: String(listing.buildingId), name: building?.name ?? "" },
      floor: listing.floor,
      zone: listing.zone,
      entrance: listing.entrance,
      landmark: listing.landmark,
      descriptionText: listing.descriptionText,
      vehicle: showCar ? (listing.vehicleSnapshot?.text ?? "") : "",
      spotType: listing.spotType,
      carSize: listing.carSize,
      isLadyBay: listing.isLadyBay,
      leaveAt: listing.leaveAt.toISOString(),
      price: listing.price,
      providerEarning: listing.providerEarning,
      providerLeftAt: listing.providerLeftAt?.toISOString() ?? null,
      providerName: provider?.displayName ?? "Provider",
      createdAt: listing.createdAt.toISOString(),
    },
    booking: booking
      ? {
          id: String(booking._id),
          status: booking.status as ListingStatus,
          paymentMethod: booking.paymentMethod as PaymentMethod,
          paymentLabel: booking.paymentLabel || PAYMENT_LABEL[booking.paymentMethod as PaymentMethod],
          amountHeld: booking.amountHeld,
          matchedAt: booking.matchedAt.toISOString(),
          arrivedAt: booking.arrivedAt?.toISOString() ?? null,
          completedAt: booking.completedAt?.toISOString() ?? null,
          etaMinutes: booking.etaMinutes,
          seekerName: seeker?.displayName ?? "Seeker",
          seekerVehicle: booking.seekerVehicleSnapshot?.text ?? "",
        }
      : null,
    ledger: ledger.map((t) => ({
      id: String(t._id),
      type: t.type,
      amount: t.amount,
      label: t.label,
      external: !!t.external,
      method: t.method,
      paymentLabel: (t.meta as { paymentLabel?: string } | null)?.paymentLabel ?? null,
    })),
  };
}
export type TransactionView = NonNullable<Awaited<ReturnType<typeof transactionView>>>;
