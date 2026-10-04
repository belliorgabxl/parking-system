"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/client";
import { baht, relDay } from "@/lib/format";
import { usePoll } from "@/lib/hooks";
import { useApp } from "@/components/AppProvider";
import { ConfirmSheet, LoadingScreen, TopBar } from "@/components/ui";

type WalletData = {
  balance: number;
  withdrawable: number;
  heldInEscrow: number;
  isGuest: boolean;
  withdrawals: { id: string; amount: number; status: string; destination: string; account: string; createdAt: string }[];
  transactions: {
    id: string;
    type: string;
    amount: number;
    label: string;
    external: boolean;
    method: string | null;
    listingId: string | null;
    createdAt: string;
  }[];
};

const W_STATUS: Record<string, [string, string]> = {
  pending: ["Processing", "amber"],
  paid: ["Paid", "green"],
  rejected: ["Returned", "red"],
  cancelled: ["Cancelled", "soft"],
};

export default function WalletPage() {
  const { refreshMe, toast } = useApp();
  const { data, error, reload } = usePoll<WalletData>("/api/wallet", 15_000);
  const [tab, setTab] = useState<"all" | "in" | "out">("all");
  const [cancelling, setCancelling] = useState<WalletData["withdrawals"][number] | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data && !error) return <LoadingScreen title="Wallet" />;

  const txs = (data?.transactions ?? []).filter((t) => tab === "all" || (tab === "in" ? t.amount > 0 : t.amount < 0));

  const cancelWithdrawal = async () => {
    if (!cancelling) return;
    setBusy(true);
    try {
      await api(`/api/wallet/withdrawals/${cancelling.id}`, { method: "DELETE" });
      await reload();
      refreshMe();
      toast("Withdrawal cancelled — the money is back in your wallet");
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
      setCancelling(null);
    }
  };

  return (
    <div className="screen">
      <TopBar title="Wallet" back="/" />
      <div className="body">
        {error && <div className="banner error">{error.message}</div>}
        {data && (
          <>
            <div className="card dark col gap-1.5 p-5">
              <span className="muted">Total balance</span>
              <span className="mono text-[40px] font-[750] tracking-[-0.03em]">{baht(data.balance)}</span>
              {data.balance > 0 && (
                <span className="small muted">
                  {baht(data.withdrawable)} withdrawable · {baht(Math.max(0, data.balance - data.withdrawable))} parking credit
                </span>
              )}
              {data.heldInEscrow > 0 && (
                <span className="small muted">{baht(data.heldInEscrow)} held for your current parking</span>
              )}
              {data.balance < 0 && (
                <span className="small text-[#fca5a5]">Top up to settle penalties before your next handover.</span>
              )}
            </div>
            <div className="row">
              <Link href="/wallet/topup" className="btn btn-yellow">
                Top up
              </Link>
              <Link href={data.isGuest ? "/login?next=/wallet/withdraw" : "/wallet/withdraw"} className="btn btn-outline">
                Withdraw
              </Link>
            </div>
            {data.isGuest && (
              <div className="banner info grid gap-2">
                <span className="grow">You&apos;re using a guest wallet on this device. Log in to keep it and withdraw.</span>
                <Link
                  href="/login?next=/wallet"
                  className="w-full rounded-md border bg-amber-300 py-2.5 text-center font-semibold text-black"
                >
                  Log in
                </Link>
              </div>
            )}

            {data.withdrawals.length > 0 && (
              <>
                <h2 className="h-section">Withdrawals</h2>
                <div className="card pt-0 pb-0">
                  <div className="list">
                    {data.withdrawals.map((w) => {
                      const [label, tone] = W_STATUS[w.status] ?? [w.status, "soft"];
                      return (
                        <div key={w.id} className="list-item">
                          <div className="col grow gap-0.5">
                            <span className="font-semibold">
                              {w.destination} {w.account}
                            </span>
                            <span className="small faint">{relDay(w.createdAt)}</span>
                          </div>
                          <div className="col items-end gap-1">
                            <span className="mono font-bold">{baht(w.amount)}</span>
                            <span className={`badge ${tone}`}>{label}</span>
                          </div>
                          {w.status === "pending" && (
                            <button className="btn btn-outline btn-sm" onClick={() => setCancelling(w)}>
                              Cancel
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <div className="row between">
              <h2 className="h-section mt-0">Recent activity</h2>
            </div>
            <div className="tabs" role="tablist">
              {(
                [
                  ["all", "All"],
                  ["in", "Money in"],
                  ["out", "Money out"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="card pt-1 pb-1">
              <div className="list">
                {txs.length === 0 && <p className="muted small py-3.5">No activity yet.</p>}
                {txs.map((t) => {
                  const row = (
                    <>
                      <div className="col grow gap-0.5">
                        <span className="font-semibold">{t.label}</span>
                        <span className="small faint">
                          {relDay(t.createdAt)}
                          {t.external && ` · paid by ${t.method === "qr" ? "QR" : "card"}`}
                        </span>
                      </div>
                      <span className={`mono font-bold ${t.external ? "faint" : t.amount < 0 ? "" : "green"}`}>
                        {baht(t.amount, { sign: true })}
                      </span>
                    </>
                  );
                  return t.listingId ? (
                    <Link key={t.id} href={`/trip/${t.listingId}`} className="list-item">
                      {row}
                    </Link>
                  ) : (
                    <div key={t.id} className="list-item">
                      {row}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
      {cancelling && (
        <ConfirmSheet
          title="Cancel this withdrawal?"
          body={`${baht(cancelling.amount)} goes back to your wallet straight away.`}
          confirmLabel="Cancel withdrawal"
          busy={busy}
          danger
          onConfirm={cancelWithdrawal}
          onClose={() => setCancelling(null)}
        />
      )}
    </div>
  );
}
