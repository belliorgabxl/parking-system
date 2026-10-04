"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/client";
import { SEEKER_CANCEL_REASONS } from "@/lib/constants";
import { baht, clock, mmss } from "@/lib/format";
import { useCountdown, usePoll } from "@/lib/hooks";
import type { TransactionView } from "@/lib/types";
import { useApp } from "@/components/AppProvider";
import { ConfirmSheet, ErrorScreen, FloorBadge, KV, LoadingScreen, Spinner, SuccessHero, TopBar } from "@/components/ui";
import { IconArrow, IconCar, IconClock, IconDown, IconEdit, IconSad } from "@/components/Icons";

type View = TransactionView & { kind: "transaction" | "spot" };
type L = View["listing"];
type B = NonNullable<View["booking"]>;

const REPORT_STATUS: Record<string, string> = {
  pending_review: "Under review",
  upheld: "Reviewed — upheld",
  rejected: "Reviewed — not upheld",
  refunded: "Refunded",
};

/** Buzz + toast when the other party moves the handover forward. */
function useStatusNotifier(status: string | undefined, role: string | undefined, providerLeft: boolean) {
  const { toast, refreshMe } = useApp();
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (!status) return;
    const key = `${status}:${providerLeft}`;
    if (prev.current && prev.current !== key) {
      const msg =
        role === "provider"
          ? {
              MATCHED: "Driver matched! Get ready to leave.",
              SEEKER_ARRIVED: "Your seeker has arrived — please leave now.",
              OPEN: "The driver cancelled — finding you another one.",
            }[status]
          : status === "SEEKER_ARRIVED" && providerLeft
            ? "The provider has left — pull in now."
            : undefined;
      if (msg) {
        toast(msg);
        try {
          navigator.vibrate?.([200, 100, 200]);
        } catch {}
      }
      refreshMe();
    }
    prev.current = key;
  }, [status, role, providerLeft, toast, refreshMe]);
}

export default function TripPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, setData, error, stale } = usePoll<View>(`/api/listings/${id}`, 2_000);
  useStatusNotifier(data?.listing?.status, data?.role, !!data?.listing?.providerLeftAt);

  useEffect(() => {
    if (data?.kind === "spot") router.replace(`/spot/${id}`);
  }, [data, id, router]);

  if (error) return <ErrorScreen message={error.message} />;
  if (!data || data.kind !== "transaction") return <LoadingScreen />;

  return (
    <>
      {stale && <div className="offline bg-[#52525b]">Weak signal — reconnecting…</div>}
      {/* Keyed by state so each step mounts fresh and starts scrolled to the top on a phone. */}
      {data.role === "provider" ? (
        <ProviderTrip key={`p-${data.listing.status}-${!!data.listing.providerLeftAt}`} v={data} onUpdate={setData} />
      ) : (
        <SeekerTrip key={`s-${data.listing.status}-${!!data.listing.providerLeftAt}`} v={data} onUpdate={setData} />
      )}
    </>
  );
}

// ---------------------------------------------------------------- shared pieces

function Countdown({ v, until, label, doneLabel }: { v: View; until: string | null; label: string; doneLabel: string }) {
  const left = useCountdown(until, v.serverNow);
  return (
    <div className="card dark col items-center gap-0.5">
      <span className="muted small">{left > 0 ? label : doneLabel}</span>
      <span className={`countdown ${left < 3 * 60_000 ? "urgent" : ""}`}>
        {mmss(left)}
        <span className="ml-1.5 text-[16px] text-[#a1a1aa]">min</span>
      </span>
    </div>
  );
}

/** Inline countdown line, e.g. "Auto-confirms in 09:41". */
function Deadline({ v, until, children }: { v: View; until: string | null; children: (left: string) => ReactNode }) {
  const left = useCountdown(until, v.serverNow);
  if (!until) return null;
  return (
    <p className="small muted center row justify-center gap-1.5">
      <IconClock size={14} /> {children(mmss(left))}
    </p>
  );
}

function LocationRows({ l, withCar }: { l: L; withCar?: boolean }) {
  return (
    <KV
      rows={[
        ["Building", l.building.name],
        ["Floor", l.floor],
        ["Zone", l.zone],
        ["Entrance", l.entrance || "—"],
        ["Landmark", l.landmark || "—"],
        ...(withCar ? ([["Their car", l.vehicle]] as [string, ReactNode][]) : []),
      ]}
    />
  );
}

