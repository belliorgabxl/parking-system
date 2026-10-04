import { ApiError, handler, int, readJson, str } from "@/lib/api";
import { MIN_WITHDRAW } from "@/lib/constants";
import { DEMO_MODE } from "@/lib/flags";
import { addTx, getBalances } from "@/lib/ledger";
import { Withdrawal } from "@/lib/models";
import { requestPayout } from "@/lib/payments";
import { DAY, rateLimit } from "@/lib/ratelimit";
import { getOrCreateUser } from "@/lib/session";

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/^(mr|mrs|ms|miss|นาย|นาง|นางสาว)\.?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

export const POST = handler(async (req: Request) => {
  const body = await readJson(req);
  const user = await getOrCreateUser();
  if (DEMO_MODE) throw new ApiError(403, "DEMO_MODE", "Withdrawals are temporarily unavailable. Please try again later.");
  // Withdrawing to cash requires a verified (phone OTP) account — spec §7.
  if (user.isGuest) throw new ApiError(401, "LOGIN_REQUIRED", "Please log in to withdraw.");
  if (user.isBanned) throw new ApiError(403, "ACCOUNT_SUSPENDED", "Your account is suspended. Please contact support.");
  await rateLimit(`withdraw:${user._id}`, 5, DAY, "Too many withdrawal requests today.");
  if (await Withdrawal.exists({ userId: user._id, status: "pending" })) {
    throw new ApiError(
      409,
      "PENDING_WITHDRAWAL",
      "You already have a withdrawal in progress. Cancel it or wait until it's paid.",
    );
  }

  const amount = int(body.amount);
  const destination = str(body.destination, 20);
  const accountName = str(body.accountName, 80);
  const accountNumber = str(body.accountNumber, 30).replace(/[\s-]/g, "");
  const bankName = str(body.bankName, 40);

  if (destination !== "promptpay" && destination !== "bank") throw new ApiError(400, "BAD_DEST", "Choose where to withdraw.");
  if (!accountName || !accountNumber) throw new ApiError(400, "MISSING_ACCOUNT", "Enter the account name and number.");
  if (destination === "promptpay" && !/^(0\d{9}|\d{13})$/.test(accountNumber)) {
    throw new ApiError(400, "BAD_ACCOUNT", "PromptPay must be a 10-digit phone or 13-digit ID number.");
  }
  if (destination === "bank" && (!/^\d{10,12}$/.test(accountNumber) || !bankName)) {
    throw new ApiError(400, "BAD_ACCOUNT", "Enter your bank and a 10–12 digit account number.");
  }
  // The payee name is locked after the first payout, so changing the profile name can't redirect money.
  const expectedName = user.payoutName ?? user.displayName;
  if (norm(accountName) !== norm(expectedName)) {
    throw new ApiError(
      400,
      "NAME_MISMATCH",
      user.payoutName
        ? `Payouts can only go to accounts in the name ${user.payoutName}. Contact support to change it.`
        : `Account name must match your profile name (${user.displayName}).`,
    );
  }
  if (!Number.isFinite(amount) || amount < MIN_WITHDRAW)
    throw new ApiError(400, "BAD_AMOUNT", `Minimum withdrawal is ฿${MIN_WITHDRAW}.`);

  // Only earnings are withdrawable; top-ups and card/QR refunds stay as parking credit.
  const { withdrawable } = await getBalances(user._id);
  if (amount > withdrawable) {
    throw new ApiError(400, "INSUFFICIENT_BALANCE", `You can withdraw up to ฿${withdrawable} (your earnings).`, { withdrawable });
  }

  // Create the payout first: the unique "one pending per user" index makes concurrent requests fail here,
  // before any money moves.
  const w = await Withdrawal.create({ userId: user._id, amount, destination, accountName, accountNumber, bankName });
  try {
    const tx = await addTx({
      userId: user._id,
      type: "withdraw",
      amount: -amount,
      method: destination,
      label: `Withdraw · ${destination === "promptpay" ? "PromptPay" : bankName}`,
    });
    w.txId = tx._id;
    await w.save();
  } catch (err) {
    await Withdrawal.deleteOne({ _id: w._id });
    throw err;
  }
  if (!user.payoutName) {
    user.payoutName = accountName;
    await user.save();
  }
  await requestPayout();
  const after = await getBalances(user._id);
  return Response.json({ ok: true, amount, balance: after.balance, withdrawable: after.withdrawable });
});
