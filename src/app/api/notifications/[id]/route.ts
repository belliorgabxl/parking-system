import { ApiError, handler } from "@/lib/api";
import { Notification } from "@/lib/models";
import { getOrCreateUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

/** Mark one as read. */
export const PATCH = handler(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await getOrCreateUser();
  const r = await Notification.updateOne({ _id: id, userId: user._id }, { $set: { readAt: new Date() } });
  if (!r.matchedCount) throw new ApiError(404, "NOT_FOUND", "Notification not found.");
  return Response.json({ ok: true });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await getOrCreateUser();
  const r = await Notification.deleteOne({ _id: id, userId: user._id });
  if (!r.deletedCount) throw new ApiError(404, "NOT_FOUND", "Notification not found.");
  return Response.json({ ok: true });
});
