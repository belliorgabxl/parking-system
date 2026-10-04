import "server-only";
import { ApiError } from "./api";
import { RateLimit } from "./models";

/**
 * Fixed-window rate limit stored in MongoDB so it holds across serverless instances.
 * Throws 429 once `limit` hits within `windowMs` for `key`.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  message = "Too many attempts. Please wait a moment.",
) {
  const now = new Date();
  let doc = await RateLimit.findOneAndUpdate({ key, resetAt: { $gt: now } }, { $inc: { count: 1 } }, { returnDocument: "after" });
  if (!doc) {
    try {
      // New window (or the old one expired but the TTL monitor hasn't removed it yet).
      doc = await RateLimit.findOneAndUpdate(
        { key },
        { $set: { count: 1, resetAt: new Date(now.getTime() + windowMs) } },
        { upsert: true, returnDocument: "after" },
      );
    } catch {
      // Lost an upsert race with a concurrent request: count against the window it created.
      doc = await RateLimit.findOneAndUpdate({ key }, { $inc: { count: 1 } }, { returnDocument: "after" });
    }
  }
  if (doc && doc.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((doc.resetAt.getTime() - now.getTime()) / 1000));
    throw new ApiError(429, "RATE_LIMITED", message, { retryAfter });
  }
}

/** Best-effort client IP (behind Vercel / a proxy). */
export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
