import type { NextRequest } from "next/server";
import { handler } from "@/lib/api";
import { buildingView, marketFor } from "@/lib/market";
import { Listing } from "@/lib/models";
import { MAX_PROVIDER_EARNING } from "@/lib/pricing";
import { getUser } from "@/lib/session";
import { spotName, sweepDue } from "@/lib/engine";

export const GET = handler(async (req: NextRequest) => {
  const user = await getUser();
  await sweepDue();
  const { building, demand, quote } = await marketFor(req.nextUrl.searchParams.get("buildingId"));

  // "Best" = soonest to free up first, then cheapest; never show the viewer their own listing.
  const spots = await Listing.find({
    buildingId: building._id,
    status: "OPEN",
    ...(user ? { providerId: { $ne: user._id } } : {}),
    leaveAt: { $gt: new Date() },
    // Hide spots another seeker is paying for right now.
    $or: [{ heldBy: null }, ...(user ? [{ heldBy: user._id }] : []), { heldUntil: { $lt: new Date() } }],
  })
    .sort({ leaveAt: 1, price: 1 })
    .limit(30)
    .lean();

  return Response.json({
    serverNow: new Date().toISOString(),
    building: buildingView(building),
    demand,
    earnUpTo: Math.min(MAX_PROVIDER_EARNING, quote(true).providerEarning),
    spots: spots.map((s) => ({
      id: String(s._id),
      title: `${s.floor} · Zone ${s.zone}`,
      name: spotName(s),
      floor: s.floor,
      zone: s.zone,
      spotType: s.spotType,
      carSize: s.carSize,
      isLadyBay: s.isLadyBay,
      leaveAt: s.leaveAt.toISOString(),
      price: s.price,
    })),
  });
});
