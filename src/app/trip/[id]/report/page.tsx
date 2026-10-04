"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/client";
import { PROVIDER_REPORT_REASONS, REPORT_REASONS } from "@/lib/constants";
import { baht } from "@/lib/format";
import { usePoll } from "@/lib/hooks";
import type { TransactionView } from "@/lib/types";
import { useApp } from "@/components/AppProvider";
import { ErrorScreen, LoadingScreen, Option, Sheet, Spinner, TopBar } from "@/components/ui";

type Result = TransactionView & { result: { refund?: number; reported?: boolean; balance: number } };

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const { refreshMe } = useApp();
  const { data, error } = usePoll<TransactionView>(`/api/listings/${id}`);
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  if (error) return <ErrorScreen message={error.message} />;
  if (!data) return <LoadingScreen title="Report" />;
  const isProvider = data.role === "provider";
  const closed = !["MATCHED", "SEEKER_ARRIVED"].includes(data.listing.status);
  const reasons = isProvider ? PROVIDER_REPORT_REASONS : REPORT_REASONS;

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    setErr(null);
    try {
      setResult(
        await api<Result>(`/api/listings/${id}/${isProvider ? "provider_report" : "report"}`, { body: { reason, details } }),
      );
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
      <TopBar title="Report" back={`/trip/${id}`} />
      <div className="body">
        <h2 className="h-title">Having a problem?</h2>
        <div className="options">
          {reasons.map((r) => (
            <Option key={r} on={reason === r} onClick={() => setReason(r)} title={r} />
          ))}
        </div>
        <div className="field">
          <label htmlFor="what">Tell us what happened</label>
          <div className="input-wrap">
            <textarea
              id="what"
              className="textarea"
              value={details}
              maxLength={1000}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={
                isProvider
                  ? "e.g. A different car is waiting at my spot"
                  : "e.g. The car at B2 Zone C is still parked and nobody is there"
              }
            />
          </div>
        </div>
        <p className="small faint">
          {isProvider
            ? "Our team will look into it. The handover keeps running — if the seeker doesn't arrive by the leave time, you're free to go and you'll get the late fee."
            : `Reporting ends this handover and refunds ${baht(data.booking?.amountHeld ?? data.listing.price)} to your wallet. Our team reviews every report.`}
        </p>
        {err && <div className="banner error">{err}</div>}
      </div>
      <div className="footer">
        <button className="btn btn-dark" disabled={!reason || busy} onClick={submit}>
          {busy ? <Spinner /> : "Report"}
        </button>
      </div>

      {result && (
        <Sheet>
          <h3 className="h-title center">{isProvider ? "Thanks for letting us know" : "Sorry to hear that"}</h3>
          {isProvider ? (
            <p className="center muted">Our team will review this handover.</p>
          ) : (
            <p className="center muted">
              We&apos;ll refund <b className="mono">{baht(result.result.refund ?? 0)}</b> to your wallet.
              <br />
              New balance <b className="mono">{baht(result.result.balance)}</b>
            </p>
          )}
          {isProvider ? (
            <Link href={`/trip/${id}`} className="btn btn-dark">
              Back to my spot
            </Link>
          ) : (
            <Link href="/" className="btn btn-yellow">
              Find new parking
            </Link>
          )}
        </Sheet>
      )}
    </div>
  );
}
