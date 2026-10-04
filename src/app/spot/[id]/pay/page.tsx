"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, ClientError, errorMessage } from "@/lib/client";
import type { PaymentMethod } from "@/lib/constants";
import { baht } from "@/lib/format";
import { usePoll } from "@/lib/hooks";
import type { SpotDetail } from "@/lib/types";
import { useApp } from "@/components/AppProvider";
import { CardPicker, type CardChoice } from "@/components/CardPicker";
import { ErrorScreen, LoadingScreen, Option, Spinner, TopBar } from "@/components/ui";
import { IconCard, IconQr, IconWallet } from "@/components/Icons";
import { PaymentSheet } from "@/components/PaymentSheet";
import { VoiceInput } from "@/components/VoiceInput";

const METHOD_KEY = "ps_pay_method";

/** Label shown while charging a card: the saved card's label, or brand + last 4 of a new one. */
function cardLabelOf(card: CardChoice, saved: { id: string; label: string }[]) {
  if (!card) return "Card";
  if ("paymentMethodId" in card) return saved.find((p) => p.id === card.paymentMethodId)?.label ?? "Card";
  const n = card.card.cardNumber.replace(/D/g, "");
  const brand = /^4/.test(n) ? "Visa" : /^(5[1-5]|2[2-7])/.test(n) ? "Mastercard" : /^3[47]/.test(n) ? "Amex" : /^35/.test(n) ? "JCB" : "Card";
  return `${brand} •••• ${n.slice(-4)}`;
}

