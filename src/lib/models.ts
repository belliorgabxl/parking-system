import mongoose, { Schema, type InferSchemaType, type Model, type HydratedDocument } from "mongoose";
import { CAR_SIZES, LISTING_STATUSES, NOTIFICATION_KINDS, PAYMENT_METHODS, SPOT_TYPES, TX_TYPES } from "./constants";

const { ObjectId } = Schema.Types;

function model<T>(name: string, schema: Schema<T>): Model<T> {
  // Avoid OverwriteModelError on hot reload.
  return (mongoose.models[name] as Model<T>) ?? mongoose.model<T>(name, schema);
}

const vehicleSnapshot = new Schema({ makeModel: String, color: String, plate: String, text: String }, { _id: false });

// ---------- User ----------
const userSchema = new Schema(
  {
    phone: { type: String, default: null },
    displayName: { type: String, default: "Guest" },
    isGuest: { type: Boolean, default: true },
    isBot: { type: Boolean, default: false },
    sessionToken: { type: String, required: true, unique: true }, // sha256 of the cookie value
    payoutName: { type: String, default: null }, // locked after the first withdrawal (bank account holder)
    standingScore: { type: Number, default: 100 },
    isBanned: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    otpCode: { type: String, default: null }, // sha256(code + user id)
    otpPhone: { type: String, default: null },
    otpExpiresAt: { type: Date, default: null },
    otpAttempts: { type: Number, default: 0 },
    lastParked: {
      type: new Schema(
        { buildingId: ObjectId, floor: String, zone: String, entrance: String, landmark: String, at: Date },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
);
userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: "string" } } });
export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = model("User", userSchema);

