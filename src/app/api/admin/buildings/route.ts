import { ApiError, handler, readJson } from "@/lib/api";
import { parseBuilding } from "@/lib/building-input";
import { adminLog, requireAdmin } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import { Building, Listing } from "@/lib/models";
import { ensureBuildings } from "@/lib/seed";

export const GET = handler(async (req: Request) => {
  await requireAdmin(req);
  await connectDB();
  await ensureBuildings();
  const buildings = await Building.find().sort({ createdAt: 1 }).lean();
  const live = new Map(
    (
      await Listing.aggregate<{ _id: unknown; n: number }>([
        { $match: { status: { $in: ["OPEN", "MATCHED", "SEEKER_ARRIVED"] } } },
        { $group: { _id: "$buildingId", n: { $sum: 1 } } },
      ])
    ).map((r) => [String(r._id), r.n]),
  );
  return Response.json({
    buildings: buildings.map((b) => ({
      id: String(b._id),
      name: b.name,
      shortName: b.shortName ?? "",
      floors: b.floors,
      zones: b.zones,
      entrances: b.entrances,
      landmarks: b.landmarks,
      baseSeekers: b.baseSeekers,
      isActive: b.isActive !== false,
      liveListings: live.get(String(b._id)) ?? 0,
    })),
  });
});

export const POST = handler(async (req: Request) => {
  await requireAdmin(req);
  await connectDB();
  const data = parseBuilding(await readJson(req));
  if (await Building.exists({ name: data.name }))
    throw new ApiError(409, "DUPLICATE", "A building with this name already exists.");
  const b = await Building.create(data);
  await adminLog(req, "building.create", String(b._id), { name: data.name });
  return Response.json({ id: String(b._id) }, { status: 201 });
});
