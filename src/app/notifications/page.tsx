"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/client";
import { relDay } from "@/lib/format";
import { usePoll } from "@/lib/hooks";
import { useApp } from "@/components/AppProvider";
import { ConfirmSheet, LoadingScreen, TopBar } from "@/components/ui";
import { IconBell, IconTrash } from "@/components/Icons";

type Data = {
  unread: number;
  items: { id: string; kind: string; title: string; body: string; listingId: string | null; read: boolean; createdAt: string }[];
};

const KIND_DOT: Record<string, string> = {
  match: "var(--yellow)",
  arrived: "var(--yellow)",
  leaving: "var(--yellow)",
  completed: "var(--green)",
  refund: "var(--green)",
  penalty: "var(--red)",
  cancelled: "var(--red)",
  report: "var(--red)",
};

export default function NotificationsPage() {
  const router = useRouter();
  const { refreshMe, toast } = useApp();
  const { data, setData, reload } = usePoll<Data>("/api/notifications", 15_000);
  const [confirmClear, setConfirmClear] = useState(false);

  if (!data) return <LoadingScreen title="Notifications" />;

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
      refreshMe();
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  const open = async (n: Data["items"][number]) => {
    if (!n.read)
      api(`/api/notifications/${n.id}`, { method: "PATCH" })
        .then(refreshMe)
        .catch(() => {});
    if (n.listingId) router.push(`/trip/${n.listingId}`);
    else setData({ ...data, items: data.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)) });
  };

  return (
    <div className="screen">
      <TopBar
        title="Notifications"
        back="/"
        help={false}
        right={
          data.unread > 0 ? (
            <button className="btn btn-outline btn-sm" onClick={() => act(() => api("/api/notifications", { method: "PATCH" }))}>
              Mark all read
            </button>
          ) : null
        }
      />
      <div className="body">
        {data.items.length === 0 && (
          <div className="center col mt-12 items-center gap-2">
            <div className="hero-icon sad">
              <IconBell size={36} />
            </div>
            <b>You&apos;re all caught up</b>
            <span className="small muted">Matches, arrivals, payouts and refunds will show up here.</span>
          </div>
        )}
        {data.items.length > 0 && (
          <div className="card pt-0 pb-0">
            <div className="list">
              {data.items.map((n) => (
                <div key={n.id} className={`list-item ${n.read ? "" : "unread pl-2.5"}`}>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: KIND_DOT[n.kind] ?? "var(--ink-3)" }} />
                  <button className="col grow gap-0.5 text-left" onClick={() => open(n)}>
                    <span className={n.read ? "font-[550]" : "font-[750]"}>{n.title}</span>
                    {n.body && <span className="small muted">{n.body}</span>}
                    <span className="small faint">{relDay(n.createdAt)}</span>
                  </button>
                  <button
                    className="icon-btn sm"
                    aria-label="Delete notification"
                    onClick={() => act(() => api(`/api/notifications/${n.id}`, { method: "DELETE" }))}
                  >
                    <IconTrash size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {data.items.length > 0 && (
          <button className="btn btn-ghost" onClick={() => setConfirmClear(true)}>
            Clear all
          </button>
        )}
        <p className="small faint center">Notifications are kept for 30 days.</p>
      </div>
      {confirmClear && (
        <ConfirmSheet
          title="Clear all notifications?"
          confirmLabel="Clear all"
          danger
          onConfirm={() => {
            setConfirmClear(false);
            act(() => api("/api/notifications", { method: "DELETE" }));
          }}
          onClose={() => setConfirmClear(false)}
        />
      )}
    </div>
  );
}
