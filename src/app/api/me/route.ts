import { cookies } from "next/headers";
import { ApiError, handler, readJson, str } from "@/lib/api";
import { listPayments } from "@/lib/cards";
import { activeFor, sweepDue } from "@/lib/engine";
import { getBalance, getBalances } from "@/lib/ledger";
import { Building, Listing, Notification, SavedPayment, User, Vehicle, type UserDoc } from "@/lib/models";
import { GUEST_OFFER_LIMIT } from "@/lib/pricing";
import { unreadCount } from "@/lib/notify";
import { getOrCreateUser, getUser, hashToken, newToken, SESSION_COOKIE } from "@/lib/session";
import { SIMULATION_ON } from "@/lib/seed";
import { listVehicles } from "@/lib/vehicles";

/** Visitor who hasn't done anything yet: no DB row is created just for looking around. */
function anonymousView() {
  return {
    user: {
      id: "",
      displayName: "Guest",
      phone: null as string | null | undefined,
      isGuest: true,
      isBanned: false,
      standingScore: 100,
      payoutName: null as string | null | undefined,
    },
    balance: 0,
    withdrawable: 0,
    canOffer: true,
    vehicle: null,
    vehicles: [] as Awaited<ReturnType<typeof listVehicles>>,
    payments: [] as Awaited<ReturnType<typeof listPayments>>,
    unread: 0,
    active: {
      listing: null as { id: string; status: string } | null,
      booking: null as { listingId: string; status: string } | null,
    },
    lastParked: null as null | {
      buildingId: string;
      buildingName: string;
      floor: string;
      zone: string;
      entrance: string;
      landmark: string;
      at: string;
    },
    simulation: SIMULATION_ON,
  };
}

async function meView(existing?: UserDoc | null) {
  const user = existing === undefined ? await getUser() : existing;
  await sweepDue();
  if (!user) return anonymousView();
  const [{ balance, withdrawable }, vehicles, payments, active, unread, offers] = await Promise.all([
    getBalances(user._id),
    listVehicles(user._id),
    listPayments(user._id),
    activeFor(user._id),
    unreadCount(user._id),
    user.isGuest ? Listing.countDocuments({ providerId: user._id }) : 0,
  ]);
  let lastParked = null;
  // Offer "leave this spot" only for a recent park and when not already offering one.
  if (user.lastParked?.at && Date.now() - user.lastParked.at.getTime() < 12 * 60 * 60_000 && !active.listing) {
    const b = await Building.findById(user.lastParked.buildingId).lean();
    lastParked = {
      buildingId: String(user.lastParked.buildingId),
      buildingName: b?.name ?? "",
      floor: user.lastParked.floor ?? "",
      zone: user.lastParked.zone ?? "",
      entrance: user.lastParked.entrance ?? "",
      landmark: user.lastParked.landmark ?? "",
      at: user.lastParked.at.toISOString(),
    };
  }
  return {
    user: {
      id: String(user._id),
      displayName: user.displayName,
      phone: user.phone,
      isGuest: user.isGuest,
      isBanned: user.isBanned,
      standingScore: user.standingScore,
      payoutName: user.payoutName,
    },
    balance,
    withdrawable,
    /** Guests can offer once before logging in. */
    canOffer: !user.isGuest || offers < GUEST_OFFER_LIMIT,
    vehicle: vehicles[0] ?? null,
    vehicles,
    payments,
    unread,
    active: {
      listing: active.listing ? { id: String(active.listing._id), status: active.listing.status } : null,
      booking: active.booking ? { listingId: String(active.booking.listingId), status: active.booking.status } : null,
    },
    lastParked,
    simulation: SIMULATION_ON,
  };
}
export type MeView = Awaited<ReturnType<typeof meView>>;

export const GET = handler(async () => Response.json(await meView()));

/** Update profile name / dismiss the "offer your last spot" card. */
export const PATCH = handler(async (req: Request) => {
  const body = await readJson(req);
  const user = await getOrCreateUser();
  if ("displayName" in body) {
    const name = str(body.displayName, 40);
    if (name.length < 2) throw new ApiError(400, "BAD_NAME", "Name must be at least 2 characters.");
    user.displayName = name;
  }
  if (body.dismissLastParked === true) user.lastParked = null;
  await user.save();
  return Response.json(await meView(user));
});

/**
 * Delete account (PDPA): only with no live handover and a zero balance. Personal data is removed;
 * the ledger keeps anonymised rows for accounting.
 */
export const DELETE = handler(async () => {
  const user = await getOrCreateUser();
  // A suspended person can't wipe their record and sign up again with the same phone.
  if (user.isBanned) throw new ApiError(403, "ACCOUNT_SUSPENDED", "Suspended accounts can't be deleted. Please contact support.");
  const active = await activeFor(user._id);
  if (active.listing || active.booking)
    throw new ApiError(409, "ACTIVE_HANDOVER", "Finish or cancel your current handover first.");
  const balance = await getBalance(user._id);
  if (balance > 0) throw new ApiError(409, "BALANCE_LEFT", `Withdraw your ${balance.toLocaleString()} THB balance first.`);
  if (balance < 0) throw new ApiError(409, "BALANCE_OWED", "Please settle your negative balance first.");
  await Promise.all([
    Vehicle.deleteMany({ userId: user._id }),
    SavedPayment.deleteMany({ userId: user._id }),
    Notification.deleteMany({ userId: user._id }),
  ]);
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        phone: null,
        displayName: "Deleted user",
        isGuest: true,
        deletedAt: new Date(),
        lastParked: null,
        sessionToken: hashToken(`deleted_${newToken()}`),
      },
    },
  );
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
});