export default function PayPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me, refreshMe, toast } = useApp();
  const { data, error } = usePoll<SpotDetail>(`/api/listings/${id}`, 10_000);
  const [method, setMethod] = useState<PaymentMethod | null>(() => {
    try {
      return typeof window === "undefined" ? null : (sessionStorage.getItem(METHOD_KEY) as PaymentMethod | null);
    } catch {
      return null;
    }
  });
  const [card, setCard] = useState<CardChoice>(null);
  const [vehicle, setVehicle] = useState<string | null>(null); // null = use default saved car
  const [busy, setBusy] = useState(false);
  const [heldUntil, setHeldUntil] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const holdRef = useRef(false);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);
  useEffect(() => {
    if (data?.kind === "transaction") router.replace(`/trip/${id}`);
  }, [data, id, router]);
  // Release the QR reservation if the seeker leaves the page mid-payment.
  useEffect(
    () => () => {
      if (holdRef.current) navigator.sendBeacon?.(`/api/listings/${id}/release`, new Blob(["{}"], { type: "application/json" }));
    },
    [id],
  );

  if (error)
    return (
      <ErrorScreen
        message={error.message}
        action={
          <Link href="/" className="btn btn-yellow mt-3">
            Find another spot
          </Link>
        }
      />
    );
  if (!data || data.kind !== "spot" || !me) return <LoadingScreen title="Payment" />;
  const s = data.spot;
  const balance = me.balance;
  const insufficient = method === "wallet" && balance < s.price;

  const choose = (m: PaymentMethod) => {
    setMethod(m);
    setErr(null);
    try {
      sessionStorage.setItem(METHOD_KEY, m);
    } catch {}
  };

  const fail = (e: unknown) => {
    if (e instanceof ClientError && e.code === "ACTIVE_BOOKING") {
      toast(e.message);
      router.replace(`/trip/${e.details.listingId}`);
      return;
    }
    if (e instanceof ClientError && (e.code === "SPOT_TAKEN" || e.code === "SPOT_HELD" || e.status === 410)) {
      toast(e.message);
      router.replace("/");
      return;
    }
    setErr(errorMessage(e));
  };

  /** Records the payment and books the spot. */
  const grabRequest = () =>
    api(`/api/listings/${id}/grab`, {
      body: { paymentMethod: method, vehicle: carText, ...(method === "card" ? card : {}) },
    }).then(() => undefined);

  const finish = async () => {
    holdRef.current = false;
    try {
      sessionStorage.removeItem(METHOD_KEY);
    } catch {}
    await refreshMe();
    router.replace(`/trip/${id}`);
  };

  const pay = async () => {
    if (!method) return;
    setBusy(true);
    setErr(null);
    try {
      if (method === "wallet") {
        // Wallet balance is internal — no bank step.
        await grabRequest();
        await finish();
        return;
      }
      // QR / card: reserve the spot while the bank confirms the payment.
      const r = await api<{ result: { heldUntil: string } }>(`/api/listings/${id}/hold`, { body: {} });
      holdRef.current = true;
      setHeldUntil(r.result.heldUntil);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const cancelPayment = () => {
    setHeldUntil(null);
    holdRef.current = false;
    api(`/api/listings/${id}/release`, { body: {} }).catch(() => {});
  };

  const carText = (vehicle ?? me.vehicle?.text ?? "").trim();
  const ready = !!method && !insufficient && (method !== "card" || !!card) && !s.heldByOther && carText.length >= 2;

  return (
    <div className="screen">
      <TopBar title="Payment" back={`/spot/${id}`} />
      <div className="body">
        <div className="field">
          <label className="label" htmlFor="my-car">
            Your car <span className="faint small">— so the provider can spot you</span>
          </label>
          {me.vehicles.length > 1 && (
            <div className="chips">
              {me.vehicles.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`chip ${carText === v.text ? "on" : ""}`}
                  onClick={() => setVehicle(v.text)}
                >
                  {v.makeModel || v.text}
                </button>
              ))}
            </div>
          )}
          <VoiceInput
            id="my-car"
            value={vehicle ?? me.vehicle?.text ?? ""}
            onChange={setVehicle}
            placeholder="Honda City, White, 7KK 2468"
            lang="en-US"
          />
        </div>
        <h2 className="h-title text-[20px]">How would you like to pay?</h2>
        {s.heldByOther && (
          <div className="banner warn">Someone else is paying for this spot right now. Try again in a minute.</div>
        )}
        <div className="options">
          <Option
            on={method === "qr"}
            onClick={() => choose("qr")}
            icon={<IconQr />}
            title="QR payment"
            subtitle="PromptPay / any banking app"
          />
          <Option
            on={method === "wallet"}
            onClick={() => choose("wallet")}
            icon={<IconWallet size={20} />}
            title="Wallet"
            subtitle={<span className="mono">Balance {baht(balance)}</span>}
          />
          <Option
            on={method === "card"}
            onClick={() => choose("card")}
            icon={<IconCard />}
            title="Credit card"
            subtitle={me.payments.find((p) => p.kind === "card" && p.isDefault)?.label ?? "Visa, Mastercard, JCB"}
          />
          {method === "card" && <CardPicker onChange={setCard} />}
        </div>

        {insufficient && (
          <div className="banner warn col items-stretch gap-2.5">
            <span>
              Not enough balance. You need <b className="mono">{baht(s.price - balance)}</b> more.
            </span>
            <div className="row">
              <Link
                href={`/wallet/topup?amount=${Math.max(100, Math.ceil((s.price - balance) / 100) * 100)}&next=/spot/${id}/pay`}
                className="btn btn-yellow btn-sm"
              >
                Top up
              </Link>
              <button className="btn btn-outline btn-sm" onClick={() => choose("qr")}>
                Use QR instead
              </button>
            </div>
          </div>
        )}
        {err && <div className="banner error">{err}</div>}
        <p className="small faint">
          Your payment is held safely and only released to the provider after you confirm parking. If the provider doesn&apos;t
          leave, you get a full refund to your wallet. Changed your mind? Cancelling within 2 minutes is free.
        </p>
      </div>
      <div className="footer">
        <div className="footer-row">
          <span>
            {s.floor} · Zone {s.zone}
          </span>
          <strong className="mono">{baht(s.price)}</strong>
        </div>
        <button className="btn btn-yellow" disabled={!ready || busy} onClick={pay}>
          {busy && !heldUntil ? (
            <Spinner />
          ) : carText.length < 2 ? (
            "Add your car"
          ) : !method ? (
            "Choose a payment method"
          ) : method === "card" && !card ? (
            "Enter card details"
          ) : (
            `Pay ${baht(s.price)}`
          )}
        </button>
      </div>

      {heldUntil && (method === "qr" || method === "card") && (
        <PaymentSheet
          method={method}
          amount={s.price}
          cardLabel={cardLabelOf(card, me.payments)}
          qrSeed={`${id}-${s.price}-${heldUntil}`}
          expiresAt={heldUntil}
          serverNow={data.serverNow}
          expiresNote="Spot reserved for you ·"
          charge={grabRequest}
          onSuccess={finish}
          onError={(e) => {
            cancelPayment();
            fail(e);
          }}
          onCancel={cancelPayment}
        />
      )}
    </div>
  );
}
