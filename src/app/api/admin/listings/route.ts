import { handler } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import { spotName, sweepDue } from "@/lib/engine";
import { Booking, Building, Listing, User } from "@/lib/models";

/** Live handovers (real users only) for support. */
export const GET = handler(async (req: Request) => {
  await requireAdmin(req);
  await connectDB();
  await sweepDue(true);
  const listings = await Listing.find({
    status: { $in: ["OPEN", "MATCHED", "SEEKER_ARRIVED"] },
    $or: [{ isBotListing: false }, { bookingId: { $ne: null } }],
  })
    .sort({ leaveAt: 1 })
    .limit(100)
    .lean();
  const bookings = new Map(
    (await Booking.find({ _id: { $in: listings.map((l) => l.bookingId).filter(Boolean) } }).lean()).map((b) => [
      String(b._id),
      b,
    ]),
  );
  const userIds = [...listings.map((l) => l.providerId), ...[...bookings.values()].map((b) => b.seekerId)];
  const users = new Map((await User.find({ _id: { $in: userIds } }).lean()).map((u) => [String(u._id), u.displayName]));
  const buildings = new Map((await Building.find().lean()).map((b) => [String(b._id), b.name]));
  return Response.json({
    listings: listings.map((l) => {
      const b = l.bookingId ? bookings.get(String(l.bookingId)) : null;
      return {
        id: String(l._id),
        status: l.status,
        spot: spotName(l),
        building: buildings.get(String(l.buildingId)) ?? "",
        provider: users.get(String(l.providerId)) ?? "?",
        seeker: b ? (users.get(String(b.seekerId)) ?? "?") : null,
        price: l.price,
        leaveAt: l.leaveAt,
      };
    }),
  });
});
