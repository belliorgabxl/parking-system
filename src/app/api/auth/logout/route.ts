import { cookies } from "next/headers";
import { handler } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/session";

export const POST = handler(async () => {
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
});
