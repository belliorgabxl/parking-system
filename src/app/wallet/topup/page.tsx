"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, errorMessage } from "@/lib/client";
import { MAX_TOPUP, MIN_TOPUP } from "@/lib/constants";
import { baht, mmss } from "@/lib/format";
import { useCountdown } from "@/lib/hooks";
import { CardPicker, type CardChoice } from "@/components/CardPicker";
import { useApp } from "@/components/AppProvider";
import { AmountPicker } from "@/components/AmountPicker";
import { FakeQr } from "@/components/FakeQr";
import { LoadingScreen, Option, Sheet, Spinner, SuccessHero, TopBar } from "@/components/ui";
import { IconCard, IconQr } from "@/components/Icons";

function TopUp() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const initial = Number(params.get("amount")) || 300;
  const { me, refreshMe } = useApp();
  const [amount, setAmount] = useState(initial);
  const [custom, setCustom] = useState<string | null>([100, 300, 500, 1000].includes(initial) ? null : String(initial));
  const [method, setMethod] = useState<"qr" | "card" | null>(null);
  const [qr, setQr] = useState<string | null>(null); // QR expiry (ISO)
  const [card, setCard] = useState<CardChoice>(null);
  const qrLeft = useCountdown(qr);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ balance: number } | null>(null);

  const value = custom !== null ? Number(custom || 0) : amount;
  const invalid = value < MIN_TOPUP ? `Minimum ${baht(MIN_TOPUP)}` : value > MAX_TOPUP ? `Maximum ${baht(MAX_TOPUP)}` : null;

  const pay = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ balance: number }>("/api/wallet/topup", {
        body: { amount: value, method, ...(method === "card" ? card : {}) },
      });
      setQr(null);
      await refreshMe();
      // Returning to payment: go straight back so the seeker can finish grabbing the spot.
      if (next) {
        router.replace(next);
        return;
      }
      setDone(r);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="screen">
        <TopBar back="/wallet" />
        <div className="body">
          <SuccessHero title="Top up successful" />
          <div className="card center col items-center">
            <span className="muted small">New balance</span>
            <span className="big-amount">{baht(done.balance)}</span>
          </div>
        </div>
        <div className="footer">
          {me?.user.isGuest && (
            <>
              <p className="center small muted">Log in so your balance is saved to your account.</p>
              <Link href="/login?next=/wallet" className="btn btn-dark">
                Log in
              </Link>
            </>
          )}
          <Link href="/wallet" className={`btn ${me?.user.isGuest ? "btn-outline" : "btn-dark"}`}>
            Done
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar title="Top up" back={next ?? "/wallet"} />
      <div className="body">
        <div className="row between">
          <span className="muted">Remaining balance</span>
          <span className="mono font-bold">{me ? baht(me.balance) : "…"}</span>
        </div>
        <h2 className="h-section">Amount</h2>
        <AmountPicker
          amount={amount}
          custom={custom}
          onPreset={(n) => {
            setAmount(n);
            setCustom(null);
          }}
          onCustom={setCustom}
        />
        {invalid && custom !== null && custom !== "" && <span className="err">{invalid}</span>}
        <h2 className="h-section">Payment method</h2>
        <div className="options">
          <Option
            on={method === "qr"}
            onClick={() => setMethod("qr")}
            icon={<IconQr />}
            title="QR payment"
            subtitle="PromptPay / any banking app"
          />
          <Option
            on={method === "card"}
            onClick={() => setMethod("card")}
            icon={<IconCard />}
            title="Credit card"
            subtitle={me?.payments.find((p) => p.kind === "card" && p.isDefault)?.label ?? "Visa, Mastercard, JCB"}
          />
          {method === "card" && <CardPicker onChange={setCard} />}
        </div>
        {err && <div className="banner error">{err}</div>}
      </div>
      <div className="footer">
        <button
          className="btn btn-yellow"
          disabled={!method || !!invalid || busy || (method === "card" && !card)}
          onClick={() => (method === "qr" ? setQr(new Date(Date.now() + 5 * 60_000).toISOString()) : pay())}
        >
          {busy ? (
            <Spinner />
          ) : !method ? (
            "Choose a payment method"
          ) : method === "card" && !card ? (
            "Enter card details"
          ) : (
            `Top up ${baht(value)}`
          )}
        </button>
      </div>
      {qr && (
        <Sheet onClose={() => !busy && setQr(null)}>
          <h3 className="h-section center">Scan with any banking app</h3>
          {qrLeft > 0 ? (
            <>
              <FakeQr seed={`topup-${value}-${qr}`} />
              <p className="center big-amount text-[28px]">{baht(value)}</p>
              <p className="center small muted">
                Code expires in <b className="mono">{mmss(qrLeft)}</b>
              </p>
              <button className="btn btn-dark" onClick={pay} disabled={busy}>
                {busy ? <Spinner /> : "I've paid"}
              </button>
            </>
          ) : (
            <>
              <div className="banner warn">This QR code expired.</div>
              <button className="btn btn-dark" onClick={() => setQr(new Date(Date.now() + 5 * 60_000).toISOString())}>
                Get a new code
              </button>
            </>
          )}
          <p className="small faint center">Demo: no real payment is taken.</p>
        </Sheet>
      )}
    </div>
  );
}

export default function TopUpPage() {
  return (
    <Suspense fallback={<LoadingScreen title="Top up" />}>
      <TopUp />
    </Suspense>
  );
}
