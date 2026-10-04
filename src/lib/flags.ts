import "server-only";

export const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Presentation / staging deployments: simulation bots and the OTP shortcut are allowed even in a
 * production build — but withdrawals are disabled because no real money moves.
 */
export const DEMO_MODE = process.env.DEMO_MODE === "on";

/** Development-only behaviour (bots, on-screen OTP). Never on in a real production deployment. */
export const DEV_TOOLS = !IS_PROD || DEMO_MODE;

/** Simulation bots: only with dev tools, and can still be switched off. */
export const SIMULATION_ON = DEV_TOOLS && process.env.PARKSWAP_SIMULATION !== "off";

/** Show OTP codes on screen (no SMS provider yet). */
export const OTP_ECHO = DEV_TOOLS;

/**
 * No SMS provider yet: accept ANY 6-digit code. Only in `npm run dev` or DEMO_MODE (where withdrawals
 * are disabled) — in a real production deployment this is always off, because it would let anyone
 * log into any account by phone number. Set OTP_BYPASS=off to test real codes locally.
 */
export const OTP_BYPASS = DEV_TOOLS && process.env.OTP_BYPASS !== "off";
