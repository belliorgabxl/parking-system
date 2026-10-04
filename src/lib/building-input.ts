import "server-only";
import { ApiError, str } from "./api";

/** Validates admin building create / edit payloads. Lists accept arrays or comma-separated strings. */
export function parseBuilding(body: Record<string, unknown>, partial = false) {
  const list = (v: unknown) =>
    (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [])
      .map((x) => String(x).trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 30);
  const out: Record<string, unknown> = {};
  if (!partial || "name" in body) {
    const name = str(body.name, 60);
    if (!name) throw new ApiError(400, "BAD_NAME", "Building name is required.");
    out.name = name;
  }
  if ("shortName" in body) out.shortName = str(body.shortName, 20);
  for (const k of ["floors", "zones", "entrances", "landmarks"] as const) {
    if (!partial || k in body) out[k] = list(body[k]);
  }
  if (!partial && (!(out.floors as string[]).length || !(out.zones as string[]).length)) {
    throw new ApiError(400, "BAD_LAYOUT", "Add at least one floor and one zone.");
  }
  if ("baseSeekers" in body) out.baseSeekers = Math.max(0, Math.min(500, Number(body.baseSeekers) || 0));
  if ("isActive" in body) out.isActive = body.isActive !== false;
  return out;
}
