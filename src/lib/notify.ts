import "server-only";
import type { Types } from "mongoose";
import { Notification } from "./models";
import type { NotificationKind } from "./constants";

/**
 * In-app inbox entry. Shown as a badge on Home and in /notifications.
 * Plug web push / LINE notify in here later to reach users who closed the app.
 */
export async function notify(
  userId: Types.ObjectId | null | undefined,
  kind: NotificationKind,
  title: string,
  body = "",
  listingId: Types.ObjectId | null = null,
  opts: { skip?: boolean } = {},
) {
  if (!userId || opts.skip) return;
  await Notification.create({ userId, kind, title, body, listingId });
}

export async function unreadCount(userId: Types.ObjectId) {
  return Notification.countDocuments({ userId, readAt: null });
}