function MoneySummary({ v }: { v: View }) {
  return (
    <div className="card">
      <div className="list">
        {v.ledger.map((t) => (
          <div key={t.id} className="list-item py-2.5">
            <span className="grow">
              {t.type === "payment_hold"
                ? t.external
                  ? (t.paymentLabel ?? (t.method === "qr" ? "QR payment" : "Credit card"))
                  : "Wallet payment"
                : t.label}
            </span>
            <span className={`mono font-bold ${t.amount < 0 ? "red" : "green"}`}>{baht(t.amount, { sign: true })}</span>
          </div>
        ))}
        {v.ledger.length === 0 && <span className="muted small">No charges.</span>}
      </div>
      <div className="row between mt-2.5 border-t border-dashed border-line-strong pt-2.5">
        <span className="muted">Wallet balance</span>
        <Link href="/wallet" className="mono tap font-bold">
          {baht(v.balance)}
        </Link>
      </div>
    </div>
  );
}

function Outcome({
  happy,
  title,
  text,
  v,
  cta,
  big,
}: {
  happy?: boolean;
  title: string;
  text?: ReactNode;
  v: View;
  cta: ReactNode;
  big?: ReactNode;
}) {
  return (
    <div className="screen">
      <TopBar back="/" />
      <div className="body">
        {happy ? (
          <SuccessHero title={title} subtitle={text} />
        ) : (
          <div className="center col mt-2 items-center gap-1.5">
            <span className="faint font-semibold">Unfortunately</span>
            <div className="hero-icon sad">
              <IconSad />
            </div>
            <h2 className="h-title">{title}</h2>
            {text && <p className="muted">{text}</p>}
          </div>
        )}
        {big && <div className="center">{big}</div>}
        <MoneySummary v={v} />
        {v.report && (
          <div className="banner info">
            Your report “{v.report.reason}” · <b>{REPORT_STATUS[v.report.resolution] ?? v.report.resolution}</b>
          </div>
        )}
        <p className="small faint center">
          {v.listing.floor} · Zone {v.listing.zone} · {v.listing.building.name}
        </p>
      </div>
      <div className="footer">{cta}</div>
    </div>
  );
}

function LoginPrompt({ text }: { text: string }) {
  const { me } = useApp();
  if (!me?.user.isGuest) return null;
  return (
    <div className="card row">
      <span className="small grow">{text}</span>
      <Link href="/login?next=/" className="btn btn-dark btn-sm">
        Log in
      </Link>
    </div>
  );
}

