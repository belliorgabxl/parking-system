import { randomInt } from "crypto";
import { ApiError, handler, readJson, str } from "@/lib/api";
import { getOrCreateUser } from "@/lib/session";
import { hashOtp, normalizeThaiPhone, OTP_ECHO, sendOtpSms } from "@/lib/otp";
import { clientIp, MINUTE, rateLimit } from "@/lib/ratelimit";

const RESEND_COOLDOWN_MS = 30_000;
const OTP_TTL_MS = 5 * MINUTE;

export const POST = handler(async (req: Request) => {
  const body = await readJson(req);
  const phone = normalizeThaiPhone(str(body.phone, 20));
  if (!phone) throw new ApiError(400, "BAD_PHONE", "Enter a valid Thai mobile number.");
  // Stop SMS bombing a number and burning SMS credit: limits per phone and per network.
  await rateLimit(`otp-send:phone:${phone}`, 3, 10 * MINUTE, "Too many codes sent to this number. Try again in a few minutes.");
  await rateLimit(`otp-send:ip:${clientIp(req)}`, 10, 10 * MINUTE, "Too many code requests. Try again in a few minutes.");
  const user = await getOrCreateUser();

  const lastSent = user.otpExpiresAt ? user.otpExpiresAt.getTime() - OTP_TTL_MS : 0;
  if (user.otpPhone === phone && Date.now() - lastSent < RESEND_COOLDOWN_MS) {
    throw new ApiError(429, "TOO_SOON", "Please wait a few seconds before requesting another code.");
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  user.otpCode = hashOtp(code, String(user._id));
  user.otpPhone = phone;
  user.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  user.otpAttempts = 0;
  await user.save();
  await sendOtpSms(phone, code);

  return Response.json({
    ok: true,
    phone,
    serverNow: new Date().toISOString(),
    expiresAt: user.otpExpiresAt.toISOString(),
    resendAt: new Date(Date.now() + RESEND_COOLDOWN_MS).toISOString(),
    ...(OTP_ECHO ? { devCode: code } : {}),
  });
});
