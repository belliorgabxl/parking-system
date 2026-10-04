import "server-only";
import { Types } from "mongoose";
import { WalletTransaction } from "./models";
import type { TxType } from "./constants";

type Id = Types.ObjectId | string;

/**
 * Two buckets inside one wallet:
 *  - credit: top-ups, manual credit and refunds of card/QR payments — spendable on parking, NOT withdrawable
 *    (blocks cashing out stolen cards through refunds);
 *  - cash: provider earnings and compensation — withdrawable.
 * Spending (wallet payments, penalties) uses credit first, then cash.
 */
const INFLOW_BUCKET: Partial<Record<TxType, "credit" | "cash">> = {
  earning: "cash",
  compensation: "cash",
  topup: "credit",
  adjustment: "credit",
  refund: "credit",
};

async function sums(userId: Id) {
  const [row] = await WalletTransaction.aggregate<{ total: number; credit: number; cash: number }>([
    { $match: { userId: new Types.ObjectId(String(userId)), external: { $ne: true } } },
    { $group: { _id: null, total: { $sum: "$amount" }, credit: { $sum: "$creditAmount" }, cash: { $sum: "$cashAmount" } } },
  ]);
  return { total: row?.total ?? 0, credit: row?.credit ?? 0, cash: row?.cash ?? 0 };
}

/** Wallet balance is derived from the append-only ledger (spec §8). Escrow holds are already debited. */
export async function getBalance(userId: Id): Promise<number> {
  return (await sums(userId)).total;
}

/** Balance plus the part of it that can be withdrawn to a bank. */
export async function getBalances(userId: Id) {
  const s = await sums(userId);
  return { balance: s.total, withdrawable: Math.max(0, Math.min(s.cash, s.total)), credit: Math.max(0, s.credit) };
}

export async function addTx(entry: {
  userId: Id;
  type: TxType;
  amount: number;
  label: string;
  external?: boolean;
  method?: string | null;
  bookingId?: Id | null;
  listingId?: Id | null;
  meta?: Record<string, unknown> | null;
  /** Inflows: force a bucket (e.g. a cancelled withdrawal returns as cash). */
  bucket?: "credit" | "cash";
  /** Exact split, e.g. reversing a wallet payment. */
  split?: { credit: number; cash: number };
}) {
  const { bucket, split, ...row } = entry;
  let creditAmount = 0;
  let cashAmount = 0;
  if (row.external) {
    // Recorded for history only.
  } else if (split) {
    creditAmount = split.credit;
    cashAmount = split.cash;
  } else if (row.amount >= 0) {
    if ((bucket ?? INFLOW_BUCKET[row.type] ?? "credit") === "cash") cashAmount = row.amount;
    else creditAmount = row.amount;
  } else if (row.type === "withdraw") {
    cashAmount = row.amount;
  } else {
    const { credit } = await sums(row.userId);
    const fromCredit = Math.min(Math.max(credit, 0), -row.amount);
    creditAmount = -fromCredit;
    cashAmount = row.amount + fromCredit;
  }
  return WalletTransaction.create({ ...row, creditAmount, cashAmount });
}

export async function recentTransactions(userId: Id, limit = 30) {
  return WalletTransaction.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
}
