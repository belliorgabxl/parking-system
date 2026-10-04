// Shared between server and client. Keep free of server-only imports.

export const LISTING_STATUSES = [
  "OPEN",
  "MATCHED",
  "SEEKER_ARRIVED",
  "COMPLETED",
  "CANCELLED_FREE",
  "EXPIRED",
  "CANCELLED_BY_PROVIDER",
  "SEEKER_NO_SHOW",
  "PROVIDER_NO_LEAVE",
  "DISPUTED",
  "CANCELLED_BY_SEEKER", // booking-only: seeker cancelled, listing re-opens for another driver
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const ACTIVE_STATUSES: ListingStatus[] = ["OPEN", "MATCHED", "SEEKER_ARRIVED"];
export const ACTIVE_BOOKING_STATUSES: ListingStatus[] = ["MATCHED", "SEEKER_ARRIVED"];

export const PAYMENT_METHODS = ["qr", "wallet", "card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  qr: "QR payment",
  wallet: "Wallet",
  card: "Credit card",
};

export const TX_TYPES = [
  "topup",
  "withdraw",
  "payment_hold", // seeker pays (wallet = balance debit, external = record only)
  "earning", // provider payout at COMPLETED
  "compensation", // provider share of a seeker penalty
  "refund",
  "penalty",
  "adjustment", // dev/demo credit
] as const;
export type TxType = (typeof TX_TYPES)[number];

export const SPOT_TYPES = ["indoor", "rooftop", "outdoor"] as const;
export type SpotType = (typeof SPOT_TYPES)[number];
export const CAR_SIZES = ["any", "compact", "sedan", "suv"] as const;
export type CarSize = (typeof CAR_SIZES)[number];

export const SPOT_TYPE_LABEL: Record<SpotType, string> = { indoor: "Indoor", rooftop: "Rooftop", outdoor: "Outdoor" };
export const CAR_SIZE_LABEL: Record<CarSize, string> = { any: "Any size", compact: "Compact", sedan: "Sedan", suv: "SUV" };

export const CANCEL_REASONS = ["My plans changed", "I need to leave earlier", "I can't find my car"] as const;
export const REPORT_REASONS = ["I can't find the spot", "Provider left but I can't park", "Others"] as const;
export const PROVIDER_REPORT_REASONS = [
  "Seeker isn't responding",
  "Someone else took my spot",
  "Seeker's car doesn't match",
  "Others",
] as const;
export const SEEKER_CANCEL_REASONS = ["I found another spot", "I'm stuck in traffic", "Changed my plans", "Others"] as const;

export const NOTIFICATION_KINDS = [
  "match",
  "arrived",
  "leaving",
  "completed",
  "refund",
  "penalty",
  "cancelled",
  "report",
  "wallet",
  "system",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const AMOUNT_PRESETS = [100, 300, 500, 1000];
export const MIN_TOPUP = 20;
export const MAX_TOPUP = 20000;
export const MIN_WITHDRAW = 100;

export type DemandLevel = "Low" | "Medium" | "High";
