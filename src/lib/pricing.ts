import type { DemandLevel } from "./constants";

/**
 * Pricing model (answers spec Open Questions 1–3; all values in THB, tweak here):
 *  - Provider earnings are set by demand (฿25 / ฿35 / ฿40) and stay inside the ฿20–50 target.
 *  - Lady parking bay adds ฿10 to provider earnings ("Earn up to ฿50").
 *  - Seeker price = provider earnings + a flat platform fee of ฿30 (฿40 earning → ฿70 price, as in the prototype).
 *  - Penalty is ฿20. When a seeker no-shows the provider receives ฿10 and the platform keeps ฿10.
 */
export const PROVIDER_EARNING: Record<DemandLevel, number> = { Low: 25, Medium: 35, High: 40 };
export const LADY_BAY_BONUS = 10;
export const PLATFORM_FEE = 30;
export const PENALTY = 20;
export const NO_SHOW_PROVIDER_SHARE = 10;
export const MAX_PROVIDER_EARNING = PROVIDER_EARNING.High + LADY_BAY_BONUS;

/** Grace period after the leave time before an unmatched spot expires / a matched seeker is a no-show. */
export const ARRIVAL_GRACE_MS = 2 * 60 * 1000;
/** Once the seeker has arrived, the provider must pull out within this window (from arrival or leave time, whichever is later). */
export const PROVIDER_LEAVE_TIMEOUT_MS = 5 * 60 * 1000;
/** After the provider pulls out, the handover auto-completes if the seeker neither confirms nor reports. */
export const HANDOVER_AUTOCOMPLETE_MS = 10 * 60 * 1000;
/** A seeker paying by QR reserves the spot for this long so nobody else grabs it mid-scan. */
export const PAYMENT_HOLD_MS = 3 * 60 * 1000;
/** A seeker can cancel for free this soon after matching (mis-taps); afterwards the no-show penalty applies. */
export const FREE_SEEKER_CANCEL_MS = 2 * 60 * 1000;
/** Quick "+N min" extension while still looking for a driver. */
export const EXTEND_STEP_MINUTES = 10;
/** Providers below this standing score can't offer spots until reviewed. */
export const MIN_STANDING_TO_OFFER = 40;
/** Guests may offer this many spots; after that a phone login is required so penalties and bans stick to a person. */
export const GUEST_OFFER_LIMIT = 1;
/** Allowed leave-time range when offering a spot. */
export const MIN_LEAVE_MINUTES = 5;
export const MAX_LEAVE_MINUTES = 120;
export const DEFAULT_LEAVE_MINUTES = 20;

export function quote(demand: DemandLevel, isLadyBay: boolean) {
  const providerEarning = PROVIDER_EARNING[demand] + (isLadyBay ? LADY_BAY_BONUS : 0);
  return { providerEarning, price: providerEarning + PLATFORM_FEE };
}

export function demandLevel(seekers: number, spots: number): DemandLevel {
  const ratio = seekers / Math.max(spots, 1);
  if (ratio >= 3) return "High";
  if (ratio >= 1.5) return "Medium";
  return "Low";
}
