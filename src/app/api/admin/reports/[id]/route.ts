import { ApiError, handler, readJson, str } from "@/lib/api";
import { adminLog, requireAdmin } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import { addTx } from "@/lib/ledger";
import { Report, User, Withdrawal } from "@/lib/models";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Resolve a report ("upheld" keeps the refund and penalises the provider further; "rejected" restores standing),
 * or a pending withdrawal (`kind: "withdrawal"`, "paid" | "rejected" — rejected refunds the wallet).
 */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  await requireAdmin(req);
  await connectDB();
  const { id } = await params;
  const body = await readJson(req);
  const decision = str(body.decision, 20);

  if (body.kind === "withdrawal") {
    if (decision !== "paid" && decision !== "rejected") throw new ApiError(400, "BAD_DECISION", "paid | rejected");
    const w = await Withdrawal.findOneAndUpdate(
      { _id: id, status: "pending" },
      { $set: { status: decision } },
      { returnDocument: "after" },
    );
    if (!w) throw new ApiError(404, "NOT_FOUND", "Withdrawal not found or already processed.");
    await adminLog(req, `withdrawal.${decision}`, id, { amount: w.amount });
    if (decision === "rejected") {
      await addTx({ userId: w.userId, type: "refund", amount: w.amount, label: "Withdrawal returned", bucket: "cash" });
    }
    return Response.json({ ok: true });
  }

  if (decision !== "upheld" && decision !== "rejected") throw new ApiError(400, "BAD_DECISION", "upheld | rejected");
  const report = await Report.findOneAndUpdate(
    { _id: id, resolution: "pending_review" },
    { $set: { resolution: decision, reviewNote: str(body.note, 500) } },
    { returnDocument: "after" },
  );
  if (!report) throw new ApiError(404, "NOT_FOUND", "Report not found or already reviewed.");
  await User.updateOne({ _id: report.againstUserId }, { $inc: { standingScore: decision === "upheld" ? -5 : 3 } });
  // Refunds on report are instant, so false reports cost the reporter standing (low standing blocks grabbing).
  if (decision === "rejected") await User.updateOne({ _id: report.reporterId }, { $inc: { standingScore: -10 } });
  await adminLog(req, `report.${decision}`, id, { against: String(report.againstUserId), reporter: String(report.reporterId) });
  return Response.json({ ok: true });
});