function useAction(id: string, onUpdate: (v: View) => void) {
  const { refreshMe, toast } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (action: string, body?: unknown, okMsg?: string) => {
    setBusy(action);
    try {
      const v = await api<View>(`/api/listings/${id}/${action}`, { body: body ?? {} });
      if (v.kind === "transaction") onUpdate(v);
      refreshMe();
      if (okMsg) toast(okMsg);
      return v;
    } catch (err) {
      toast(errorMessage(err));
      return null;
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

// ---------------------------------------------------------------- provider

function ProviderTrip({ v, onUpdate }: { v: View; onUpdate: (v: View) => void }) {
  const l = v.listing;
  const b = v.booking;
  const { busy, run } = useAction(l.id, onUpdate);
  const [seekers, setSeekers] = useState<number | null>(null);
  const { me } = useApp();

  useEffect(() => {
    if (l.status !== "OPEN") return;
    api<{ demand: { seekers: number } }>(`/api/quote?buildingId=${l.building.id}`)
      .then((q) => setSeekers(q.demand.seekers))
      .catch(() => {});
  }, [l.status, l.building.id]);

  const home = (
    <Link href="/" className="btn btn-dark">
      Back to home
    </Link>
  );
  const offerAgain = (
    <>
      <Link href="/offer" className="btn btn-yellow">
        Offer again
      </Link>
      <Link href="/" className="btn btn-ghost">
        Back to home
      </Link>
    </>
  );

  switch (l.status) {
    case "COMPLETED":
      return (
        <Outcome
          happy
          v={v}
          title="Handover success!"
          text={`Thanks for sharing your spot with ${b?.seekerName ?? "a driver"}.`}
          big={<span className="big-amount green">+{baht(l.providerEarning)}</span>}
          cta={
            <>
              <LoginPrompt text="Log in to keep your earnings safe and withdraw to your bank." />
              {home}
            </>
          }
        />
      );
    case "SEEKER_NO_SHOW":
      return (
        <Outcome
          v={v}
          title="Seeker couldn't come in time"
          text="You're free to leave. The seeker's late penalty goes to you."
          cta={home}
        />
      );
    case "PROVIDER_NO_LEAVE":
      return (
        <Outcome
          v={v}
          title="You didn't leave in time"
          text="The seeker was refunded and a ฿20 penalty was charged."
          cta={home}
        />
      );
    case "CANCELLED_BY_PROVIDER":
      return <Outcome v={v} title="Hope to see you next time" text="You cancelled after a driver was matched." cta={home} />;
    case "CANCELLED_FREE":
      return <Outcome v={v} title="Offer cancelled" text="No driver was matched yet, so there's no charge." cta={offerAgain} />;
    case "EXPIRED":
      return (
        <Outcome
          v={v}
          title="No driver this time"
          text="Your leave time passed before anyone grabbed the spot. No charge."
          cta={offerAgain}
        />
      );
    case "DISPUTED":
      return (
        <Outcome
          v={v}
          title="This handover was closed"
          text="The seeker reported a problem or support closed it. The seeker was refunded and our team will review it."
          cta={home}
        />
      );
  }

  const earnFooter = (
    <div className="footer-row">
      <span>You&apos;ll get from this leaving</span>
      <strong className="mono">{baht(l.providerEarning)}</strong>
    </div>
  );

  if (l.status === "OPEN") {
    return (
      <div className="screen">
        <TopBar title="Your spot" back="/" />
        <div className="body">
          <div className="card dark col gap-1.5">
            <span className="row gap-2.5 text-[18px] font-bold">
              <Spinner /> Looking for a driver…
            </span>
            <span className="muted">
              <span className="mono font-bold text-primary">{seekers ?? "…"}</span> drivers searching nearby
            </span>
          </div>
          <div className="card row">
            <FloorBadge floor={l.floor} zone={l.zone} />
            <div className="col grow gap-0.5">
              <b>
                {l.floor} · Zone {l.zone}
              </b>
              <span className="small muted">{[l.entrance, l.landmark].filter(Boolean).join(" · ") || l.building.name}</span>
              <span className="small muted">{l.vehicle}</span>
            </div>
            <Link href={`/offer?edit=${l.id}`} className="btn btn-outline btn-sm">
              <IconEdit /> Edit
            </Link>
          </div>
          <Countdown v={v} until={l.leaveAt} label="Please be ready in" doneLabel="Leave time reached — still looking" />
          <div className="row justify-center gap-2">
            <span className="small muted">Leaving at {clock(l.leaveAt)}</span>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => run("extend", { minutes: 10 }, "Leave time extended by 10 min")}
              disabled={!!busy}
            >
              {busy === "extend" ? <Spinner /> : "+10 min"}
            </button>
          </div>
          <p className="small faint center">Stay near your car — we&apos;ll buzz you when a driver is matched.</p>
        </div>
        <div className="footer">
          {earnFooter}
          {me?.user.isGuest && (
            <Link href="/login?next=/" className="small link center">
              Log in to save your earnings
            </Link>
          )}
          <Link href={`/trip/${l.id}/cancel`} className="btn btn-outline">
            Change your mind? <IconArrow />
          </Link>
        </div>
      </div>
    );
  }

  // MATCHED / SEEKER_ARRIVED
  const arrived = l.status === "SEEKER_ARRIVED";
  return (
    <div className="screen">
      <TopBar title="Your spot" back="/" />
      <div className="body">
        <div className="card yellow col gap-1">
          <span className="text-[18px] font-[750]">{arrived ? "Your seeker has arrived!" : "Driver matched!"}</span>
          <span className="muted">
            {arrived
              ? l.providerLeftAt
                ? "Waiting for them to pull in and confirm…"
                : "Please pull out now so they can take your spot."
              : "Seeker is heading to your spot"}
          </span>
        </div>
        {!arrived && (
          <Countdown v={v} until={l.leaveAt} label="Please be ready in" doneLabel="Leave time reached — waiting for the seeker" />
        )}
        {arrived && !l.providerLeftAt && (
          <Countdown
            v={v}
            until={v.deadlines.providerLeaveBy}
            label={`Pull out by ${v.deadlines.providerLeaveBy ? clock(v.deadlines.providerLeaveBy) : ""} at the latest`}
            doneLabel="Time's up — please leave now"
          />
        )}
        {b && (
          <div className="card row">
            <span className="avatar">{b.seekerName.charAt(0).toUpperCase()}</span>
            <div className="col grow gap-0.5">
              <b>
                {b.seekerName} {arrived ? "is here" : "is on the way"}
              </b>
              <span className="small muted row gap-1.5">
                <IconCar size={16} /> {b.seekerVehicle || "Car details pending"}
                {!arrived && ` · ${b.etaMinutes} min away`}
              </span>
            </div>
          </div>
        )}
        <details className="card collapsible">
          <summary>
            Location details <IconDown />
          </summary>
          <div className="mt-2">
            <LocationRows l={l} />
          </div>
        </details>
        {l.providerLeftAt && (
          <Deadline v={v} until={v.deadlines.autoCompleteAt}>
            {(t) => <>You&apos;ll be paid automatically in {t} if the seeker doesn&apos;t confirm sooner.</>}
          </Deadline>
        )}
        <Link href={`/trip/${l.id}/report`} className="link-arrow self-center">
          Having problems? <IconArrow />
        </Link>
      </div>
      <div className="footer">
        {earnFooter}
        {arrived &&
          (l.providerLeftAt ? (
            <button className="btn btn-outline" disabled>
              <Spinner /> Waiting for confirmation
            </button>
          ) : (
            <button className="btn btn-yellow" onClick={() => run("leaving")} disabled={!!busy}>
              {busy ? <Spinner /> : "I'm leaving now"}
            </button>
          ))}
        {!l.providerLeftAt && (
          <Link href={`/trip/${l.id}/cancel`} className="btn btn-ghost nowrap text-[14px]">
            Change your mind?&nbsp;<span className="red">Cancel will be charged</span>
          </Link>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- seeker

function SeekerCancel({ v, onDone, onClose }: { v: View; onDone: (v: View) => void; onClose: () => void }) {
  const { busy, run } = useAction(v.listing.id, onDone);
  const freeLeft = useCountdown(v.deadlines.freeCancelUntil, v.serverNow);
  const [reason, setReason] = useState<string>("");
  const free = freeLeft > 0;
  return (
    <ConfirmSheet
      title="Cancel this booking?"
      danger
      busy={!!busy}
      confirmLabel={free ? "Cancel for free" : "Cancel and pay ฿20"}
      body={
        free ? (
          <>
            Free cancellation for <b className="mono">{mmss(freeLeft)}</b> more. You&apos;ll get a full refund to your wallet.
          </>
        ) : (
          <>The provider is already waiting for you. A ฿20 fee applies and the rest is refunded to your wallet.</>
        )
      }
      onConfirm={() => run("cancel_booking", { reason }, "Booking cancelled")}
      onClose={onClose}
    >
      <div className="chips">
        {SEEKER_CANCEL_REASONS.map((r) => (
          <button key={r} type="button" className={`chip ${reason === r ? "on" : ""}`} onClick={() => setReason(r)}>
            {r}
          </button>
        ))}
      </div>
    </ConfirmSheet>
  );
}

function SeekerTrip({ v, onUpdate }: { v: View; onUpdate: (v: View) => void }) {
  const l = v.listing;
  const b = v.booking as B;
  const { busy, run } = useAction(l.id, onUpdate);
  const [cancelOpen, setCancelOpen] = useState(false);
  const findNew = (
    <Link href="/" className="btn btn-yellow">
      Find new parking
    </Link>
  );

  switch (l.status) {
    case "COMPLETED":
      return (
        <Outcome
          happy
          v={v}
          title="Handover success!"
          text={`You're parked at ${l.floor} · Zone ${l.zone}.`}
          big={<span className="big-amount">{baht(b.amountHeld)} paid</span>}
          cta={<SeekerSuccessCta />}
        />
      );
    case "SEEKER_NO_SHOW":
      return (
        <Outcome
          v={v}
          title="You didn't come in time"
          text="The provider waited until the leave time. A ฿20 late penalty was taken from your refund."
          cta={
            <Link href="/" className="btn btn-dark">
              Back to home
            </Link>
          }
        />
      );
    case "CANCELLED_BY_SEEKER":
      return <Outcome v={v} title="Booking cancelled" text="Your refund is in your wallet." cta={findNew} />;
    case "PROVIDER_NO_LEAVE":
      return (
        <Outcome
          v={v}
          title="Provider couldn't leave in time"
          text={`Your ${baht(b.amountHeld)} was refunded to your wallet.`}
          cta={findNew}
        />
      );
    case "CANCELLED_BY_PROVIDER":
      return (
        <Outcome
          v={v}
          title="The provider cancelled"
          text={`Your ${baht(b.amountHeld)} was refunded to your wallet.`}
          cta={findNew}
        />
      );
    case "DISPUTED":
      return (
        <Outcome v={v} title="Sorry to hear that" text={`We refunded ${baht(b.amountHeld)} to your wallet.`} cta={findNew} />
      );
  }

  if (l.status === "MATCHED") {
    return (
      <div className="screen">
        <TopBar title="Your parking" back="/" />
        <div className="body">
          <SuccessHero title="You're matched!" subtitle={`Your provider will leave at ${clock(l.leaveAt)}`} />
          <Countdown v={v} until={l.leaveAt} label="Please be nearby in" doneLabel="Leave time reached — hurry!" />
          <div className="card">
            <div className="row mb-1.5">
              <FloorBadge floor={l.floor} zone={l.zone} />
              <div className="col gap-0.5">
                <b>
                  Floor {l.floor} · Zone {l.zone}
                </b>
                <span className="small muted">Provider: {l.providerName}</span>
              </div>
            </div>
            <LocationRows l={l} withCar />
            {l.descriptionText && <p className="small muted">“{l.descriptionText}”</p>}
          </div>
          <div className="row justify-between">
            <button className="link-arrow" onClick={() => setCancelOpen(true)}>
              Cancel booking
            </button>
            <Link href={`/trip/${l.id}/report`} className="link-arrow">
              Having problems? <IconArrow />
            </Link>
          </div>
        </div>
        <div className="footer">
          <button className="btn btn-yellow" onClick={() => run("arrive")} disabled={!!busy}>
            {busy ? <Spinner /> : "I've arrived"}
          </button>
        </div>
        {cancelOpen && (
          <SeekerCancel
            v={v}
            onDone={(nv) => {
              onUpdate(nv);
              setCancelOpen(false);
            }}
            onClose={() => setCancelOpen(false)}
          />
        )}
      </div>
    );
  }

  // SEEKER_ARRIVED
  return (
    <div className="screen">
      <TopBar title="Your parking" back="/" />
      <div className="body center-v">
        <div className="hero-icon yellow">P</div>
        <h2 className="h-title center">{l.providerLeftAt ? "Provider is leaving" : "Provider is getting ready"}</h2>
        <p className="muted center">
          {l.providerLeftAt
            ? `Pull into Floor ${l.floor}, Zone ${l.zone} and confirm once you've parked.`
            : `We've told ${l.providerName} you're here. Look for the ${l.vehicle}.`}
        </p>
        {l.providerLeftAt ? (
          <Deadline v={v} until={v.deadlines.autoCompleteAt}>
            {(t) => <>Auto-confirms in {t} unless you report a problem.</>}
          </Deadline>
        ) : (
          <Deadline v={v} until={v.deadlines.providerLeaveBy}>
            {(t) => <>If they haven&apos;t left in {t}, you get a full refund automatically.</>}
          </Deadline>
        )}
        <div className="card">
          <LocationRows l={l} withCar />
        </div>
        <Link href={`/trip/${l.id}/report`} className="link-arrow self-center">
          Having problems? <IconArrow />
        </Link>
      </div>
      <div className="footer">
        <button className="btn btn-yellow" onClick={() => run("complete")} disabled={!!busy}>
          {busy ? <Spinner /> : "Complete parking"}
        </button>
      </div>
    </div>
  );
}

function SeekerSuccessCta() {
  const { me } = useApp();
  if (me?.user.isGuest) {
    return (
      <>
        <p className="center font-semibold">Log in for easy payment next time?</p>
        <Link href="/login?next=/" className="btn btn-dark">
          Log in
        </Link>
        <Link href="/" className="btn btn-outline">
          Back to home
        </Link>
      </>
    );
  }
  return (
    <>
      <p className="small muted center">When you come back to leave, offer this spot from Home and earn.</p>
      <Link href="/" className="btn btn-dark">
        Back to home
      </Link>
    </>
  );
}
