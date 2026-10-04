"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ClientError, errorMessage } from "@/lib/client";
import { MIN_WITHDRAW } from "@/lib/constants";
import { baht } from "@/lib/format";
import { useApp } from "@/components/AppProvider";
import { AmountPicker } from "@/components/AmountPicker";
import { LoadingScreen, Option, Spinner, SuccessHero, TopBar } from "@/components/ui";
import { IconBank, IconQr } from "@/components/Icons";

const BANKS = ["KBank", "SCB", "Bangkok Bank", "Krungthai", "Krungsri", "TTB"];

export default function WithdrawPage() {
  const router = useRouter();
  const { me, refreshMe } = useApp();
  const [amount, setAmount] = useState(300);
  const [custom, setCustom] = useState<string | null>(null);
  const [dest, setDest] = useState<"promptpay" | "bank" | null>(null);
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ amount: number; balance: number } | null>(null);

  // Withdrawing requires a verified login (spec §7).
  useEffect(() => {
    if (me?.user.isGuest) router.replace("/login?next=/wallet/withdraw");
  }, [me, router]);
  useEffect(() => {
    if (me && !me.user.isGuest) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill once profile loads
      setAccountName((n) => n || me.user.payoutName || me.user.displayName);
      setAccountNumber((n) => n || (me.user.phone ? `0${me.user.phone.slice(3)}` : ""));
    }
  }, [me]);

  if (!me || me.user.isGuest) return <LoadingScreen title="Withdraw" />;

  const value = custom !== null ? Number(custom || 0) : amount;
  const invalid =
    value < MIN_WITHDRAW
      ? `Minimum ${baht(MIN_WITHDRAW)}`
      : value > me.withdrawable
        ? `You can withdraw up to ${baht(me.withdrawable)}`
        : null;
  const missing = !dest
    ? "Choose where to withdraw"
    : !accountName.trim() || !accountNumber.trim() || (dest === "bank" && !bankName)
      ? "Enter account details"
      : null;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ amount: number; balance: number }>("/api/wallet/withdraw", {
        body: { amount: value, destination: dest, accountName, accountNumber, bankName },
      });
      setDone(r);
      refreshMe();
    } catch (e) {
      if (e instanceof ClientError && e.code === "LOGIN_REQUIRED") router.replace("/login?next=/wallet/withdraw");
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
          <SuccessHero title="Withdrawal requested" subtitle="Usually arrives within 1 business day." />
          <div className="card center col items-center">
            <span className="big-amount">{baht(done.amount)}</span>
            <span className="muted small">Remaining balance {baht(done.balance)}</span>
          </div>
        </div>
        <div className="footer">
          <Link href="/wallet" className="btn btn-dark">
            Done
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar title="Withdraw" back="/wallet" />
      <div className="body">
        <div className="row between">
          <span className="muted">Withdrawable (earnings)</span>
          <span className="mono font-bold">{baht(me.withdrawable)}</span>
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
        {invalid && <span className="err">{invalid}</span>}

        <h2 className="h-section">Withdraw to</h2>
        <div className="options">
          <Option
            on={dest === "promptpay"}
            onClick={() => setDest("promptpay")}
            icon={<IconQr />}
            title="PromptPay"
            subtitle="Phone or national ID"
          />
          <Option
            on={dest === "bank"}
            onClick={() => setDest("bank")}
            icon={<IconBank />}
            title="Bank account"
            subtitle="Thai bank transfer"
          />
        </div>
        {dest && (
          <div className="card col gap-3">
            {dest === "promptpay" && me.payments.some((p) => p.kind === "promptpay") && (
              <div className="chips">
                {me.payments
                  .filter((p) => p.kind === "promptpay")
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`chip ${accountNumber === p.promptPayId ? "on" : ""}`}
                      onClick={() => setAccountNumber(p.promptPayId)}
                    >
                      Saved · {p.label}
                    </button>
                  ))}
              </div>
            )}
            {dest === "bank" && (
              <div className="field">
                <span className="label">Bank</span>
                <div className="chips">
                  {BANKS.map((b) => (
                    <button key={b} type="button" className={`chip ${bankName === b ? "on" : ""}`} onClick={() => setBankName(b)}>
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="field">
              <label htmlFor="acc-no">{dest === "promptpay" ? "PromptPay number" : "Account number"}</label>
              <div className="input-wrap">
                <input
                  id="acc-no"
                  className="input mono"
                  inputMode="numeric"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/[^\d-\s]/g, ""))}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="acc-name">Account name</label>
              <div className="input-wrap">
                <input
                  id="acc-name"
                  className="input"
                  value={accountName}
                  readOnly={!!me.user.payoutName}
                  onChange={(e) => setAccountName(e.target.value)}
                />
              </div>
              {me.user.payoutName ? (
                <span className="small faint">Payouts are locked to {me.user.payoutName}. Contact support to change it.</span>
              ) : (
                <span className="small faint">
                  Must match your profile name ({me.user.displayName}). It&apos;s locked after your first withdrawal.{" "}
                  <Link href="/account" className="link">
                    Edit profile
                  </Link>
                </span>
              )}
            </div>
          </div>
        )}
        {err && <div className="banner error">{err}</div>}
      </div>
      <div className="footer">
        <button className="btn btn-dark" disabled={!!invalid || !!missing || busy} onClick={submit}>
          {busy ? <Spinner /> : (invalid ?? missing ?? `Withdraw ${baht(value)}`)}
        </button>
      </div>
    </div>
  );
}
