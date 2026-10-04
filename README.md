# ParkSwap

Peer-to-peer parking spot exchange for crowded shopping malls. A driver who is about to leave (provider) posts their spot; a driver looking for parking (seeker) grabs it, pays into escrow, and takes the spot when the provider pulls out.

Next.js 16 (App Router), MongoDB via Mongoose, no other runtime dependencies.

## Getting started

```bash
npm install
cp .env.example .env.local   # set MONGODB_URI
npm run dev                  # http://localhost:3000
```

Buildings (Samyan Mitrtown, Siam Paragon, CentralWorld) are seeded automatically on first request. With `PARKSWAP_SIMULATION=on`, bot providers keep a few spots open per mall, and bot seekers grab your offered spot.

The app is a phone-width web app (max 430px), meant to be opened on a phone. In `npm run dev` the bots make it playable alone: offer a spot and a bot driver matches in ~5 s; grab a bot's spot and the provider leaves ~3 s after you tap "I've arrived".

## Features

| Area | What's included |
|---|---|
| Home | Mall picker, demand card, best spots + filters (soonest / cheapest / fits SUV / lady bay / rooftop), refresh, wallet chip, notification bell, resume an in-progress handover, "Heading back? Offer this spot" after parking (closes the seeker → provider loop) |
| Provider | Describe spot (free text + voice, auto-detects floor/zone), chips, saved-car chips, leave time, lady bay +฿10, confirm, looking for a driver (edit, **+10 min**), matched, seeker arrived → "I'm leaving now" with a deadline, **Having problems?** (provider report), success |
| Seeker | Spot details (car hidden until matched, "someone is paying" state), **your car** at checkout, pay by QR (**3-min spot hold**) / wallet / card (saved or new), top up and return, matched, **cancel booking** (free for 2 min), I've arrived, provider is leaving (auto-confirm countdown), complete, success |
| Failure cases | Seeker late / no-show, seeker cancelled, provider didn't leave (incl. never pulled out after arrival), provider cancelled, reported, no driver (expired), free cancel, closed by support |
| Wallet | Ledger balance, escrow, in/out tabs, top up (QR expiry / card), withdraw (login + name match, saved PromptPay), **withdrawal list + cancel pending** |
| Account | OTP login (resend cooldown + expiry), guest data migrates, profile name, **cars CRUD**, **payment methods CRUD**, handover history (tabs), notifications, logout, **delete account** |
| Notifications | In-app inbox for every state change (match, arrival, leaving, payout, refund, penalty, cancel, report); mark read / delete / clear; auto-deleted after 30 days |
| Ops | `/admin` (needs `ADMIN_KEY`): reports (uphold/reject), withdrawals (paid / reject + refund), **live handovers (force close)**, **users (search, suspend, reset standing)**, **buildings CRUD** |

### Timeouts

| What | Rule | Where |
|---|---|---|
| No driver | Spot expires at leave time + 2 min | `ARRIVAL_GRACE_MS` |
| Seeker no-show | Matched seeker not arrived by leave time + 2 min → ฿20 penalty, ฿10 to provider | `ARRIVAL_GRACE_MS` |
| Provider doesn't pull out | Seeker arrived, provider not left by max(arrival, leave time) + 5 min → seeker refunded, provider ฿20 | `PROVIDER_LEAVE_TIMEOUT_MS` |
| Seeker forgets to confirm | Auto-complete 10 min after the provider left | `HANDOVER_AUTOCOMPLETE_MS` |
| QR payment | Spot reserved 3 min for the paying seeker | `PAYMENT_HOLD_MS` |
| Seeker cancel | Free within 2 min of matching, then ฿20 | `FREE_SEEKER_CANCEL_MS` |
| OTP | Valid 5 min, resend after 30 s, 5 attempts | `api/auth/*` |
| Offer draft | Discarded after 30 min | `offer/page.tsx` |
| Notifications | TTL index, 30 days | `models.ts` |
| HTTP | 12 s timeout, 2 retries on reads | `lib/client.ts` |

All deadlines run lazily on read **and** via `GET /api/cron/sweep` (header `Authorization: Bearer $CRON_SECRET`). Schedule it every minute (Vercel Cron, GitHub Actions, cron-job.org) so refunds and penalties happen even when nobody has the app open.

## How it works

