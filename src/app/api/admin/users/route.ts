import type { NextRequest } from "next/server";
import { handler } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import { getBalance } from "@/lib/ledger";
import { Report, User } from "@/lib/models";

/** Search users by name / phone; lowest standing first so problem accounts surface. */
export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);
  await connectDB();
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 40);
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter = {
    isBot: false,
    deletedAt: null,
    ...(q
      ? { $or: [{ displayName: { $regex: esc, $options: "i" } }, { phone: { $regex: esc.replace(/^0/, "") } }] }
      : { isGuest: false }),
  };
  const users = await User.find(filter).sort({ standingScore: 1, createdAt: -1 }).limit(50).lean();
  const counts = new Map(
    (
      await Report.aggregate<{ _id: unknown; n: number }>([
        { $match: { againstUserId: { $in: users.map((u) => u._id) } } },
        { $group: { _id: "$againstUserId", n: { $sum: 1 } } },
      ])
    ).map((c) => [String(c._id), c.n]),
  );
  const rows = await Promise.all(
    users.map(async (u) => ({
      id: String(u._id),
      displayName: u.displayName,
      phone: u.phone,
      isGuest: u.isGuest,
      isBanned: u.isBanned,
      standingScore: u.standingScore,
      reports: counts.get(String(u._id)) ?? 0,
      balance: await getBalance(u._id),
      createdAt: u.createdAt,
    })),
  );
  return Response.json({ users: rows });
});
