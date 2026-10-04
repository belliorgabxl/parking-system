import { ApiError, handler, readJson } from "@/lib/api";
import { advanceListing, transactionView } from "@/lib/engine";
import { Building, Listing } from "@/lib/models";
import { getOrCreateUser, getUser } from "@/lib/session";
import { validateSpot } from "@/lib/spot-input";
import { connectDB } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  await connectDB();
  const found = await Listing.findById(id);
  if (!found) throw new ApiError(404, "NOT_FOUND", "This spot no longer exists.");
  return advanceListing(found);
}

/**
 * Participants (provider / the seeker's own booking) get the full transaction view.
 * Anyone else gets the public spot detail (no car plate) while it is still open.
 */
export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await getUser();
  const listing = await load(id);
  const view = user ? await transactionView(listing, user) : null;
  if (view) return Response.json({ kind: "transaction", ...view });

  if (listing.status !== "OPEN") throw new ApiError(410, "SPOT_TAKEN", "Sorry, this spot is no longer available.");
  const building = await Building.findById(listing.buildingId).lean();
  const heldLive = !!listing.heldBy && !!listing.heldUntil && listing.heldUntil.getTime() > Date.now();
  const heldByMe = heldLive && !!user && listing.heldBy!.equals(user._id);
  const heldByOther = heldLive && !heldByMe;
  return Response.json({
    kind: "spot",
    serverNow: new Date().toISOString(),
    spot: {
      id: String(listing._id),
      building: building?.name ?? "",
      floor: listing.floor,
      zone: listing.zone,
      entrance: listing.entrance,
      landmark: listing.landmark,
      descriptionText: listing.descriptionText,
      spotType: listing.spotType,
      carSize: listing.carSize,
      isLadyBay: listing.isLadyBay,
      leaveAt: listing.leaveAt.toISOString(),
      price: listing.price,
      heldByOther,
      heldUntil: heldByOther ? listing.heldUntil!.toISOString() : null,
      heldByMe: heldByMe ? listing.heldUntil!.toISOString() : null,
    },
  });
});

/** Provider edits the spot details while still looking for a driver. */
export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await getOrCreateUser();
  const listing = await load(id);
  if (!listing.providerId.equals(user._id)) throw new ApiError(403, "FORBIDDEN", "Not your listing.");
  const spot = validateSpot(await readJson(req));
  const updated = await Listing.findOneAndUpdate(
    { _id: listing._id, status: "OPEN" },
    { $set: spot },
    { returnDocument: "after" },
  );
  if (!updated) throw new ApiError(409, "BAD_STATE", "A driver is already matched — details can't be changed now.");
  return Response.json({ kind: "transaction", ...(await transactionView(updated, user)) });
});
