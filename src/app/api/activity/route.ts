import { handler } from "@/lib/api";
import { spotName } from "@/lib/engine";
import { Booking, Building, Listing } from "@/lib/models";
import { getUser } from "@/lib/session";

/** The user's handovers as provider and seeker, newest first. */
export const GET = handler(async () => {
  const user = await getUser();
  if (!user) return Response.json({ items: [] });
  const [bookings, provided] = await Promise.all([
    Booking.find({ seekerId: user._id }).sort({ createdAt: -1 }).limit(30).lean(),
    Listing.find({ providerId: user._id }).sort({ createdAt: -1 }).limit(30).lean(),
  ]);
  const parked = await Listing.find({ _id: { $in: bookings.map((b) => b.listingId) } }).lean();
  const parkedById = new Map(parked.map((l) => [String(l._id), l]));
  const all = [...provided, ...parked];
  const buildings = new Map(
    (await Building.find({ _id: { $in: all.map((l) => l.buildingId) } }).lean()).map((b) => [String(b._id), b.name]),
  );

  const items = [
    ...provided.map((l) => ({
      key: `p-${l._id}`,
      listingId: String(l._id),
      role: "provider" as const,
      status: l.status,
      spot: spotName(l),
      building: buildings.get(String(l.buildingId)) ?? "",
      amount: l.providerEarning,
      at: l.createdAt,
    })),
    ...bookings.flatMap((b) => {
      const l = parkedById.get(String(b.listingId));
      if (!l) return [];
      return [
        {
          key: `s-${b._id}`,
          listingId: String(l._id),
          role: "seeker" as const,
          status: b.status, // the seeker's own outcome
          spot: spotName(l),
          building: buildings.get(String(l.buildingId)) ?? "",
          amount: b.amountHeld,
          at: b.createdAt,
        },
      ];
    }),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

  return Response.json({ items });
});
