import { ApiError, handler } from "@/lib/api";
import { addTx, getBalance } from "@/lib/ledger";
import { Withdrawal } from "@/lib/models";
import { getOrCreateUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

/** Cancel a withdrawal that ops hasn't paid out yet; the amount returns to the wallet. */
export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await getOrCreateUser();
  const w = await Withdrawal.findOneAndUpdate(
    { _id: id, userId: user._id, status: "pending" },
    { $set: { status: "cancelled" } },
    { returnDocument: "after" },
  );
  if (!w) throw new ApiError(409, "BAD_STATE", "This withdrawal can't be cancelled anymore.");
  await addTx({ userId: user._id, type: "refund", amount: w.amount, label: "Withdrawal cancelled", bucket: "cash" });
  return Response.json({ ok: true, balance: await getBalance(user._id) });
});
