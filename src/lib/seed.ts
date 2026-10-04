import "server-only";
import { Building, Listing, User, type BuildingDoc } from "./models";
import { newToken } from "./session";
import { quote } from "./pricing";
import type { CarSize, DemandLevel, SpotType } from "./constants";

export { SIMULATION_ON } from "./flags";
import { SIMULATION_ON } from "./flags";

const BUILDINGS = [
  {
    name: "Samyan Mitrtown",
    shortName: "Samyan",
    floors: ["B1", "B2", "B3", "B4", "Rooftop"],
    zones: ["A", "B", "C", "D"],
    entrances: ["Starbucks entrance", "MRT Sam Yan exit", "Main lobby", "Rama 4 gate"],
    landmarks: ["Red elevator", "Blue pillar", "EV chargers", "Payment kiosk", "Stairwell 3"],
    baseSeekers: 24,
  },
  {
    name: "Siam Paragon",
    shortName: "Paragon",
    floors: ["P1", "P2", "P3", "P4", "P5"],
    zones: ["A", "B", "C", "D", "E"],
    entrances: ["Gourmet Market entrance", "BTS Siam link", "Main hall", "Rama 1 gate"],
    landmarks: ["Glass lift", "Green pillar", "Valet desk", "Ticket machine"],
    baseSeekers: 30,
  },
  {
    name: "CentralWorld",
    shortName: "CTW",
    floors: ["B1", "B2", "3", "4", "5", "6"],
    zones: ["A", "B", "C"],
    entrances: ["Zen entrance", "Isetan side", "Groove entrance", "Ratchaprasong skywalk"],
    landmarks: ["Yellow elevator", "Car wash", "Column 12", "Parking office"],
    baseSeekers: 18,
  },
];

const BOT_PROVIDERS = [
  { name: "Somchai", car: { makeModel: "Toyota Yaris", color: "Red", plate: "AB1460" } },
  { name: "Nida", car: { makeModel: "Mazda 2", color: "Grey", plate: "2KT 8812" } },
  { name: "Arthit", car: { makeModel: "Honda Civic", color: "Black", plate: "9GH 4410" } },
  { name: "Ploy", car: { makeModel: "Toyota Fortuner", color: "White", plate: "1NG 7007" } },
  { name: "Krit", car: { makeModel: "Nissan Almera", color: "Silver", plate: "5BB 3021" } },
];
export const BOT_SEEKERS = [
  { name: "Kittipong", car: { makeModel: "Honda City", color: "White", plate: "7KK 2468" } },
  { name: "Mali", car: { makeModel: "Suzuki Swift", color: "Blue", plate: "3PP 1357" } },
  { name: "Thanawat", car: { makeModel: "Isuzu MU-X", color: "Bronze", plate: "8TT 9090" } },
];

export function carText(c: { makeModel: string; color: string; plate: string }) {
  return `${c.makeModel}, ${c.color}, ${c.plate}`;
}

let seeded = false;
export async function ensureBuildings() {
  if (seeded) return;
  // Seed only an empty collection so buildings removed in /admin stay removed.
  if (!(await Building.estimatedDocumentCount())) {
    for (const b of BUILDINGS) {
      await Building.updateOne({ name: b.name }, { $setOnInsert: b }, { upsert: true });
    }
  }
  seeded = true;
}

export async function getBotUser(name: string) {
  const existing = await User.findOne({ isBot: true, displayName: name });
  if (existing) return existing;
  return User.create({ isBot: true, isGuest: false, displayName: name, sessionToken: `bot_${newToken()}` });
}

const pick = <T>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

/** Keep a few simulated provider spots open per building so the seeker flow always has something to grab. */
export async function topUpBotListings(building: BuildingDoc, demand: DemandLevel, target = 4) {
  if (!SIMULATION_ON) return;
  const open = await Listing.countDocuments({ buildingId: building._id, status: "OPEN", isBotListing: true });
  for (let i = open; i < target; i++) {
    const bot = pick(BOT_PROVIDERS);
    const user = await getBotUser(bot.name);
    const floor = pick(building.floors);
    const isRooftop = /roof/i.test(floor);
    const spotType: SpotType = isRooftop ? "rooftop" : "indoor";
    const carSize: CarSize = isRooftop ? "any" : pick(["any", "sedan", "suv", "compact"] as const);
    const isLadyBay = Math.random() < 0.15;
    const { price, providerEarning } = quote(demand, isLadyBay);
    await Listing.create({
      providerId: user._id,
      buildingId: building._id,
      floor,
      zone: isRooftop ? "R" : pick(building.zones),
      entrance: pick(building.entrances),
      landmark: pick(building.landmarks),
      vehicleSnapshot: { ...bot.car, text: carText(bot.car) },
      spotType,
      carSize,
      isLadyBay,
      leaveAt: new Date(Date.now() + (12 + Math.floor(Math.random() * 30)) * 60_000),
      price,
      providerEarning,
      isBotListing: true,
    });
  }
}
