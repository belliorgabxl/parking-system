"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { IconCard, IconPlus } from "./Icons";

export type NewCard = { cardNumber: string; expiry: string; cvc: string; holderName: string; save: boolean };
export type CardChoice = { paymentMethodId: string } | { card: NewCard } | null;

const luhn = (num: string) => {
  let sum = 0;
  let dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = Number(num[i]);
    if (dbl && (d *= 2) > 9) d -= 9;
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
};

/** Client-side check so the button stays disabled until the card looks valid (server validates again). */
export function cardError(c: NewCard): string | null {
  const n = c.cardNumber.replace(/\D/g, "");
  if (n.length < 13 || !luhn(n)) return "Enter a valid card number";
  const m = c.expiry.match(/^(\d{2})\/(\d{2})$/);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return "Expiry must be MM/YY";
  const exp = new Date(2000 + Number(m[2]), Number(m[1]), 1);
  if (exp.getTime() <= Date.now()) return "This card has expired";
  if (c.cvc.length < 3) return "Enter the security code";
  return null;
}

const fmtNumber = (v: string) =>
  v
    .replace(/\D/g, "")
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, "$1 ");
const fmtExpiry = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

/** Saved cards (logged-in) + "Use a new card" form. Reports a choice the payment APIs understand. */
export function CardPicker({ onChange }: { onChange: (c: CardChoice) => void }) {
  const { me } = useApp();
  const cards = (me?.payments ?? []).filter((p) => p.kind === "card");
  const [selected, setSelected] = useState<string | "new">(cards.find((c) => c.isDefault)?.id ?? cards[0]?.id ?? "new");
  const [card, setCard] = useState<NewCard>({ cardNumber: "", expiry: "", cvc: "", holderName: "", save: true });

  const emit = (sel: string, c: NewCard) => {
    if (sel !== "new") onChange({ paymentMethodId: sel });
    else onChange(cardError(c) ? null : { card: c });
  };
  const pick = (sel: string) => {
    setSelected(sel);
    emit(sel, card);
  };
  const edit = (patch: Partial<NewCard>) => {
    const next = { ...card, ...patch };
    setCard(next);
    emit("new", next);
  };
  // Report the default saved card straight away so the pay button can enable.
  useEffect(() => emit(selected, card), []); // eslint-disable-line react-hooks/exhaustive-deps

  const err = selected === "new" && card.cardNumber ? cardError(card) : null;

  return (
    <div className="col gap-2 pl-1">
      {cards.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`chip ${selected === c.id ? "on" : ""} justify-start`}
          onClick={() => pick(c.id)}
        >
          <IconCard size={16} /> {c.label} <span className="faint">· {c.expiry}</span>
        </button>
      ))}
      {cards.length > 0 && (
        <button type="button" className={`chip ${selected === "new" ? "on" : ""} justify-start`} onClick={() => pick("new")}>
          <IconPlus size={16} /> Use a new card
        </button>
      )}
      {selected === "new" && (
        <div className="card flat col gap-2.5">
          <div className="input-wrap">
            <input
              className="input mono"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="Card number"
              value={card.cardNumber}
              onChange={(e) => edit({ cardNumber: fmtNumber(e.target.value) })}
            />
          </div>
          <div className="row">
            <div className="input-wrap grow">
              <input
                className="input mono"
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/YY"
                value={card.expiry}
                onChange={(e) => edit({ expiry: fmtExpiry(e.target.value) })}
              />
            </div>
            <div className="input-wrap grow">
              <input
                className="input mono"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="CVC"
                value={card.cvc}
                onChange={(e) => edit({ cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              />
            </div>
          </div>
          <div className="input-wrap">
            <input
              className="input"
              autoComplete="cc-name"
              placeholder="Name on card (optional)"
              value={card.holderName}
              onChange={(e) => edit({ holderName: e.target.value })}
            />
          </div>
          {err && <span className="err">{err}</span>}
          {me?.user.isGuest ? (
            <Link href="/login" className="small link">
              Log in to save this card for next time
            </Link>
          ) : (
            <label className="row small gap-2">
              <input type="checkbox" checked={card.save} onChange={(e) => edit({ save: e.target.checked })} /> Save this card
            </label>
          )}
          <span className="small faint">Demo: use 4242 4242 4242 4242, any future date, any CVC.</span>
        </div>
      )}
    </div>
  );
}
