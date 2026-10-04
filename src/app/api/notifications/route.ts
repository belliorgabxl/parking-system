import { handler } from "@/lib/api";
import { Notification } from "@/lib/models";
import { getUser } from "@/lib/session";

async function list(userId: unknown) {
  const rows = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
  return {
    unread: rows.filter((n) => !n.readAt).length,
    items: rows.map((n) => ({
      id: String(n._id),
      kind: n.kind,
      title: n.title,
      body: n.body,
      listingId: n.listingId ? String(n.listingId) : null,
      read: !!n.readAt,
      createdAt: n.createdAt,
    })),
  };
}

export const GET = handler(async () => {
  const user = await getUser();
  return Response.json(user ? await list(user._id) : { unread: 0, items: [] });
});

/** Mark all as read. */
export const PATCH = handler(async () => {
  const user = await getUser();
  if (!user) return Response.json({ unread: 0, items: [] });
  await Notification.updateMany({ userId: user._id, readAt: null }, { $set: { readAt: new Date() } });
  return Response.json(await list(user._id));
});

/** Clear all. */
export const DELETE = handler(async () => {
  const user = await getUser();
  if (!user) return Response.json({ unread: 0, items: [] });
  await Notification.deleteMany({ userId: user._id });
  return Response.json(await list(user._id));
});
