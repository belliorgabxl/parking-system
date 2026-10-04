import type { NextRequest } from "next/server";
import { handler } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { getBuilding, getDemand } from "@/lib/market";
import { quote } from "@/lib/pricing";

export const GET = handler(async (req: NextRequest) => {
  await connectDB();
  const sp = req.nextUrl.searchParams;
  const building = await getBuilding(sp.get("buildingId"));
  const demand = await getDemand(building);
  return Response.json({ demand, ...quote(demand.level, sp.get("lady") === "1") });
});
