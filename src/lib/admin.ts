import "server-only";
import { timingSafeEqual } from "crypto";
import { ApiError } from "./api";
import { connectDB } from "./db";
import { AdminLog } from "./models";
import { clientIp, MINUTE, rateLimit } from "./ratelimit";

/**
 * Ops endpoints are guarded by the ADMIN_KEY env var, sent as the `x-admin-key` header.
 * Wrong keys are rate limited per IP so the key can't be brute-forced.
 * (For a real team, replace with per-person accounts + 2FA.)
 */
export async function requireAdmin(req: Request) {
  const key = process.env.ADMIN_KEY;
  if (!key) throw new ApiError(503, "ADMIN_DISABLED", "Set ADMIN_KEY in your env to enable the admin console.");
  await connectDB();
  const given = Buffer.from(req.headers.get("x-admin-key") ?? "");
  const want = Buffer.from(key);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    await rateLimit(`admin-fail:${clientIp(req)}`, 10, 15 * MINUTE, "Too many wrong admin keys. Try again later.");
    throw new ApiError(401, "UNAUTHORIZED", "Wrong admin key.");
  }
}

/** Append-only record of every admin action. */
export async function adminLog(req: Request, action: string, target: string, details: Record<string, unknown> | null = null) {
  await AdminLog.create({ action, target, ip: clientIp(req), details });
}
