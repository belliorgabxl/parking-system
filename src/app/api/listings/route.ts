import { ApiError, handler, int, readJson, str } from "@/lib/api";
import { activeFor, assertCanTransact, transactionView } from "@/lib/engine";
import { getBuilding, getDemand } from "@/lib/market";
import { Listing } from "@/lib/models";
import { GUEST_OFFER_LIMIT, quote } from "@/lib/pricing";
import { HOUR, rateLimit } from "@/lib/ratelimit";
import { SIMULATION_ON } from "@/lib/seed";
import { getOrCreateUser } from "@/lib/session";
import { validateSpot } from "@/lib/spot-input";
import { rememberVehicle } from "@/lib/vehicles";

export const POST = handler(async (req: Request) => {
  const body = await readJson(req);
  const user = await getOrCreateUser();
  await assertCanTransact(user);
  // Concurrency rule: at most one active provider listing per user (spec §5) — also enforced by a unique index.
  const { listing: active } = await activeFor(user._id);
  if (active) throw new ApiError(409, "ACTIVE_LISTING", "You're already offering a spot.", { listingId: String(active._id) });
  if (user.isGuest && (await Listing.countDocuments({ providerId: user._id })) >= GUEST_OFFER_LIMIT) {
    throw new ApiError(401, "LOGIN_REQUIRED", "Log in with your phone number to offer another spot.");
  }
  await rateLimit(`offer:${user._id}`, 10, HOUR, "You've offered a lot of spots this hour. Try again later.");

  const building = await getBuilding(str(body.buildingId, 40));
  const spot = validateSpot(body);
  const isLadyBay = body.isLadyBay === true;
  const demand = await getDemand(building);
  const { price, providerEarning } = quote(demand.level, isLadyBay);
  const expectedEarning = int(body.expectedEarning);
  if (Number.isFinite(expectedEarning) && expectedEarning > providerEarning) {
    // Demand dropped between quote and confirm — let the client re-confirm the lower amount.
    throw new ApiError(409, "PRICE_CHANGED", `Demand changed. You'll now earn ฿${providerEarning}.`, { providerEarning, price });
  }

  let listing;
  try {
    listing = await Listing.create({
      ...spot,
      providerId: user._id,
      activeProviderId: user._id,
      buildingId: building._id,
      isLadyBay,
      price,
      providerEarning,
      simulateSeeker: SIMULATION_ON && body.simulateSeeker !== false,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new ApiError(409, "ACTIVE_LISTING", "You're already offering a spot.");
    throw err;
  }

  if (!user.isGuest) await rememberVehicle(user._id, spot.vehicleSnapshot.text);
  if (user.lastParked) {
    user.lastParked = null;
    await user.save();
  }
  return Response.json(await transactionView(listing, user), { status: 201 });
});
