"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/client";
import { CANCEL_REASONS } from "@/lib/constants";
import { baht } from "@/lib/format";
import { usePoll } from "@/lib/hooks";
import type { TransactionView } from "@/lib/types";
import { useApp } from "@/components/AppProvider";
import { ErrorScreen, LoadingScreen, Option, Sheet, Spinner, TopBar } from "@/components/ui";

type Result = TransactionView & { result: { penalty: number; balance: number } };

export default function CancelPage() {
  const { id } = useParams<{ id: string }>();
  const { refreshMe } = useApp();
  const { data, error } = usePoll<TransactionView>(`/api/listings/${id}`, 3_000);
  const [reasons, setReasons] = useState<string[]>([]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  if (error) return <ErrorScreen message={error.message} />;
  if (!data) return <LoadingScreen title="Cancel" />;
  if (data.role !== "provider") return <ErrorScreen message="Only the provider can cancel this spot." />;

  const status = data.listing.status;
  const closed = !["OPEN", "MATCHED", "SEEKER_ARRIVED"].includes(status);
  const penalty = status === "OPEN" ? 0 : 20;
  const toggle = (r: string) => setReasons((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]));

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<Result>(`/api/listings/${id}/cancel`, { body: { reasons, details } });
      setResult(r);
      refreshMe();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (closed && !result) {
    return (
      <ErrorScreen
        message="This handover is already closed."
        action={
          <Link href={`/trip/${id}`} className="btn btn-dark mt-3">
            View details
          </Link>
        }
      />
    );
  }

  return (
    <div className="screen">
      <TopBar title="Cancel" back={`/trip/${id}`} />
      <div className="body">
        <h2 className="h-title">Tell us why you changed your mind</h2>
        <div className="options">
          {CANCEL_REASONS.map((r) => (
            <Option key={r} kind="check" on={reasons.includes(r)} onClick={() => toggle(r)} title={r} />
          ))}
        </div>
        <div className="field">
          <label htmlFor="others">Others (optional)</label>
          <div className="input-wrap">
            <textarea id="others" className="textarea" value={details} onChange={(e) => setDetails(e.target.value)} />
          </div>
        </div>
        {penalty === 0 ? (
          <div className="banner ok">No driver is matched yet — cancelling is free.</div>
        ) : (
          <div className="banner error">A driver is already on the way. They&apos;ll be fully refunded.</div>
        )}
        {err && <div className="banner error">{err}</div>}
      </div>
      <div className="footer">
        <div className="footer-row">
          <span>Penalty fee</span>
          <strong className={`mono ${penalty ? "red" : ""}`}>{penalty ? `-${baht(penalty)}` : baht(0)}</strong>
        </div>
        <button className="btn btn-red" onClick={submit} disabled={busy || (!reasons.length && !details.trim())}>
          {busy ? <Spinner /> : reasons.length || details.trim() ? "Confirm cancel" : "Choose a reason"}
        </button>
      </div>

      {result && (
        <Sheet>
          <h3 className="h-title center">Hope to see you next time</h3>
          <div className="card flat">
            <div className="row between py-1.5">
              <span className="muted">Penalty</span>
              <span className={`mono ${result.result.penalty ? "red" : ""} font-bold`}>
                {result.result.penalty ? `-${baht(result.result.penalty)}` : baht(0)}
              </span>
            </div>
            <div className="row between py-1.5">
              <span className="muted">New balance</span>
              <span className="mono font-bold">{baht(result.result.balance)}</span>
            </div>
          </div>
          <Link href="/" className="btn btn-dark">
            Back to home
          </Link>
        </Sheet>
      )}
    </div>
  );
}
