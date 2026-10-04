import "server-only";
import { Building, Listing, type BuildingDoc } from "./models";
import { demandLevel, quote } from "./pricing";
import { ensureBuildings, topUpBotListings } from "./seed";
import { expireStaleOpen } from "./engine";
import { ApiError } from "./api";
import type { DemandLevel } from "./constants";

export async function getBuilding(id?: string | null): Promise<BuildingDoc> {
  await ensureBuildings();
  const b = id ? await Building.findOne({ _id: id, isActive: { $ne: false } }).catch(() => null) : null;
  const building = b ?? (await Building.findOne({ isActive: { $ne: false } }).sort({ createdAt: 1 }));
  if (!building) throw new ApiError(500, "NO_BUILDINGS", "No buildings configured.");
  return building;
}

/**
 * Drivers searching = a time-of-day baseline for the mall + real recent bookings.
 * (No live seeker telemetry yet; replace with "users browsing this building in the last N minutes".)
 */
export async function getDemand(building: BuildingDoc) {
  const hour = new Date().getHours();
  const peak = hour >= 11 && hour <= 20 ? 1 : 0.5;
  // Recently matched listings in this building = real seekers who grabbed a spot lately.
  const recentBookings = await Listing.countDocuments({
    buildingId: building._id,
    bookingId: { $ne: null },
    updatedAt: { $gt: new Date(Date.now() - 30 * 60_000) },
  });
  const seekers = Math.round((building.baseSeekers ?? 12) * peak) + recentBookings;
  const spots = await Listing.countDocuments({ buildingId: building._id, status: "OPEN" });
  const level: DemandLevel = demandLevel(seekers, spots);
  return { level, seekers, spots };
}

// Bot top-up is throttled per building so Home polling stays cheap.
const lastTopUp = new Map<string, number>();

export async function marketFor(buildingId?: string | null) {
  const building = await getBuilding(buildingId);
  await expireStaleOpen(building._id);
  let demand = await getDemand(building);
  const key = String(building._id);
  if (Date.now() - (lastTopUp.get(key) ?? 0) > 20_000) {
    lastTopUp.set(key, Date.now());
    await topUpBotListings(building, demand.level);
    demand = await getDemand(building);
  }
  return { building, demand, quote: (lady: boolean) => quote(demand.level, lady) };
}

export function buildingView(b: BuildingDoc) {
  return {
    id: String(b._id),
    name: b.name,
    shortName: b.shortName ?? b.name,
    floors: b.floors,
    zones: b.zones,
    entrances: b.entrances,
    landmarks: b.landmarks,
  };
}
