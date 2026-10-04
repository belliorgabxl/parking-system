import "server-only";
import type { Types } from "mongoose";
import { ApiError } from "./api";
import { Vehicle } from "./models";

export const MAX_VEHICLES = 5;

/** Best-effort split of free text like "Toyota Yaris, Red, AB1460". */
export function parseVehicleText(text: string) {
  const parts = text
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return { makeModel: parts[0] ?? "", color: parts[1] ?? "", plate: parts.slice(2).join(", "), text: text.trim() };
}

type VehicleLean = {
  _id: Types.ObjectId;
  makeModel?: string | null;
  color?: string | null;
  plate?: string | null;
  text: string;
  isDefault?: boolean | null;
};
export const vehicleView = (v: VehicleLean) => ({
  id: String(v._id),
  makeModel: v.makeModel ?? "",
  color: v.color ?? "",
  plate: v.plate ?? "",
  text: v.text,
  isDefault: !!v.isDefault,
});
export type VehicleView = ReturnType<typeof vehicleView>;

export async function listVehicles(userId: Types.ObjectId) {
  const rows = await Vehicle.find({ userId }).sort({ isDefault: -1, updatedAt: -1 }).lean();
  return rows.map(vehicleView);
}

/** Default (or most recently used) vehicle — used as the seeker's car snapshot. */
export async function getUserVehicle(userId: Types.ObjectId) {
  const v = await Vehicle.findOne({ userId }).sort({ isDefault: -1, updatedAt: -1 }).lean();
  return v ? { makeModel: v.makeModel ?? "", color: v.color ?? "", plate: v.plate ?? "", text: v.text } : null;
}

export async function setDefaultVehicle(userId: Types.ObjectId, id: Types.ObjectId | string) {
  await Vehicle.updateMany({ userId, _id: { $ne: id } }, { $set: { isDefault: false } });
  await Vehicle.updateOne({ userId, _id: id }, { $set: { isDefault: true } });
}

export async function addVehicle(userId: Types.ObjectId, text: string, makeDefault = false) {
  const parsed = parseVehicleText(text);
  if (!parsed.makeModel) throw new ApiError(400, "BAD_VEHICLE", "Enter at least the car make and model.");
  const count = await Vehicle.countDocuments({ userId });
  if (count >= MAX_VEHICLES) throw new ApiError(400, "TOO_MANY", `You can save up to ${MAX_VEHICLES} cars.`);
  const v = await Vehicle.create({ ...parsed, userId, isDefault: makeDefault || count === 0 });
  if (v.isDefault) await setDefaultVehicle(userId, v._id);
  return v;
}

/** Remember the car used for an offer: reuse a matching saved car or add it (logged-in users only). */
export async function rememberVehicle(userId: Types.ObjectId, text: string) {
  const parsed = parseVehicleText(text);
  const existing = await Vehicle.findOne({ userId, text: parsed.text });
  if (existing) {
    existing.set({ updatedAt: new Date() });
    await existing.save();
    return existing;
  }
  if ((await Vehicle.countDocuments({ userId })) >= MAX_VEHICLES) return null;
  return addVehicle(userId, text);
}
