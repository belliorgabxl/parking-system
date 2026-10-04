"use client";

import { useCallback, useEffect, useState } from "react";
import { baht, clock, relDay } from "@/lib/format";
import { ConfirmSheet, Sheet, Spinner, TopBar } from "@/components/ui";

type Reports = {
  reports: {
    id: string;
    reason: string;
    details: string;
    resolution: string;
    createdAt: string;
    spot: string;
    reporter: string;
    against: string;
    againstStanding: number | null;
    againstReportCount: number;
  }[];
  withdrawals: {
    id: string;
    amount: number;
    destination: string;
    accountName: string;
    accountNumber: string;
    bankName: string;
    createdAt: string;
  }[];
};
type Users = {
  users: {
    id: string;
    displayName: string;
    phone: string | null;
    isGuest: boolean;
    isBanned: boolean;
    standingScore: number;
    reports: number;
    balance: number;
  }[];
};
type Live = {
  listings: {
    id: string;
    status: string;
    spot: string;
    building: string;
    provider: string;
    seeker: string | null;
    price: number;
    leaveAt: string;
  }[];
};
type Building = {
  id: string;
  name: string;
  shortName: string;
  floors: string[];
  zones: string[];
  entrances: string[];
  landmarks: string[];
  baseSeekers: number;
  isActive: boolean;
  liveListings: number;
};
type Tab = "reports" | "withdrawals" | "live" | "users" | "buildings";

const KEY = "ps_admin_key";
const EMPTY_B = { id: "", name: "", shortName: "", floors: "", zones: "", entrances: "", landmarks: "", baseSeekers: "12" };

