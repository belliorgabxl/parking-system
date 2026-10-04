"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, ClientError, errorMessage } from "@/lib/client";
import type { PaymentMethod } from "@/lib/constants";
import { baht, mmss } from "@/lib/format";
import { useCountdown, usePoll } from "@/lib/hooks";
import type { SpotDetail } from "@/lib/types";
import { useApp } from "@/components/AppProvider";
import { CardPicker, type CardChoice } from "@/components/CardPicker";
import { ErrorScreen, LoadingScreen, Option, Sheet, Spinner, TopBar } from "@/components/ui";
import { IconCard, IconQr, IconWallet } from "@/components/Icons";
import { FakeQr } from "@/components/FakeQr";
import { VoiceInput } from "@/components/VoiceInput";

const METHOD_KEY = "ps_pay_method";

/** QR sheet: the spot is reserved for this seeker until `heldUntil`; closing releases it. */
function QrSheet({
  id,
  price,
  heldUntil,
  serverNow,
  busy,
  onPaid,
  onClose,
}: {
  id: string;
  price: number;
  heldUntil: string;
  serverNow?: string;
  busy: boolean;
  onPaid: () => void;
  onClose: () => void;
}) {
  const left = useCountdown(heldUntil, serverNow);
  const expired = left <= 0;
  return (
    <Sheet onClose={busy ? undefined : onClose}>
      <h3 className="h-section center">Scan with any banking app</h3>
      {expired ? (
        <div className="banner warn">This QR code expired and the spot was released. Close and try again.</div>
      ) : (
        <>
          <FakeQr seed={`${id}-${price}-${heldUntil}`} />
          <p className="center">
            <span className="big-amount text-[28px]">{baht(price)}</span>
            <br />
            <span className="small muted">PromptPay · ParkSwap Co., Ltd.</span>
          </p>
          <p className="center small">
            Spot reserved for you · <b className="mono">{mmss(left)}</b>
          </p>
        </>
      )}
      <button className="btn btn-dark" onClick={expired ? onClose : onPaid} disabled={busy}>
        {busy ? <Spinner /> : expired ? "Close" : "I've paid"}
      </button>
      {!expired && (
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      )}
      <p className="small faint center">Demo: no real payment is taken.</p>
    </Sheet>
  );
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

  const grab = async () => {
    if (!method) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/listings/${id}/grab`, {
        body: { paymentMethod: method, vehicle: carText, ...(method === "card" ? card : {}) },
      });
      holdRef.current = false;
      try {
        sessionStorage.removeItem(METHOD_KEY);
      } catch {}
      await refreshMe();
      router.replace(`/trip/${id}`);
    } catch (e) {
      setHeldUntil(null);
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const openQr = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ result: { heldUntil: string } }>(`/api/listings/${id}/hold`, { body: {} });
      holdRef.current = true;
      setHeldUntil(r.result.heldUntil);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const closeQr = () => {
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
        <button className="btn btn-yellow" disabled={!ready || busy} onClick={method === "qr" ? openQr : grab}>
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

      {heldUntil && (
        <QrSheet
          id={id}
          price={s.price}
          heldUntil={heldUntil}
          serverNow={data.serverNow}
          busy={busy}
          onPaid={grab}
          onClose={closeQr}
        />
      )}
    </div>
  );
}
