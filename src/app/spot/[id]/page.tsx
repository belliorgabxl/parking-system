"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { CAR_SIZE_LABEL, SPOT_TYPE_LABEL } from "@/lib/constants";
import type { SpotDetail } from "@/lib/types";
import { baht, clock, mmss } from "@/lib/format";
import { useCountdown, usePoll } from "@/lib/hooks";
import { ErrorScreen, FloorBadge, KV, LoadingScreen, TopBar } from "@/components/ui";
import { IconLady } from "@/components/Icons";

export default function SpotPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error } = usePoll<SpotDetail>(`/api/listings/${id}`, 8_000);
  const left = useCountdown(data?.spot?.leaveAt, data?.serverNow);

  // Participants (own listing or already grabbed) belong on the live trip screen.
  useEffect(() => {
    if (data?.kind === "transaction") router.replace(`/trip/${id}`);
  }, [data, id, router]);

  if (error)
    return (
      <ErrorScreen
        message={error.message}
        action={
          <Link href="/" className="btn btn-yellow mt-3">
            Find another spot
          </Link>
        }
      />
    );
  if (!data || data.kind !== "spot") return <LoadingScreen title="Select parking spot" />;
  const s = data.spot;

  return (
    <div className="screen">
      <TopBar title="Select parking spot" back="/" />
      <div className="body">
        <div className="card dark row gap-4">
          <FloorBadge floor={s.floor} zone={s.zone} lg />
          <div className="col gap-1">
            <span className="text-[20px] font-[750]">
              Floor {s.floor} · Zone {s.zone}
            </span>
            <span className="muted">
              {SPOT_TYPE_LABEL[s.spotType]} · {CAR_SIZE_LABEL[s.carSize]}
            </span>
            {s.isLadyBay && (
              <span className="badge pink self-start">
                <IconLady size={12} /> Lady parking bay
              </span>
            )}
          </div>
        </div>

        <div className="card">
          <KV
            rows={[
              ["Location", s.building],
              [
                "Leave time",
                <span key="t" className="mono">
                  {clock(s.leaveAt)} <span className="faint">({mmss(left)})</span>
                </span>,
              ],
              ["Floor", s.floor],
              ["Zone", s.zone],
              ["Entrance", s.entrance || "—"],
              ["Landmark", s.landmark || "—"],
            ]}
          />
          {s.descriptionText && <p className="small muted mt-2">“{s.descriptionText}”</p>}
        </div>

        {s.heldByOther && (
          <div className="banner info">
            Another driver is paying for this spot right now. It frees up in about{" "}
            {Math.max(1, Math.ceil((new Date(s.heldUntil!).getTime() - new Date(data.serverNow).getTime()) / 60_000))} min if they
            don&apos;t finish.
          </div>
        )}
        <div className="banner warn">
          Be near the spot before the provider leaves. If you don&apos;t arrive in time, a ฿20 penalty applies.
        </div>
        <p className="small faint">The provider&apos;s car details are shown after you grab the spot.</p>
      </div>
      <div className="footer">
        <div className="footer-row">
          <span>Price</span>
          <strong className="mono">{baht(s.price)}</strong>
        </div>
        {s.heldByOther ? (
          <button className="btn btn-yellow" disabled>
            Someone is paying for this spot
          </button>
        ) : (
          <Link href={`/spot/${id}/pay`} className="btn btn-yellow">
            Grab spot
          </Link>
        )}
      </div>
    </div>
  );
}
