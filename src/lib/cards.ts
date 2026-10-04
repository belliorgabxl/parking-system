import "server-only";
import type { Types } from "mongoose";
import { ApiError, str } from "./api";
import { SavedPayment } from "./models";

export const MAX_PAYMENT_METHODS = 5;

export function luhnOk(num: string) {
  let sum = 0;
  let dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = Number(num[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export function cardBrand(num: string) {
  if (/^4/.test(num)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(num)) return "Mastercard";
  if (/^3[47]/.test(num)) return "Amex";
  if (/^35/.test(num)) return "JCB";
  if (/^62/.test(num)) return "UnionPay";
  return "Card";
}

/**
 * Validates a card entered in the app. Mock tokenisation: we keep brand + last 4 only — a real PSP
 * (Omise.js / 2C2P SDK) would tokenise in the browser so the full number never reaches our server.
 */
export function validateCard(body: Record<string, unknown>) {
  const number = str(body.cardNumber, 30).replace(/\D/g, "");
  const expiry = str(body.expiry, 7).replace(/\s/g, "");
  const cvc = str(body.cvc, 4).replace(/\D/g, "");
  if (number.length < 13 || number.length > 19 || !luhnOk(number))
    throw new ApiError(400, "BAD_CARD", "Card number isn't valid.");
  const m = expiry.match(/^(\d{2})\/(\d{2})$/);
  if (!m) throw new ApiError(400, "BAD_EXPIRY", "Expiry must be MM/YY.");
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  const now = new Date();
  if (month < 1 || month > 12 || year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
    throw new ApiError(400, "CARD_EXPIRED", "This card has expired.");
  }
  if (cvc.length < 3) throw new ApiError(400, "BAD_CVC", "Enter the 3–4 digit security code.");
  return { brand: cardBrand(number), last4: number.slice(-4), expiry, holderName: str(body.holderName, 60) };
}

export const cardLabel = (c: { brand?: string | null; last4?: string | null }) => `${c.brand || "Card"} •••• ${c.last4}`;

type Row = {
  _id: Types.ObjectId;
  kind: string;
  brand?: string | null;
  last4?: string | null;
  expiry?: string | null;
  holderName?: string | null;
  promptPayId?: string | null;
  isDefault?: boolean | null;
};
export const paymentView = (p: Row) => ({
  id: String(p._id),
  kind: p.kind as "card" | "promptpay",
  label: p.kind === "card" ? cardLabel(p) : `PromptPay ${maskPromptPay(p.promptPayId ?? "")}`,
  brand: p.brand ?? "",
  last4: p.last4 ?? "",
  expiry: p.expiry ?? "",
  holderName: p.holderName ?? "",
  promptPayId: p.promptPayId ?? "", // owner-only view, used to pre-fill withdrawals
  isDefault: !!p.isDefault,
});
export type PaymentView = ReturnType<typeof paymentView>;

export function maskPromptPay(id: string) {
  return id.length > 4 ? `•••${id.slice(-4)}` : id;
}

export async function listPayments(userId: Types.ObjectId) {
  const rows = await SavedPayment.find({ userId }).sort({ isDefault: -1, updatedAt: -1 }).lean();
  return rows.map(paymentView);
}

export async function setDefaultPayment(userId: Types.ObjectId, id: Types.ObjectId | string) {
  await SavedPayment.updateMany({ userId, _id: { $ne: id } }, { $set: { isDefault: false } });
  await SavedPayment.updateOne({ userId, _id: id }, { $set: { isDefault: true } });
}

export async function addPayment(userId: Types.ObjectId, body: Record<string, unknown>) {
  const count = await SavedPayment.countDocuments({ userId });
  if (count >= MAX_PAYMENT_METHODS)
    throw new ApiError(400, "TOO_MANY", `You can save up to ${MAX_PAYMENT_METHODS} payment methods.`);
  let doc;
  if (body.kind === "promptpay") {
    const id = str(body.promptPayId, 20).replace(/\D/g, "");
    if (!/^(0\d{9}|\d{13})$/.test(id))
      throw new ApiError(400, "BAD_PROMPTPAY", "PromptPay must be a 10-digit phone or 13-digit ID.");
    doc = await SavedPayment.create({ userId, kind: "promptpay", promptPayId: id, isDefault: count === 0 });
  } else {
    const card = validateCard(body);
    const dup = await SavedPayment.findOne({ userId, kind: "card", last4: card.last4, brand: card.brand, expiry: card.expiry });
    if (dup) throw new ApiError(409, "DUPLICATE", "This card is already saved.");
    doc = await SavedPayment.create({ userId, kind: "card", ...card, isDefault: count === 0 });
  }
  if (body.isDefault === true) await setDefaultPayment(userId, doc._id);
  return doc;
}

/**
 * Resolve how a card payment is made: a saved card id, or a new card typed at checkout
 * (optionally saved for logged-in users). Returns the label stored on the booking / ledger.
 */
export async function resolveCard(userId: Types.ObjectId, isGuest: boolean, body: Record<string, unknown>) {
  const savedId = str(body.paymentMethodId, 40);
  if (savedId) {
    const p = await SavedPayment.findOne({ _id: savedId, userId, kind: "card" }).lean();
    if (!p) throw new ApiError(404, "NOT_FOUND", "That card is no longer saved.");
    return cardLabel(p);
  }
  const card = body.card as Record<string, unknown> | undefined;
  if (!card) throw new ApiError(400, "MISSING_CARD", "Choose or add a card.");
  const parsed = validateCard(card);
  if (!isGuest && card.save === true) {
    await addPayment(userId, { ...card, kind: "card" }).catch(() => null); // duplicates are fine
  }
  return cardLabel(parsed);
}
