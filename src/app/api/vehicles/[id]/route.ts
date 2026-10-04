import { ApiError, handler, readJson, str } from "@/lib/api";
import { Vehicle } from "@/lib/models";
import { getOrCreateUser } from "@/lib/session";
import { listVehicles, parseVehicleText, setDefaultVehicle } from "@/lib/vehicles";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await getOrCreateUser();
  const body = await readJson(req);
  const v = await Vehicle.findOne({ _id: id, userId: user._id });
  if (!v) throw new ApiError(404, "NOT_FOUND", "Car not found.");
  if (typeof body.text === "string") {
    const parsed = parseVehicleText(str(body.text, 120));
    if (!parsed.makeModel) throw new ApiError(400, "BAD_VEHICLE", "Enter at least the car make and model.");
    v.set(parsed);
    await v.save();
  }
  if (body.isDefault === true) await setDefaultVehicle(user._id, v._id);
  return Response.json({ vehicles: await listVehicles(user._id) });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await getOrCreateUser();
  const v = await Vehicle.findOneAndDelete({ _id: id, userId: user._id });
  if (!v) throw new ApiError(404, "NOT_FOUND", "Car not found.");
  if (v.isDefault) {
    const next = await Vehicle.findOne({ userId: user._id }).sort({ updatedAt: -1 });
    if (next) await setDefaultVehicle(user._id, next._id);
  }
  return Response.json({ vehicles: await listVehicles(user._id) });
});
