"use client";

import { useEffect, useRef, useState } from "react";
import { baht, mmss } from "@/lib/format";
import { useCountdown } from "@/lib/hooks";
import { IconCard } from "./Icons";
import { PaymentQr } from "./PaymentQr";
import { Sheet, Spinner, SuccessHero } from "./ui";

/** How long the bank confirmation takes before the charge goes through. */
const CONFIRM_AFTER_MS = 5_000;
/** How long the success state stays up before moving on. */
const SUCCESS_SHOW_MS = 1_400;

type Phase = "waiting" | "charging" | "success";

/**
 * Payment sheet for QR (PromptPay) and card. Waits for the bank confirmation, then calls `charge`
 * (the API that records the payment) and shows "Payment successful".
 */
export function PaymentSheet({
  method,
  amount,
  cardLabel,
  qrSeed,
  expiresAt,
  serverNow,
  expiresNote = "Code expires in",
  charge,
  onSuccess,
  onError,
  onCancel,
}: {
  method: "qr" | "card";
  amount: number;
  cardLabel?: string;
  qrSeed: string;
  expiresAt?: string | null;
  serverNow?: string;
  expiresNote?: string;
  charge: () => Promise<void>;
  onSuccess: () => void;
  onError: (err: unknown) => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("waiting");
  const left = useCountdown(expiresAt ?? null, serverNow);
  // Latest callbacks without restarting the timer when the parent re-renders.
  const cb = useRef({ charge, onSuccess, onError });
  useEffect(() => {
    cb.current = { charge, onSuccess, onError };
  });

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      if (!alive) return;
      setPhase("charging");
      try {
        await cb.current.charge();
        if (!alive) return;
        setPhase("success");
        setTimeout(() => alive && cb.current.onSuccess(), SUCCESS_SHOW_MS);
      } catch (err) {
        if (alive) cb.current.onError(err);
      }
    }, CONFIRM_AFTER_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  if (phase === "success") {
    return (
      <Sheet>
        <SuccessHero title="Payment successful" />
        <p className="center">
          <span className="big-amount text-[28px]">{baht(amount)}</span>
          <br />
          <span className="small muted">{method === "qr" ? "PromptPay" : cardLabel}</span>
        </p>
      </Sheet>
    );
  }

  const status = (
    <p className="row justify-center gap-2 font-semibold">
      <Spinner /> {method === "qr" ? "Waiting for payment…" : "Processing payment…"}
    </p>
  );

  return (
    <Sheet onClose={phase === "waiting" ? onCancel : undefined}>
      {method === "qr" ? (
        <>
          <h3 className="h-section center">Scan with any banking app</h3>
          <PaymentQr seed={qrSeed} />
          <p className="center">
            <span className="big-amount text-[28px]">{baht(amount)}</span>
            <br />
            <span className="small muted">PromptPay · ParkSwap Co., Ltd.</span>
          </p>
          {status}
          {expiresAt && left > 0 && (
            <p className="center small muted">
              {expiresNote} <b className="mono">{mmss(left)}</b>
            </p>
          )}
        </>
      ) : (
        <>
          <div className="hero-icon sad">
            <IconCard size={36} />
          </div>
          <p className="center">
            <span className="big-amount text-[28px]">{baht(amount)}</span>
            <br />
            <span className="small muted">{cardLabel}</span>
          </p>
          {status}
          <p className="center small muted">Please don&apos;t close this screen.</p>
        </>
      )}
      <button className="btn btn-ghost" onClick={onCancel} disabled={phase !== "waiting"}>
        Cancel
      </button>
    </Sheet>
  );
}
