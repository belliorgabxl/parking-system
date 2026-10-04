import { handler } from "@/lib/api";
import { getBalances, recentTransactions } from "@/lib/ledger";
import { Booking, Withdrawal } from "@/lib/models";
import { getUser } from "@/lib/session";

export const GET = handler(async () => {
  const user = await getUser();
  if (!user) {
    return Response.json({
      serverNow: new Date().toISOString(),
      balance: 0,
      withdrawable: 0,
      heldInEscrow: 0,
      isGuest: true,
      withdrawals: [],
      transactions: [],
    });
  }
  const [{ balance, withdrawable }, txs, held, withdrawals] = await Promise.all([
    getBalances(user._id),
    recentTransactions(user._id, 100),
    Booking.aggregate<{ total: number }>([
      { $match: { seekerId: user._id, status: { $in: ["MATCHED", "SEEKER_ARRIVED"] }, paymentMethod: "wallet" } },
      { $group: { _id: null, total: { $sum: "$amountHeld" } } },
    ]),
    Withdrawal.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);
  return Response.json({
    serverNow: new Date().toISOString(),
    balance,
    withdrawable,
    heldInEscrow: held[0]?.total ?? 0,
    isGuest: user.isGuest,
    withdrawals: withdrawals.map((w) => ({
      id: String(w._id),
      amount: w.amount,
      status: w.status,
      destination: w.destination === "promptpay" ? "PromptPay" : w.bankName,
      account: `•••${w.accountNumber.slice(-4)}`,
      createdAt: w.createdAt,
    })),
    transactions: txs.map((t) => ({
      id: String(t._id),
      type: t.type,
      amount: t.amount,
      label: t.label,
      external: !!t.external,
      method: t.method,
      listingId: t.listingId ? String(t.listingId) : null,
      createdAt: t.createdAt,
    })),
  });
});
