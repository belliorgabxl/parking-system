import { ApiError, handler, readJson } from "@/lib/api";
import { listPayments, setDefaultPayment } from "@/lib/cards";
import { SavedPayment } from "@/lib/models";
import { getOrCreateUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await getOrCreateUser();
  const body = await readJson(req);
  if (!(await SavedPayment.exists({ _id: id, userId: user._id })))
    throw new ApiError(404, "NOT_FOUND", "Payment method not found.");
  if (body.isDefault === true) await setDefaultPayment(user._id, id);
  return Response.json({ payments: await listPayments(user._id) });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await getOrCreateUser();
  const p = await SavedPayment.findOneAndDelete({ _id: id, userId: user._id });
  if (!p) throw new ApiError(404, "NOT_FOUND", "Payment method not found.");
  if (p.isDefault) {
    const next = await SavedPayment.findOne({ userId: user._id }).sort({ updatedAt: -1 });
    if (next) await setDefaultPayment(user._id, next._id);
  }
  return Response.json({ payments: await listPayments(user._id) });
});
