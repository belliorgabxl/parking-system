import "server-only";
import { randomBytes } from "crypto";

/**
 * Payment gateway adapter. No PSP is connected yet: nothing is charged and every payment succeeds
 * (the app shows a 5-second bank confirmation, see components/PaymentSheet.tsx).
 * Swap in a real PSP (e.g. Omise / 2C2P / GB Prime Pay for PromptPay QR + cards) here;
 * QR payments would become async (create charge → webhook confirms → credit ledger).
 */
export async function chargeExternal(method: "qr" | "card", amount: number) {
  if (amount <= 0) throw new Error("Invalid amount");
  return { ok: true as const, ref: `${method.toUpperCase()}-${randomBytes(5).toString("hex").toUpperCase()}` };
}

/** Payout adapter for withdrawals. MVP: queued for manual/ops processing. */
export async function requestPayout() {
  return { status: "pending" as const };
}