- **State machine** ([src/lib/engine.ts](src/lib/engine.ts)): `OPEN → MATCHED → SEEKER_ARRIVED → COMPLETED`, plus `CANCELLED_FREE`, `EXPIRED`, `CANCELLED_BY_PROVIDER`, `SEEKER_NO_SHOW`, `PROVIDER_NO_LEAVE`, `DISPUTED`. Every transition is a conditional `findOneAndUpdate` on the current status, so money side effects run exactly once, and grabbing is atomic: the first confirmed payment wins.
- **Deadlines without a worker**: time-based rules (expiry, no-show, 15-minute auto-complete after arrival) and the simulation bots run lazily whenever a listing is read. Clients poll the trip screen every 2s.
- **Escrow and ledger** ([src/lib/ledger.ts](src/lib/ledger.ts)): balance = sum of `WalletTransaction`. A wallet payment debits the balance at match time; QR/card payments are recorded as `external` and do not change the balance. Refunds always go to the wallet.
- **Sessions** ([src/lib/session.ts](src/lib/session.ts)): an httpOnly cookie that holds an opaque token. A device-bound guest user is created on first request. OTP login either upgrades the guest or merges it into the existing account for that phone.
- **Weak signal**: requests time out and retry, the last good data stays on screen, and an offline banner is shown.

## Security & anti-fraud

| Risk | Protection |
|---|---|
| Fake money in production | Bots and on-screen OTP exist only in `npm run dev` or `DEMO_MODE=on`; demo mode disables withdrawals |
| Cashing out stolen cards | Wallet has two buckets: **credit** (top-ups, card/QR refunds — spend on parking only) and **cash** (earnings — withdrawable) |
| Double spend / double booking | Unique indexes: one pending withdrawal, one live booking per seeker, one live listing per provider; atomic state transitions |
| Payout redirection | Payee name locks to the first withdrawal's account holder |
| Dodging penalties / bans | Guests may offer once, then must log in; negative balance blocks offering & grabbing; suspended accounts can't self-delete; guest history (incl. debts) merges on login |
| Spot hoarding | One QR hold per person (3 min), hold attempts rate-limited |
| False reports | Instant refund (by design) but a rejected report costs the reporter 10 standing; standing < 40 blocks transacting; 3 reports/day |
| SMS bombing / OTP brute force | 3 codes per number and 10 per IP per 10 min; 5 tries per code, 10 per number per 10 min; codes hashed and bound to the session |
| Session theft from a DB leak | Only SHA-256 of session tokens stored; token rotated on login; 180-day cookie, httpOnly, SameSite=Lax |
| Bot/DB spam | Guests are created on first action (not on page views), 30 new sessions per IP per hour, idle guests purged by the cron sweep |
| Admin key guessing | Timing-safe compare, 10 wrong keys / 15 min per IP, every admin action in `adminlogs` |
| Browser attacks | CSP, `frame-ancestors 'none'`, X-Frame-Options, nosniff, HSTS (prod), `no-store` on API responses |

> Rate limits use the `x-forwarded-for` header. Deploy behind a proxy that sets it (Vercel, Cloudflare, nginx); otherwise clients can spoof their IP.

## Pricing decisions (spec open questions)

All in [src/lib/pricing.ts](src/lib/pricing.ts):

1. Provider earnings depend on demand: ฿25 / ฿35 / ฿40, with +฿10 for a lady bay (so "earn up to ฿50"). Seeker price = earnings + ฿30 platform fee (so ฿40 → ฿70, as in the prototype).
2. Penalty is ฿20. When a seeker doesn't show, the provider gets ฿10 and the platform keeps ฿10.
3. The handover window runs until the provider's chosen leave time, plus a 2-minute grace period.
4. Withdrawing requires login.

## Not production-ready yet (adapters to plug in)

- **Payments**: [src/lib/payments.ts](src/lib/payments.ts) is a mock gateway. Swap in Omise / 2C2P / GB Prime Pay. QR payments should become async (charge → webhook → grab).
- **SMS**: [src/lib/otp.ts](src/lib/otp.ts) logs the code and shows it on screen in dev.
- **Concurrency**: wallet debits check the balance before writing, and withdrawals are limited to one pending at a time. For strict guarantees, use MongoDB transactions (Atlas or a replica set).
- **Push**: notifications are in-app only. Hook web push or LINE into [src/lib/notify.ts](src/lib/notify.ts).
- **Demand**: the "drivers looking" figure is a time-of-day baseline plus real recent bookings. Replace it with live telemetry.

## Project layout

```
src/
  app/
    page.tsx               Home
    offer/                 Provider steps 1–2 (+ edit mode)
    spot/[id]/             Seeker step 1, /pay step 2
    trip/[id]/             Live handover for both roles + all outcomes, /cancel, /report
    wallet/                Wallet, /topup, /withdraw
    login/ account/ help/ admin/
    api/                   Route handlers (me, home, quote, buildings, listings/[id]/[action], wallet, auth, activity, dev, admin)
  lib/                     db, models, engine (state machine), ledger, pricing, seed/bots, session, client helpers
  components/              UI kit, AppProvider, VoiceInput
```
#   p a r k i n g - s y s t e m  
 