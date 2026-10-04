import { ApiError, handler, int, readJson, str } from "@/lib/api";
import { resolveCard } from "@/lib/cards";
import { MAX_TOPUP, MIN_TOPUP } from "@/lib/constants";
import { addTx, getBalance } from "@/lib/ledger";
import { chargeExternal } from "@/lib/payments";
import { getOrCreateUser } from "@/lib/session";

export const POST = handler(async (req: Request) => {
  const body = await readJson(req);
  const user = await getOrCreateUser();
  const amount = int(body.amount);
  const method = str(body.method, 10);
  if (!Number.isFinite(amount) || amount < MIN_TOPUP || amount > MAX_TOPUP) {
    throw new ApiError(400, "BAD_AMOUNT", `Top up between ฿${MIN_TOPUP} and ฿${MAX_TOPUP.toLocaleString()}.`);
  }
  if (method !== "qr" && method !== "card") throw new ApiError(400, "BAD_METHOD", "Choose a payment method.");
  const label = method === "card" ? await resolveCard(user._id, user.isGuest, body) : "QR";
  const charge = await chargeExternal(method, amount);
  await addTx({
    userId: user._id,
    type: "topup",
    amount,
    method,
    label: `Top up · ${label}`,
    meta: { ref: charge.ref },
  });
  return Response.json({ ok: true, amount, ref: charge.ref, balance: await getBalance(user._id), isGuest: user.isGuest });
});
