import { handler } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { buildingView } from "@/lib/market";
import { Building } from "@/lib/models";
import { ensureBuildings } from "@/lib/seed";

export const GET = handler(async () => {
  await connectDB();
  await ensureBuildings();
  const buildings = await Building.find({ isActive: { $ne: false } }).sort({ createdAt: 1 });
  return Response.json({ buildings: buildings.map(buildingView) });
});
