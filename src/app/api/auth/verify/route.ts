import { ApiError, handler, readJson, str } from "@/lib/api";
import { ACTIVE_BOOKING_STATUSES, ACTIVE_STATUSES } from "@/lib/constants";
import {
  Booking,
  Listing,
  User,
  Vehicle,
  WalletTransaction,
  Report,
  CancelReason,
  Withdrawal,
  SavedPayment,
  Notification,
} from "@/lib/models";
import { hashOtp } from "@/lib/otp";
import { MINUTE, rateLimit } from "@/lib/ratelimit";
import { getOrCreateUser, startSession } from "@/lib/session";

const MAX_ATTEMPTS = 5;

export const POST = handler(async (req: Request) => {
  const body = await readJson(req);
  const code = str(body.code, 6);
  const guest = await getOrCreateUser();

  if (!guest.otpCode || !guest.otpPhone || !guest.otpExpiresAt || guest.otpExpiresAt.getTime() < Date.now()) {
    throw new ApiError(400, "OTP_EXPIRED", "Code expired. Please request a new one.");
  }
  // Per-session attempts plus a per-phone cap across sessions (brute force with many guest sessions).
  if (guest.otpAttempts >= MAX_ATTEMPTS) throw new ApiError(429, "OTP_LOCKED", "Too many attempts. Request a new code.");
  await rateLimit(`otp-verify:${guest.otpPhone}`, 10, 10 * MINUTE, "Too many attempts for this number. Try again later.");
  if (hashOtp(code, String(guest._id)) !== guest.otpCode) {
    guest.otpAttempts += 1;
    await guest.save();
    throw new ApiError(400, "OTP_WRONG", "That code isn't right. Try again.");
  }

  const phone = guest.otpPhone;
  const existing = await User.findOne({ phone, isBot: false, deletedAt: null });
  if (existing?.isBanned) throw new ApiError(403, "ACCOUNT_SUSPENDED", "This account is suspended. Please contact support.");
  let account;
  let isNew = false;

  if (existing && !existing._id.equals(guest._id)) {
    // Two live handovers can't be merged into one account.
    const [gl, el, gb, eb] = await Promise.all([
      Listing.exists({ providerId: guest._id, status: { $in: ACTIVE_STATUSES } }),
      Listing.exists({ providerId: existing._id, status: { $in: ACTIVE_STATUSES } }),
      Booking.exists({ seekerId: guest._id, status: { $in: ACTIVE_BOOKING_STATUSES } }),
      Booking.exists({ seekerId: existing._id, status: { $in: ACTIVE_BOOKING_STATUSES } }),
    ]);
    if ((gl && el) || (gb && eb)) {
      throw new ApiError(409, "ACTIVE_HANDOVER", "Finish your current handover before logging in to this account.");
    }
    // Guest → existing account: migrate everything the guest did on this device, including any
    // negative balance (spec §7: balance migrates on login — and penalties can't be dodged).
    const from = { userId: guest._id };
    await Promise.all([
      WalletTransaction.updateMany(from, { $set: { userId: existing._id } }),
      Withdrawal.updateMany(from, { $set: { userId: existing._id } }),
      CancelReason.updateMany(from, { $set: { userId: existing._id } }),
      Listing.updateMany({ providerId: guest._id }, { $set: { providerId: existing._id } }),
      Listing.updateMany({ activeProviderId: guest._id }, { $set: { activeProviderId: existing._id } }),
      Booking.updateMany({ seekerId: guest._id }, { $set: { seekerId: existing._id } }),
      Booking.updateMany({ activeSeekerId: guest._id }, { $set: { activeSeekerId: existing._id } }),
      Report.updateMany({ reporterId: guest._id }, { $set: { reporterId: existing._id } }),
      Report.updateMany({ againstUserId: guest._id }, { $set: { againstUserId: existing._id } }),
      Notification.updateMany(from, { $set: { userId: existing._id } }),
      SavedPayment.updateMany(from, { $set: { userId: existing._id, isDefault: false } }),
      Vehicle.updateMany(from, { $set: { userId: existing._id, isDefault: false } }),
    ]);
    if (guest.lastParked && !existing.lastParked) existing.lastParked = guest.lastParked;
    // Standing problems picked up as a guest follow the person.
    existing.standingScore = Math.min(existing.standingScore, guest.standingScore);
    await User.deleteOne({ _id: guest._id });
    account = existing;
  } else {
    guest.phone = phone;
    guest.isGuest = false;
    isNew = guest.displayName === "Guest";
    account = guest;
  }
  account.otpCode = null;
  account.otpPhone = null;
  account.otpExpiresAt = null;
  account.otpAttempts = 0;
  await startSession(account); // rotates the token (no session fixation)

  return Response.json({ ok: true, isNew, displayName: account.displayName });
});
