import { ApiError, handler, int, readJson } from "@/lib/api";
import { adminLog, requireAdmin } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models";
import { notify } from "@/lib/notify";

type Ctx = { params: Promise<{ id: string }> };

/** Suspend / restore an account or reset its standing score. */
export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  await requireAdmin(req);
  await connectDB();
  const { id } = await params;
  const body = await readJson(req);
  const user = await User.findOne({ _id: id, isBot: false });
  if (!user) throw new ApiError(404, "NOT_FOUND", "User not found.");
  if (typeof body.isBanned === "boolean") {
    user.isBanned = body.isBanned;
    await notify(
      user._id,
      "system",
      body.isBanned ? "Your account has been suspended" : "Your account has been restored",
      body.isBanned ? "Contact support if you think this is a mistake." : "You can offer and grab spots again.",
    );
  }
  const score = int(body.standingScore);
  if (Number.isFinite(score)) user.standingScore = Math.max(0, Math.min(100, score));
  await user.save();
  await adminLog(req, "user.update", id, { isBanned: body.isBanned, standingScore: body.standingScore });
  return Response.json({ ok: true, isBanned: user.isBanned, standingScore: user.standingScore });
});
