import "server-only";

import { createHash } from "crypto";
export { OTP_BYPASS, OTP_ECHO } from "./flags";

/** OTPs are stored hashed and bound to the session that requested them. */
export function hashOtp(code: string, userId: string) {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

/** Accepts 08x-xxx-xxxx, 8xxxxxxxx, +66 8xxxxxxxx… → "+668xxxxxxxx". */
export function normalizeThaiPhone(input: string): string | null {
  let d = input.replace(/[^\d+]/g, "");
  if (d.startsWith("+66")) d = d.slice(3);
  else if (d.startsWith("66") && d.length === 11) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (!/^[689]\d{8}$/.test(d)) return null;
  return `+66${d}`;
}

/** SMS adapter. Plug in a provider (e.g. Twilio, ThaiBulkSMS) here. */
export async function sendOtpSms(phone: string, code: string) {
  console.info(`[otp] ${phone} → ${code}`);
}
