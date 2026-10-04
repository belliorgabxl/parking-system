import { Types } from "mongoose";
import { ApiError, handler } from "@/lib/api";
import { adminLog, requireAdmin } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import { adminClose } from "@/lib/engine";

type Ctx = { params: Promise<{ id: string }> };

/** Force-close a live handover: refunds the seeker, no penalties. */
export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  await requireAdmin(req);
  await connectDB();
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, "NOT_FOUND", "Not found.");
  const status = await adminClose(new Types.ObjectId(id));
  await adminLog(req, "listing.force_close", id, { status });
  return Response.json({ ok: true, status });
});