// ---------- Vehicle ----------
const vehicleSchema = new Schema(
  {
    userId: { type: ObjectId, ref: "User", required: true, index: true },
    makeModel: String,
    color: String,
    plate: String,
    text: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);
export const Vehicle = model("Vehicle", vehicleSchema);

// ---------- Saved payment methods (tokenised: only brand + last 4 are ever stored) ----------
const savedPaymentSchema = new Schema(
  {
    userId: { type: ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["card", "promptpay"], required: true },
    brand: { type: String, default: "" },
    last4: { type: String, default: "" },
    expiry: { type: String, default: "" }, // MM/YY
    holderName: { type: String, default: "" },
    promptPayId: { type: String, default: "" },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);
export const SavedPayment = model("SavedPayment", savedPaymentSchema);

// ---------- Building ----------
const buildingSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    shortName: String,
    floors: [String],
    zones: [String],
    entrances: [String],
    landmarks: [String],
    baseSeekers: { type: Number, default: 12 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export type BuildingDoc = HydratedDocument<InferSchemaType<typeof buildingSchema>>;
export const Building = model("Building", buildingSchema);

// ---------- Listing ----------
const listingSchema = new Schema(
  {
    providerId: { type: ObjectId, ref: "User", required: true, index: true },
    buildingId: { type: ObjectId, ref: "Building", required: true, index: true },
    floor: { type: String, required: true },
    zone: { type: String, required: true },
    entrance: { type: String, default: "" },
    landmark: { type: String, default: "" },
    descriptionText: { type: String, default: "" },
    vehicleSnapshot: { type: vehicleSnapshot, required: true },
    spotType: { type: String, enum: SPOT_TYPES, default: "indoor" },
    carSize: { type: String, enum: CAR_SIZES, default: "any" },
    isLadyBay: { type: Boolean, default: false },
    leaveAt: { type: Date, required: true },
    price: { type: Number, required: true },
    providerEarning: { type: Number, required: true },
    status: { type: String, enum: LISTING_STATUSES, default: "OPEN", index: true },
    bookingId: { type: ObjectId, ref: "Booking", default: null },
    providerLeftAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    // Short reservation while a seeker completes a QR payment.
    heldBy: { type: ObjectId, ref: "User", default: null },
    heldUntil: { type: Date, default: null },
    // Set while the listing is live; a unique index enforces one live listing per provider (race-proof).
    activeProviderId: { type: ObjectId, default: undefined },
    // Simulation flags
    simulateSeeker: { type: Boolean, default: false },
    isBotListing: { type: Boolean, default: false },
  },
  { timestamps: true },
);
listingSchema.index({ buildingId: 1, status: 1, leaveAt: 1 });
listingSchema.index({ providerId: 1, status: 1 });
listingSchema.index({ activeProviderId: 1 }, { unique: true, partialFilterExpression: { activeProviderId: { $exists: true } } });
export type ListingDoc = HydratedDocument<InferSchemaType<typeof listingSchema>>;
export const Listing = model("Listing", listingSchema);

// ---------- Booking ----------
const bookingSchema = new Schema(
  {
    // Not unique: if a seeker cancels, the listing re-opens and can get a new booking.
    listingId: { type: ObjectId, ref: "Listing", required: true, index: true },
    seekerId: { type: ObjectId, ref: "User", required: true, index: true },
    seekerVehicleSnapshot: { type: vehicleSnapshot, default: null },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    paymentLabel: { type: String, default: "" },
    cancelReason: { type: String, default: "" },
    amountHeld: { type: Number, required: true },
    status: { type: String, enum: LISTING_STATUSES, default: "MATCHED", index: true },
    matchedAt: { type: Date, default: Date.now },
    arrivedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    isBotSeeker: { type: Boolean, default: false },
    etaMinutes: { type: Number, default: 6 },
    // Set while the booking is live; a unique index enforces one live booking per seeker (race-proof).
    activeSeekerId: { type: ObjectId, default: undefined },
  },
  { timestamps: true },
);
bookingSchema.index({ seekerId: 1, status: 1 });
bookingSchema.index({ activeSeekerId: 1 }, { unique: true, partialFilterExpression: { activeSeekerId: { $exists: true } } });
export type BookingDoc = HydratedDocument<InferSchemaType<typeof bookingSchema>>;
export const Booking = model("Booking", bookingSchema);

// ---------- WalletTransaction (append-only ledger) ----------
const walletTxSchema = new Schema(
  {
    userId: { type: ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: TX_TYPES, required: true },
    amount: { type: Number, required: true }, // signed THB
    // Split of `amount` between non-withdrawable credit (top-ups, refunds of card/QR payments)
    // and withdrawable cash (earnings). creditAmount + cashAmount === amount for wallet rows.
    creditAmount: { type: Number, default: 0 },
    cashAmount: { type: Number, default: 0 },
    // External payments (QR / card) are recorded for history but do not move the wallet balance.
    external: { type: Boolean, default: false },
    method: { type: String, default: null },
    label: { type: String, default: "" },
    bookingId: { type: ObjectId, ref: "Booking", default: null },
    listingId: { type: ObjectId, ref: "Listing", default: null },
    meta: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
walletTxSchema.index({ userId: 1, createdAt: -1 });
export const WalletTransaction = model("WalletTransaction", walletTxSchema);

// ---------- Report ----------
const reportSchema = new Schema(
  {
    bookingId: { type: ObjectId, ref: "Booking", required: true },
    listingId: { type: ObjectId, ref: "Listing", required: true },
    reporterId: { type: ObjectId, ref: "User", required: true },
    reporterRole: { type: String, enum: ["seeker", "provider"], default: "seeker" },
    againstUserId: { type: ObjectId, ref: "User", required: true, index: true },
    reason: { type: String, required: true },
    detailsText: { type: String, default: "" },
    resolution: { type: String, enum: ["refunded", "pending_review", "upheld", "rejected"], default: "refunded" },
    reviewNote: { type: String, default: "" },
  },
  { timestamps: true },
);
export const Report = model("Report", reportSchema);

// ---------- CancelReason ----------
const cancelReasonSchema = new Schema(
  {
    listingId: { type: ObjectId, ref: "Listing", required: true },
    userId: { type: ObjectId, ref: "User", required: true },
    reasons: [String],
    detailsText: { type: String, default: "" },
    penalty: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export const CancelReason = model("CancelReason", cancelReasonSchema);

// ---------- Withdrawal requests (payout queue) ----------
const withdrawalSchema = new Schema(
  {
    userId: { type: ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true },
    destination: { type: String, enum: ["promptpay", "bank"], required: true },
    accountName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    bankName: { type: String, default: "" },
    status: { type: String, enum: ["pending", "paid", "rejected", "cancelled"], default: "pending" },
    txId: { type: ObjectId, ref: "WalletTransaction" },
  },
  { timestamps: true },
);
// One pending payout per user, enforced by the database (no double-spend race).
// (Compound key: a plain { userId: 1 } would clash with the field index above and never be created.)
withdrawalSchema.index({ userId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: "pending" } });
export const Withdrawal = model("Withdrawal", withdrawalSchema);

// ---------- Rate limiting (shared across server instances) ----------
const rateLimitSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  resetAt: { type: Date, required: true },
});
rateLimitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });
export const RateLimit = model("RateLimit", rateLimitSchema);

// ---------- Admin audit log ----------
const adminLogSchema = new Schema(
  {
    action: { type: String, required: true },
    target: { type: String, default: "" },
    ip: { type: String, default: "" },
    details: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
export const AdminLog = model("AdminLog", adminLogSchema);

// ---------- In-app notifications (auto-deleted after 30 days) ----------
const notificationSchema = new Schema(
  {
    userId: { type: ObjectId, ref: "User", required: true },
    kind: { type: String, enum: NOTIFICATION_KINDS, default: "system" },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    listingId: { type: ObjectId, ref: "Listing", default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
export const Notification = model("Notification", notificationSchema);
