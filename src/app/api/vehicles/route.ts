import { ApiError, handler, readJson, str } from "@/lib/api";
import { getOrCreateUser, getUser } from "@/lib/session";
import { addVehicle, listVehicles } from "@/lib/vehicles";

export const GET = handler(async () => {
  const user = await getUser();
  return Response.json({ vehicles: user ? await listVehicles(user._id) : [] });
});

/** Saving cars needs a phone login (spec §7). */
export const POST = handler(async (req: Request) => {
  const user = await getOrCreateUser();
  if (user.isGuest) throw new ApiError(401, "LOGIN_REQUIRED", "Log in to save your car.");
  const body = await readJson(req);
  await addVehicle(user._id, str(body.text, 120), body.isDefault === true);
  return Response.json({ vehicles: await listVehicles(user._id) }, { status: 201 });
});
