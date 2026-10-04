import type { NextRequest } from "next/server";
import { ApiError, handler } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { sweepDue } from "@/lib/engine";

/**
 * Scheduler hook (e.g. Vercel Cron every minute): pushes every live handover through its deadlines
 * so no-shows, refunds and auto-completions happen even when nobody has the app open.
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this automatically).
 */
export const GET = handler(async (req: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new ApiError(503, "CRON_DISABLED", "Set CRON_SECRET to enable the sweeper endpoint.");
  if (req.headers.get("authorization") !== `Bearer ${secret}`) throw new ApiError(401, "UNAUTHORIZED", "Bad cron secret.");
  await connectDB();
  const advanced = await sweepDue(true);
  return Response.json({ ok: true, advanced });
});
