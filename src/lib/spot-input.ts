import "server-only";
import { ApiError, str } from "./api";
import { CAR_SIZES, SPOT_TYPES, type CarSize, type SpotType } from "./constants";
import { MAX_LEAVE_MINUTES, MIN_LEAVE_MINUTES } from "./pricing";
import { parseVehicleText } from "./vehicles";

/** Validates the provider's spot description (create and edit). */
export function validateSpot(body: Record<string, unknown>) {
  const floor = str(body.floor, 20);
  const zone = str(body.zone, 20);
  const vehicle = str(body.vehicle, 120);
  if (!floor || !zone) throw new ApiError(400, "MISSING_SPOT", "Please choose your floor and zone.");
  if (!vehicle) throw new ApiError(400, "MISSING_CAR", "Please add your car info so the seeker can find you.");
  const leaveAt = new Date(str(body.leaveAt, 40));
  const minutes = (leaveAt.getTime() - Date.now()) / 60_000;
  if (Number.isNaN(minutes) || minutes < MIN_LEAVE_MINUTES - 1 || minutes > MAX_LEAVE_MINUTES + 1) {
    throw new ApiError(400, "BAD_LEAVE_TIME", `Leave time must be ${MIN_LEAVE_MINUTES}–${MAX_LEAVE_MINUTES} minutes from now.`);
  }
  return {
    floor,
    zone,
    entrance: str(body.entrance, 80),
    landmark: str(body.landmark, 80),
    descriptionText: str(body.descriptionText, 300),
    vehicleSnapshot: parseVehicleText(vehicle),
    spotType: SPOT_TYPES.includes(body.spotType as SpotType) ? (body.spotType as SpotType) : "indoor",
    carSize: CAR_SIZES.includes(body.carSize as CarSize) ? (body.carSize as CarSize) : "any",
    leaveAt,
  };
}
