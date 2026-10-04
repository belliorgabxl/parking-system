import { handler } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import { spotName } from "@/lib/engine";
import { Listing, Report, User, Withdrawal } from "@/lib/models";

export const GET = handler(async (req: Request) => {
  await requireAdmin(req);
  await connectDB();
  const reports = await Report.find().sort({ createdAt: -1 }).limit(100).lean();
  const userIds = reports.flatMap((r) => [r.reporterId, r.againstUserId]);
  const users = new Map((await User.find({ _id: { $in: userIds } }).lean()).map((u) => [String(u._id), u]));
  const listings = new Map(
    (await Listing.find({ _id: { $in: reports.map((r) => r.listingId) } }).lean()).map((l) => [String(l._id), l]),
  );
  const counts = await Report.aggregate<{ _id: unknown; n: number }>([{ $group: { _id: "$againstUserId", n: { $sum: 1 } } }]);
  const countBy = new Map(counts.map((c) => [String(c._id), c.n]));
  const withdrawals = await Withdrawal.find({ status: "pending" }).sort({ createdAt: 1 }).lean();

  return Response.json({
    reports: reports.map((r) => {
      const against = users.get(String(r.againstUserId));
      const l = listings.get(String(r.listingId));
      return {
        id: String(r._id),
        reason: r.reason,
        details: r.detailsText,
        resolution: r.resolution,
        reviewNote: r.reviewNote,
        createdAt: r.createdAt,
        spot: l ? spotName(l) : "",
        reporter: users.get(String(r.reporterId))?.displayName ?? "?",
        against: against?.displayName ?? "?",
        againstStanding: against?.standingScore ?? null,
        againstReportCount: countBy.get(String(r.againstUserId)) ?? 0,
      };
    }),
    withdrawals: withdrawals.map((w) => ({
      id: String(w._id),
      amount: w.amount,
      destination: w.destination,
      accountName: w.accountName,
      accountNumber: w.accountNumber,
      bankName: w.bankName,
      createdAt: w.createdAt,
    })),
  });
});
