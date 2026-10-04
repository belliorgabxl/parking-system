import "server-only";
import { createHash, randomBytes } from "crypto";
import { cookies, headers } from "next/headers";
import { connectDB } from "./db";
import { User, type UserDoc } from "./models";
import { rateLimit, HOUR } from "./ratelimit";

export const SESSION_COOKIE = "ps_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

export function newToken() {
  return randomBytes(24).toString("base64url");
}

/** Only a hash of the session token is stored, so a database leak can't be replayed as cookies. */
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Issue a fresh session for `user` (rotates the token — call on login). */
export async function startSession(user: UserDoc) {
  const token = newToken();
  user.sessionToken = hashToken(token);
  await user.save();
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/** Current user from the session cookie, or null. Never creates a user (safe for GET handlers). */
export async function getUser(): Promise<UserDoc | null> {
  await connectDB();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return User.findOne({ sessionToken: hashToken(token), isBot: false, deletedAt: null });
}

/**
 * Current user, creating a device-bound guest session on first *action* (spec §7: progressive trust).
 * Guest creation is rate limited per IP so scripts can't flood the users collection.
 */
export async function getOrCreateUser(): Promise<UserDoc> {
  const existing = await getUser();
  if (existing) return existing;
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
  await rateLimit(`guest:${ip}`, 30, HOUR, "Too many new sessions from your network. Try again later.");
  const user = new User({ isGuest: true, displayName: "Guest", sessionToken: hashToken(newToken()) });
  await startSession(user);
  return user;
}
