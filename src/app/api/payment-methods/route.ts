import { ApiError, handler, readJson } from "@/lib/api";
import { addPayment, listPayments } from "@/lib/cards";
import { getOrCreateUser, getUser } from "@/lib/session";

export const GET = handler(async () => {
  const user = await getUser();
  return Response.json({ payments: user ? await listPayments(user._id) : [] });
});

/** Saving payment methods needs a phone login (spec §7). */
export const POST = handler(async (req: Request) => {
  const user = await getOrCreateUser();
  if (user.isGuest) throw new ApiError(401, "LOGIN_REQUIRED", "Log in to save payment methods.");
  await addPayment(user._id, await readJson(req));
  return Response.json({ payments: await listPayments(user._id) }, { status: 201 });
});
