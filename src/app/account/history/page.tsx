"use client";

import Link from "next/link";
import { useState } from "react";
import { baht, relDay } from "@/lib/format";
import { usePoll } from "@/lib/hooks";
import { LoadingScreen, TopBar } from "@/components/ui";
import { IconChevron } from "@/components/Icons";

type Activity = {
  items: {
    key: string;
    listingId: string;
    role: "provider" | "seeker";
    status: string;
    spot: string;
    building: string;
    amount: number;
    at: string;
  }[];
};

const STATUS: Record<string, [string, string]> = {
  OPEN: ["Looking for driver", "amber"],
  MATCHED: ["Matched", "amber"],
  SEEKER_ARRIVED: ["Handing over", "amber"],
  COMPLETED: ["Completed", "green"],
  CANCELLED_FREE: ["Cancelled", "soft"],
  EXPIRED: ["Expired", "soft"],
  CANCELLED_BY_PROVIDER: ["Provider cancelled", "red"],
  CANCELLED_BY_SEEKER: ["You cancelled", "soft"],
  SEEKER_NO_SHOW: ["Seeker no-show", "red"],
  PROVIDER_NO_LEAVE: ["Provider didn't leave", "red"],
  DISPUTED: ["Reported", "red"],
};

export default function HistoryPage() {
  const { data } = usePoll<Activity>("/api/activity", 20_000);
  const [tab, setTab] = useState<"all" | "seeker" | "provider">("all");
  if (!data) return <LoadingScreen title="Handover history" />;
  const items = data.items.filter((i) => tab === "all" || i.role === tab);

  return (
    <div className="screen">
      <TopBar title="Handover history" back="/account" help={false} />
      <div className="body">
        <div className="tabs" role="tablist">
          {(
            [
              ["all", "All"],
              ["seeker", "Parked"],
              ["provider", "Offered"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
        {items.length === 0 && <p className="muted center mt-6">Nothing here yet — grab or offer a spot from Home.</p>}
        {items.length > 0 && (
          <div className="card pt-0 pb-0">
            <div className="list">
              {items.map((i) => {
                const [label, tone] = STATUS[i.status] ?? [i.status, "soft"];
                return (
                  <Link key={i.key} href={`/trip/${i.listingId}`} className="list-item">
                    <div className="col grow gap-[3px]">
                      <span className="font-[650]">
                        {i.role === "provider" ? "Offered" : "Parked"} · {i.spot}
                      </span>
                      <span className="small faint">
                        {i.building} · {relDay(i.at)}
                      </span>
                    </div>
                    <div className="col items-end gap-1">
                      <span className="mono small font-bold">{baht(i.amount)}</span>
                      <span className={`badge ${tone}`}>{label}</span>
                    </div>
                    <IconChevron size={16} />
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
