"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DemandLevel } from "@/lib/constants";
import { CAR_SIZE_LABEL, SPOT_TYPE_LABEL, type CarSize, type SpotType } from "@/lib/constants";
import { baht, clock } from "@/lib/format";
import { usePoll } from "@/lib/hooks";
import { useApp } from "@/components/AppProvider";
import { FloorBadge, Sheet } from "@/components/ui";
import {
  IconChevron,
  IconDown,
  IconHelp,
  IconPin,
  IconUser,
  IconWallet,
  IconArrow,
  IconLady,
  IconBell,
  IconRefresh,
} from "@/components/Icons";

type Building = { id: string; name: string; shortName: string };
type HomeData = {
  building: Building;
  demand: { level: DemandLevel; seekers: number; spots: number };
  earnUpTo: number;
  spots: {
    id: string;
    title: string;
    floor: string;
    zone: string;
    spotType: SpotType;
    carSize: CarSize;
    isLadyBay: boolean;
    leaveAt: string;
    price: number;
  }[];
};

const FILTERS = [
  { key: "soonest", label: "Leaving soonest" },
  { key: "cheapest", label: "Cheapest" },
  { key: "suv", label: "Fits SUV" },
  { key: "lady", label: "Lady bay" },
  { key: "rooftop", label: "Rooftop" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

function applyFilter(spots: HomeData["spots"], f: FilterKey) {
  switch (f) {
    case "cheapest":
      return [...spots].sort((a, b) => a.price - b.price || +new Date(a.leaveAt) - +new Date(b.leaveAt));
    case "suv":
      return spots.filter((s) => s.carSize === "suv" || s.carSize === "any");
    case "lady":
      return spots.filter((s) => s.isLadyBay);
    case "rooftop":
      return spots.filter((s) => s.spotType === "rooftop");
    default:
      return spots;
  }
}

const DEMAND_BADGE: Record<DemandLevel, string> = { High: "red", Medium: "amber", Low: "green" };
const STATUS_TEXT: Record<string, string> = {
  OPEN: "Looking for a driver…",
  MATCHED: "Driver matched — on the way",
  SEEKER_ARRIVED: "Seeker has arrived",
};

export default function Home() {
  const { me, buildingId, setBuildingId, refreshMe } = useApp();
  const [filter, setFilter] = useState<FilterKey>("soonest");
  const { data, error, stale, reload } = usePoll<HomeData>(`/api/home${buildingId ? `?buildingId=${buildingId}` : ""}`, 10_000);
  const [picker, setPicker] = useState(false);
  const { data: bdata } = usePoll<{ buildings: Building[] }>(picker ? "/api/buildings" : null);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const activeListing = me?.active.listing;
  const activeBooking = me?.active.booking;
  const lastParked = me?.lastParked;

  return (
    <div className="screen">
      <header className="topbar home-bar">
        <button className="loc" onClick={() => setPicker(true)} aria-label={`Location: ${data?.building.name ?? ""}. Change`}>
          <span className="faint small row gap-1">
            <IconPin size={13} /> You&apos;re at
          </span>
          <span className="loc-name">
            <span className="ellipsis">{data?.building.name ?? "…"}</span>
            <IconDown size={16} />
          </span>
        </button>
        <Link href="/wallet" className="chip mono px-2.5 font-bold" aria-label="Wallet">
          <IconWallet size={16} /> {me ? baht(me.balance) : "฿ …"}
        </Link>
        <Link
          href="/notifications"
          className="icon-btn sm"
          aria-label={`Notifications${me?.unread ? `, ${me.unread} unread` : ""}`}
        >
          <IconBell size={18} />
          {!!me?.unread && <span className="dot-badge">{me.unread > 9 ? "9+" : me.unread}</span>}
        </Link>
        <Link href="/account" className="icon-btn sm" aria-label="Account">
          <IconUser size={18} />
        </Link>
        <Link href="/help" className="icon-btn sm" aria-label="Help">
          <IconHelp size={18} />
        </Link>
      </header>

      <div className="body">
        {error && <div className="banner error">{error.message}</div>}
        {stale && <div className="banner info">Weak signal — showing the last update</div>}
        {!!me && me.balance < 0 && (
          <div className="banner error">
            <span className="grow">
              You owe <b className="mono">{baht(-me.balance)}</b> in penalties. Top up to keep parking and offering.
            </span>
            <Link href={`/wallet/topup?amount=${Math.max(100, Math.ceil(-me.balance / 100) * 100)}`} className="link">
              Top up
            </Link>
          </div>
        )}
        {me?.user.isBanned && (
          <div className="banner error">Your account is suspended, so you can&apos;t offer or grab spots. Contact support.</div>
        )}

        {activeBooking && (
          <Link href={`/trip/${activeBooking.listingId}`} className="card yellow row">
            <span className="dot-live bg-dark" />
            <span className="col grow gap-0.5">
              <b>Your parking is in progress</b>
              <span className="small muted">
                {activeBooking.status === "SEEKER_ARRIVED" ? "Pull in and confirm parking" : "Head to your spot"}
              </span>
            </span>
            <IconChevron />
          </Link>
        )}
        {activeListing && (
          <Link href={`/trip/${activeListing.id}`} className="card dark row">
            <span className="dot-live" />
            <span className="col grow gap-0.5">
              <b>You&apos;re offering a spot</b>
              <span className="small muted">{STATUS_TEXT[activeListing.status] ?? activeListing.status}</span>
            </span>
            <IconChevron />
          </Link>
        )}
        {lastParked && !activeBooking && (
          <div className="card row">
            <FloorBadge floor={lastParked.floor} zone={lastParked.zone} />
            <div className="col grow gap-0.5">
              <b>
                Heading back to {lastParked.floor} · Zone {lastParked.zone}?
              </b>
              <span className="small muted">Offer your spot when you leave and earn.</span>
            </div>
            <Link href="/offer?from=last" className="btn btn-yellow btn-sm">
              Offer
            </Link>
          </div>
        )}

        {data ? (
          <div className="card dark col gap-3.5">
            <div className="row between">
              <span className="font-[650]">Parking demand</span>
              <span className={`badge ${DEMAND_BADGE[data.demand.level]}`}>{data.demand.level}</span>
            </div>
            <div className="row gap-6">
              <div className="col gap-0">
                <span className="mono text-[32px] font-[750]">{data.demand.seekers}</span>
                <span className="small muted">drivers looking nearby</span>
              </div>
              <div className="col gap-0">
                <span className="mono text-[32px] font-[750] text-primary">{data.demand.spots}</span>
                <span className="small muted">handover spots available</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="skeleton h-[132px]" />
        )}

        <div className="row between">
          <h2 className="h-section mt-0">Best parking near you</h2>
          <button className="icon-btn sm" onClick={reload} aria-label="Refresh spots">
            <IconRefresh size={16} />
          </button>
        </div>
        <div className="chips scroll-x">
          {FILTERS.map((f) => (
            <button key={f.key} className={`chip ${filter === f.key ? "on" : ""}`} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        {!data && [0, 1, 2].map((i) => <div key={i} className="skeleton h-[88px]" />)}
        {data && data.spots.length > 0 && applyFilter(data.spots, filter).length === 0 && (
          <div className="card flat center p-5">
            <span className="small muted">No spots match this filter right now.</span>{" "}
            <button className="link small" onClick={() => setFilter("soonest")}>
              Show all
            </button>
          </div>
        )}
        {data && data.spots.length === 0 && (
          <div className="card flat center col items-center p-6">
            <b>No spots right now</b>
            <span className="small muted">New spots appear as drivers get ready to leave. Pull down or check back soon.</span>
          </div>
        )}
        {data &&
          applyFilter(data.spots, filter).map((s) => (
            <Link key={s.id} href={`/spot/${s.id}`} className="card spot">
              <FloorBadge floor={s.floor} zone={s.zone} />
              <div className="col grow gap-[3px]">
                <span className="title">
                  {s.title}{" "}
                  {s.isLadyBay && (
                    <span className="badge pink align-[2px]">
                      <IconLady size={12} /> Lady
                    </span>
                  )}
                </span>
                <span className="meta">
                  {SPOT_TYPE_LABEL[s.spotType]} · {CAR_SIZE_LABEL[s.carSize]}
                </span>
                <span className="meta">Leaving at {clock(s.leaveAt)}</span>
              </div>
              <div className="col items-end gap-1">
                <span className="price">{baht(s.price)}</span>
                <span className="small faint row gap-0">
                  View <IconChevron size={14} />
                </span>
              </div>
            </Link>
          ))}
      </div>

      <div className="footer">
        <div className="row between">
          <span className="small muted">Leaving soon?</span>
          <span className="font-[650]">
            Earn up to <span className="mono">{baht(data?.earnUpTo ?? 50)}</span> now
          </span>
        </div>
        {activeListing ? (
          <Link href={`/trip/${activeListing.id}`} className="btn btn-dark">
            View my offered spot <IconArrow />
          </Link>
        ) : me && !me.canOffer ? (
          <Link href="/login?next=/offer" className="btn btn-yellow">
            Log in to offer my spot
          </Link>
        ) : (
          <Link href="/offer" className="btn btn-yellow">
            Offer my spot
          </Link>
        )}
      </div>

      {picker && (
        <Sheet onClose={() => setPicker(false)}>
          <h3 className="h-section">Where are you parking?</h3>
          <div className="options">
            {(bdata?.buildings ?? []).map((b) => (
              <button
                key={b.id}
                className={`option ${b.id === data?.building.id ? "on" : ""}`}
                onClick={() => {
                  setBuildingId(b.id);
                  setPicker(false);
                }}
              >
                <span className="ico">
                  <IconPin />
                </span>
                <span className="grow font-[650]">{b.name}</span>
                <span className="radio" />
              </button>
            ))}
            {!bdata && <div className="skeleton h-16" />}
          </div>
        </Sheet>
      )}
    </div>
  );
}
