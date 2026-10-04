import { ApiError, handler, readJson } from "@/lib/api";
import { adminLog, requireAdmin } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import { parseBuilding } from "@/lib/building-input";
import { Building, Listing } from "@/lib/models";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  await requireAdmin(req);
  await connectDB();
  const { id } = await params;
  const data = parseBuilding(await readJson(req), true);
  const b = await Building.findByIdAndUpdate(id, { $set: data }, { returnDocument: "after" });
  if (!b) throw new ApiError(404, "NOT_FOUND", "Building not found.");
  await adminLog(req, "building.update", id, data);
  return Response.json({ ok: true });
});

/** Hard delete if never used; otherwise deactivate (history keeps pointing at it). */
export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  await requireAdmin(req);
  await connectDB();
  const { id } = await params;
  if (await Listing.exists({ buildingId: id, status: { $in: ["OPEN", "MATCHED", "SEEKER_ARRIVED"] }, isBotListing: false })) {
    throw new ApiError(409, "IN_USE", "This building has live handovers. Try again when they finish.");
  }
  await Listing.updateMany(
    { buildingId: id, status: "OPEN", isBotListing: true },
    { $set: { status: "EXPIRED", closedAt: new Date() } },
  );
  await adminLog(req, "building.delete", id);
  const used = await Listing.exists({ buildingId: id, isBotListing: false });
  if (used) {
    await Building.updateOne({ _id: id }, { $set: { isActive: false } });
    return Response.json({ ok: true, deactivated: true });
  }
  await Listing.deleteMany({ buildingId: id, isBotListing: true });
  const r = await Building.deleteOne({ _id: id });
  if (!r.deletedCount) throw new ApiError(404, "NOT_FOUND", "Building not found.");
  return Response.json({ ok: true, deleted: true });
});