/** Ops console. Guarded by ADMIN_KEY. */
export default function AdminPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>("reports");
  const [reports, setReports] = useState<Reports | null>(null);
  const [users, setUsers] = useState<Users | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [buildings, setBuildings] = useState<Building[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editB, setEditB] = useState<typeof EMPTY_B | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body?: string; run: () => Promise<unknown> } | null>(null);

  const call = useCallback(
    async (path: string, method = "GET", body?: unknown) => {
      const res = await fetch(path, {
        method,
        headers: { "x-admin-key": key, ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message ?? "Failed");
      return j;
    },
    [key],
  );

  const load = useCallback(
    async (t: Tab = tab) => {
      setErr(null);
      try {
        if (t === "reports" || t === "withdrawals") setReports(await call("/api/admin/reports"));
        if (t === "users") setUsers(await call(`/api/admin/users?q=${encodeURIComponent(q)}`));
        if (t === "live") setLive(await call("/api/admin/listings"));
        if (t === "buildings") setBuildings((await call("/api/admin/buildings")).buildings);
        setAuthed(true);
        try {
          sessionStorage.setItem(KEY, key);
        } catch {}
      } catch (e) {
        setErr((e as Error).message);
      }
    },
    [call, key, q, tab],
  );

  useEffect(() => {
    try {
      const k = sessionStorage.getItem(KEY);
      if (k) setKey(k); // eslint-disable-line react-hooks/set-state-in-effect -- restore after hydration
    } catch {}
  }, []);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    load(t);
  };

  const saveBuilding = () =>
    editB &&
    act(async () => {
      const body = { ...editB, baseSeekers: Number(editB.baseSeekers) };
      if (editB.id) await call(`/api/admin/buildings/${editB.id}`, "PATCH", body);
      else await call("/api/admin/buildings", "POST", body);
      setEditB(null);
    });

  return (
    <div className="screen">
      <TopBar title="Admin" back="/" help={false} />
      <div className="body">
        <div className="row">
          <div className="input-wrap grow">
            <input
              className="input"
              type="password"
              placeholder="ADMIN_KEY"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
            />
          </div>
          <button className="btn btn-dark btn-sm" onClick={() => load()}>
            {authed ? "Refresh" : "Unlock"}
          </button>
        </div>
        {err && <div className="banner error">{err}</div>}

        {authed && (
          <div className="chips scroll-x">
            {(
              [
                ["reports", "Reports"],
                ["withdrawals", "Withdrawals"],
                ["live", "Live"],
                ["users", "Users"],
                ["buildings", "Buildings"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} className={`chip ${tab === k ? "on" : ""}`} onClick={() => switchTab(k)}>
                {label}
              </button>
            ))}
          </div>
        )}

        {authed && tab === "reports" && reports && (
          <>
            {reports.reports.length === 0 && <p className="muted small">No reports.</p>}
            {reports.reports.map((r) => (
              <div key={r.id} className="card col gap-1.5">
                <div className="row between">
                  <b>{r.reason}</b>
                  <span className={`badge ${r.resolution === "pending_review" ? "amber" : "soft"}`}>{r.resolution}</span>
                </div>
                <span className="small muted">
                  {r.spot} · {relDay(r.createdAt)} · by {r.reporter}
                </span>
                {r.details && <p className="small">“{r.details}”</p>}
                <span className="small">
                  Against <b>{r.against}</b> — standing {r.againstStanding ?? "?"}, {r.againstReportCount} report(s)
                </span>
                {r.resolution === "pending_review" && (
                  <div className="row">
                    <button
                      className="btn btn-red btn-sm"
                      disabled={busy}
                      onClick={() => act(() => call(`/api/admin/reports/${r.id}`, "POST", { decision: "upheld" }))}
                    >
                      Uphold
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      disabled={busy}
                      onClick={() => act(() => call(`/api/admin/reports/${r.id}`, "POST", { decision: "rejected" }))}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {authed && tab === "withdrawals" && reports && (
          <>
            {reports.withdrawals.length === 0 && <p className="muted small">No pending withdrawals.</p>}
            {reports.withdrawals.map((w) => (
              <div key={w.id} className="card col gap-1.5">
                <div className="row between">
                  <b className="mono">{baht(w.amount)}</b>
                  <span className="small muted">{relDay(w.createdAt)}</span>
                </div>
                <span className="small">
                  {w.destination === "promptpay" ? "PromptPay" : w.bankName} · <span className="mono">{w.accountNumber}</span> ·{" "}
                  {w.accountName}
                </span>
                <div className="row">
                  <button
                    className="btn btn-dark btn-sm"
                    disabled={busy}
                    onClick={() =>
                      act(() => call(`/api/admin/reports/${w.id}`, "POST", { decision: "paid", kind: "withdrawal" }))
                    }
                  >
                    Mark paid
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={busy}
                    onClick={() =>
                      act(() => call(`/api/admin/reports/${w.id}`, "POST", { decision: "rejected", kind: "withdrawal" }))
                    }
                  >
                    Reject & refund
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {authed && tab === "live" && live && (
          <>
            {live.listings.length === 0 && <p className="muted small">No live handovers.</p>}
            {live.listings.map((l) => (
              <div key={l.id} className="card col gap-1.5">
                <div className="row between">
                  <b>
                    {l.spot} · {l.building}
                  </b>
                  <span className="badge amber">{l.status}</span>
                </div>
                <span className="small muted">
                  {l.provider} → {l.seeker ?? "—"} · {baht(l.price)} · leave {clock(l.leaveAt)}
                </span>
                <button
                  className="btn btn-outline btn-sm self-start"

                  onClick={() =>
                    setConfirm({
                      title: "Force-close this handover?",
                      body: "Open spots are cancelled. Matched handovers are closed with a full refund to the seeker and no penalty.",
                      run: () => call(`/api/admin/listings/${l.id}`, "DELETE"),
                    })
                  }
                >
                  Force close
                </button>
              </div>
            ))}
          </>
        )}

        {authed && tab === "users" && (
          <>
            <div className="row">
              <div className="input-wrap grow">
                <input
                  className="input"
                  placeholder="Search name or phone"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && load()}
                />
              </div>
              <button className="btn btn-dark btn-sm" onClick={() => load()}>
                Search
              </button>
            </div>
            {users?.users.length === 0 && <p className="muted small">No users found.</p>}
            {users?.users.map((u) => (
              <div key={u.id} className="card col gap-1.5">
                <div className="row between">
                  <b>
                    {u.displayName} {u.isBanned && <span className="badge red">Suspended</span>}
                  </b>
                  <span className="mono small">{baht(u.balance)}</span>
                </div>
                <span className="small muted">
                  {u.phone ?? "guest"} · standing {u.standingScore} · {u.reports} report(s)
                </span>
                <div className="row">
                  <button
                    className={`btn btn-sm ${u.isBanned ? "btn-dark" : "btn-red"}`}
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        title: u.isBanned ? `Restore ${u.displayName}?` : `Suspend ${u.displayName}?`,
                        body: u.isBanned ? undefined : "They won't be able to offer, grab or withdraw.",
                        run: () => call(`/api/admin/users/${u.id}`, "PATCH", { isBanned: !u.isBanned }),
                      })
                    }
                  >
                    {u.isBanned ? "Restore" : "Suspend"}
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={busy}
                    onClick={() => act(() => call(`/api/admin/users/${u.id}`, "PATCH", { standingScore: 100 }))}
                  >
                    Reset standing
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {authed && tab === "buildings" && buildings && (
          <>
            {buildings.map((b) => (
              <div key={b.id} className={`card col gap-1.5 ${b.isActive ? "" : "opacity-60"}`}>
                <div className="row between">
                  <b>
                    {b.name} {!b.isActive && <span className="badge soft">Inactive</span>}
                  </b>
                  <span className="small muted">{b.liveListings} live</span>
                </div>
                <span className="small muted">
                  Floors {b.floors.join(", ")} · Zones {b.zones.join(", ")}
                </span>
                <div className="row">
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() =>
                      setEditB({
                        id: b.id,
                        name: b.name,
                        shortName: b.shortName,
                        floors: b.floors.join(", "),
                        zones: b.zones.join(", "),
                        entrances: b.entrances.join(", "),
                        landmarks: b.landmarks.join(", "),
                        baseSeekers: String(b.baseSeekers),
                      })
                    }
                  >
                    Edit
                  </button>
                  {b.isActive ? (
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() =>
                        setConfirm({
                          title: `Remove ${b.name}?`,
                          body: "Deleted if never used, otherwise hidden from the app (history is kept).",
                          run: () => call(`/api/admin/buildings/${b.id}`, "DELETE"),
                        })
                      }
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => act(() => call(`/api/admin/buildings/${b.id}`, "PATCH", { isActive: true }))}
                    >
                      Re-activate
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button className="btn btn-outline" onClick={() => setEditB(EMPTY_B)}>
              + Add building
            </button>
          </>
        )}
      </div>

      {editB && (
        <Sheet onClose={() => !busy && setEditB(null)}>
          <h3 className="h-section">{editB.id ? "Edit building" : "Add building"}</h3>
          {(
            [
              ["name", "Name"],
              ["shortName", "Short name"],
              ["floors", "Floors (comma separated)"],
              ["zones", "Zones (comma separated)"],
              ["entrances", "Entrances (comma separated)"],
              ["landmarks", "Landmarks (comma separated)"],
              ["baseSeekers", "Baseline drivers searching"],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="field">
              <span className="label">{label}</span>
              <div className="input-wrap">
                <input className="input" value={editB[k]} onChange={(e) => setEditB({ ...editB, [k]: e.target.value })} />
              </div>
            </div>
          ))}
          <button className="btn btn-dark" onClick={saveBuilding} disabled={busy || !editB.name.trim()}>
            {busy ? <Spinner /> : "Save"}
          </button>
        </Sheet>
      )}
      {confirm && (
        <ConfirmSheet
          title={confirm.title}
          body={confirm.body}
          confirmLabel="Confirm"
          danger
          busy={busy}
          onConfirm={() => act(confirm.run)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
