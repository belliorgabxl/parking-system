"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/client";
import { useApp } from "@/components/AppProvider";
import { cardError, type NewCard } from "@/components/CardPicker";
import { ConfirmSheet, LoadingScreen, Sheet, Spinner, TopBar } from "@/components/ui";
import { IconCard, IconPlus, IconQr, IconStar, IconTrash } from "@/components/Icons";

type Payment = { id: string; kind: "card" | "promptpay"; label: string; expiry: string; isDefault: boolean };
const EMPTY: NewCard = { cardNumber: "", expiry: "", cvc: "", holderName: "", save: true };

export default function PaymentsPage() {
  const { me, refreshMe, toast } = useApp();
  const [adding, setAdding] = useState<"card" | "promptpay" | null>(null);
  const [card, setCard] = useState<NewCard>(EMPTY);
  const [promptPay, setPromptPay] = useState("");
  const [deleting, setDeleting] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);

  if (!me) return <LoadingScreen title="Payment methods" />;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      await refreshMe();
      toast(ok);
      setAdding(null);
      setDeleting(null);
      setCard(EMPTY);
      setPromptPay("");
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const cardErr = card.cardNumber ? cardError(card) : "Enter card details";
  const ppOk = /^(0\d{9}|\d{13})$/.test(promptPay);

  return (
    <div className="screen">
      <TopBar title="Payment methods" back="/account" help={false} />
      <div className="body">
        {me.user.isGuest ? (
          <div className="card col gap-2.5">
            <b>Log in to save payment methods</b>
            <span className="small muted">Pay in one tap next time. We only keep the last 4 digits of your card.</span>
            <Link href="/login?next=/account/payments" className="btn btn-dark">
              Log in
            </Link>
          </div>
        ) : (
          <>
            {me.payments.length === 0 && <p className="muted center mt-6">No saved payment methods.</p>}
            {me.payments.map((p) => (
              <div key={p.id} className="card row">
                <span className="icon-btn bg-[#f4f4f5]">{p.kind === "card" ? <IconCard /> : <IconQr />}</span>
                <div className="col grow gap-0.5">
                  <b className="mono">
                    {p.label} {p.isDefault && <span className="badge soft align-[2px] font-sans">Default</span>}
                  </b>
                  {p.kind === "card" && <span className="small muted">Expires {p.expiry}</span>}
                </div>
                {!p.isDefault && (
                  <button
                    className="icon-btn sm"
                    aria-label="Set as default"
                    onClick={() =>
                      run(
                        () => api(`/api/payment-methods/${p.id}`, { method: "PATCH", body: { isDefault: true } }),
                        "Default updated",
                      )
                    }
                  >
                    <IconStar />
                  </button>
                )}
                <button className="icon-btn sm" aria-label="Delete" onClick={() => setDeleting(p)}>
                  <IconTrash size={16} />
                </button>
              </div>
            ))}
            {me.payments.length < 5 && (
              <div className="row">
                <button className="btn btn-outline" onClick={() => setAdding("card")}>
                  <IconPlus /> Card
                </button>
                <button className="btn btn-outline" onClick={() => setAdding("promptpay")}>
                  <IconPlus /> PromptPay
                </button>
              </div>
            )}
            <p className="small faint center">
              Card numbers are tokenised by the payment provider — we only store brand and last 4 digits.
            </p>
          </>
        )}
      </div>

      {adding === "card" && (
        <Sheet onClose={() => !busy && setAdding(null)}>
          <h3 className="h-section">Add a card</h3>
          <div className="input-wrap">
            <input
              className="input mono"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="Card number"
              value={card.cardNumber}
              onChange={(e) =>
                setCard({
                  ...card,
                  cardNumber: e.target.value
                    .replace(/\D/g, "")
                    .slice(0, 19)
                    .replace(/(\d{4})(?=\d)/g, "$1 "),
                })
              }
            />
          </div>
          <div className="row">
            <div className="input-wrap grow">
              <input
                className="input mono"
                inputMode="numeric"
                placeholder="MM/YY"
                value={card.expiry}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setCard({ ...card, expiry: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d });
                }}
              />
            </div>
            <div className="input-wrap grow">
              <input
                className="input mono"
                inputMode="numeric"
                placeholder="CVC"
                value={card.cvc}
                onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              />
            </div>
          </div>
          <div className="input-wrap">
            <input
              className="input"
              placeholder="Name on card (optional)"
              value={card.holderName}
              onChange={(e) => setCard({ ...card, holderName: e.target.value })}
            />
          </div>
          {card.cardNumber && cardErr && <span className="err">{cardErr}</span>}
          <button
            className="btn btn-dark"
            disabled={busy || !!cardErr}
            onClick={() => run(() => api("/api/payment-methods", { body: { kind: "card", ...card } }), "Card saved")}
          >
            {busy ? <Spinner /> : "Save card"}
          </button>
        </Sheet>
      )}
      {adding === "promptpay" && (
        <Sheet onClose={() => !busy && setAdding(null)}>
          <h3 className="h-section">Add PromptPay</h3>
          <div className="input-wrap">
            <input
              className="input mono"
              inputMode="numeric"
              placeholder="Phone (0812345678) or national ID"
              value={promptPay}
              onChange={(e) => setPromptPay(e.target.value.replace(/\D/g, "").slice(0, 13))}
            />
          </div>
          <span className="small faint">Used to pre-fill withdrawals.</span>
          <button
            className="btn btn-dark"
            disabled={busy || !ppOk}
            onClick={() =>
              run(() => api("/api/payment-methods", { body: { kind: "promptpay", promptPayId: promptPay } }), "PromptPay saved")
            }
          >
            {busy ? <Spinner /> : "Save"}
          </button>
        </Sheet>
      )}
      {deleting && (
        <ConfirmSheet
          title={`Remove ${deleting.label}?`}
          danger
          busy={busy}
          confirmLabel="Remove"
          onConfirm={() => run(() => api(`/api/payment-methods/${deleting.id}`, { method: "DELETE" }), "Removed")}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
