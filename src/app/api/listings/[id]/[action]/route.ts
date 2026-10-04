import { ApiError, handler, int, readJson, str } from "@/lib/api";
import { resolveCard } from "@/lib/cards";
import {
  CANCEL_REASONS,
  PAYMENT_METHODS,
  PROVIDER_REPORT_REASONS,
  REPORT_REASONS,
  SEEKER_CANCEL_REASONS,
  ACTIVE_BOOKING_STATUSES,
  type PaymentMethod,
} from "@/lib/constants";
import { connectDB } from "@/lib/db";
import {
  advanceListing,
  cancelListing,
  completeHandover,
  extendListing,
  grabSpot,
  holdSpot,
  providerLeaving,
  providerReport,
  releaseHold,
  reportProblem,
  seekerArrived,
  seekerBookingFor,
  seekerCancel,
  transactionView,
} from "@/lib/engine";
import { getBalance } from "@/lib/ledger";
import { Listing } from "@/lib/models";
import { getOrCreateUser } from "@/lib/session";
import { DAY, HOUR, rateLimit } from "@/lib/ratelimit";

/** Abuse limits per user for actions that move money or create review work. */
const LIMITS: Record<string, [number, number, string]> = {
  report: [3, DAY, "You've reported several handovers today. Contact support if something is wrong."],
  cancel_booking: [5, DAY, "Too many cancellations today. Please try again tomorrow."],
  provider_report: [5, DAY, "Too many reports today. Contact support."],
  extend: [6, HOUR, "You've extended this spot many times. Cancel and offer again later instead."],
  grab: [20, HOUR, "Too many attempts. Try again later."],
};

type Ctx = { params: Promise<{ id: string; action: string }> };

const oneOf = (list: readonly string[], v: string, msg: string) => {
  if (!list.includes(v)) throw new ApiError(400, "BAD_REASON", msg);
  return v;
};

export const POST = handler(async (req: Request, { params }: Ctx) => {
  const { id, action } = await params;
  await connectDB();
  const user = await getOrCreateUser();
  const body = await readJson(req).catch(() => ({}) as Record<string, unknown>);

  const found = await Listing.findById(id);
  if (!found) throw new ApiError(404, "NOT_FOUND", "This spot no longer exists.");
  let listing = await advanceListing(found);
  const isProvider = listing.providerId.equals(user._id);
  const myBooking = isProvider ? null : await seekerBookingFor(listing._id, user._id);

  const requireProvider = () => {
    if (!isProvider) throw new ApiError(403, "FORBIDDEN", "Only the provider can do this.");
  };
  const requireSeeker = () => {
    if (!myBooking || !ACTIVE_BOOKING_STATUSES.includes(myBooking.status as never)) {
      throw new ApiError(409, "BAD_STATE", "This booking is already closed.");
    }
    return myBooking;
  };

  const limit = LIMITS[action];
  if (limit) await rateLimit(`${action}:${user._id}`, ...limit);

  let extra: Record<string, unknown> = {};
  switch (action) {
    // ---- seeker ----
    case "hold": {
      extra = { heldUntil: (await holdSpot(user, listing._id)).toISOString() };
      break;
    }
    case "release": {
      await releaseHold(user, listing._id);
      return Response.json({ ok: true });
    }
    case "grab": {
      const method = str(body.paymentMethod, 10) as PaymentMethod;
      if (!PAYMENT_METHODS.includes(method)) throw new ApiError(400, "BAD_METHOD", "Choose a payment method.");
      const label = method === "card" ? await resolveCard(user._id, user.isGuest, body) : undefined;
      listing = (await grabSpot(user, id, method, label, str(body.vehicle, 120) || undefined)).listing;
      break;
    }
    case "arrive": {
      listing = (await seekerArrived(requireSeeker())).listing;
      break;
    }
    case "complete": {
      const b = requireSeeker();
      if (b.status === "MATCHED") await seekerArrived(b);
      const r = await completeHandover(listing._id, ["SEEKER_ARRIVED"]);
      if (!r) throw new ApiError(409, "BAD_STATE", "This handover is already closed.");
      listing = r.listing;
      break;
    }
    case "report": {
      const reason = oneOf(REPORT_REASONS, str(body.reason, 80), "Choose what went wrong.");
      extra = await reportProblem(user, requireSeeker(), reason, str(body.details, 1000));
      break;
    }
    case "cancel_booking": {
      const reason = str(body.reason, 80);
      if (reason) oneOf(SEEKER_CANCEL_REASONS, reason, "Choose a reason.");
      extra = await seekerCancel(user, requireSeeker(), reason);
      break;
    }
    // ---- provider ----
    case "leaving": {
      requireProvider();
      await providerLeaving(listing);
      break;
    }
    case "extend": {
      requireProvider();
      const minutes = int(body.minutes);
      listing = await extendListing(user, listing, Number.isFinite(minutes) ? Math.min(Math.max(minutes, 5), 30) : undefined);
      break;
    }
    case "provider_report": {
      requireProvider();
      const reason = oneOf(PROVIDER_REPORT_REASONS, str(body.reason, 80), "Choose what went wrong.");
      extra = await providerReport(user, listing, reason, str(body.details, 1000));
      break;
    }
    case "cancel": {
      requireProvider();
      const reasons = Array.isArray(body.reasons)
        ? body.reasons.filter((r): r is string => CANCEL_REASONS.includes(r as never))
        : [];
      const details = str(body.details, 1000);
      if (!reasons.length && !details) throw new ApiError(400, "BAD_REASON", "Tell us why you changed your mind.");
      const r = await cancelListing(user, listing, reasons, details);
      extra = { penalty: r.penalty };
      break;
    }
    default:
      throw new ApiError(404, "NOT_FOUND", "Unknown action.");
  }

  const fresh = (await Listing.findById(listing._id)) ?? listing;
  const view = await transactionView(fresh, user);
  return Response.json({
    kind: view ? "transaction" : "spot",
    ...(view ?? {}),
    result: { ...extra, balance: await getBalance(user._id) },
  });
});
