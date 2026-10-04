"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { api, ClientError, errorMessage } from "@/lib/client";
import { CAR_SIZES, CAR_SIZE_LABEL, SPOT_TYPES, SPOT_TYPE_LABEL, type CarSize, type SpotType } from "@/lib/constants";
import { baht, clock, fromTimeInput, toTimeInput } from "@/lib/format";
import { useNow, usePoll } from "@/lib/hooks";
import type { TransactionView } from "@/lib/engine";
import { useApp } from "@/components/AppProvider";
import { KV, LoadingScreen, Sheet, Spinner, TopBar } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { IconLady, IconPin } from "@/components/Icons";

type Building = {
  id: string;
  name: string;
  floors: string[];
  zones: string[];
  entrances: string[];
  landmarks: string[];
};

type Draft = {
  buildingId: string;
  descriptionText: string;
  floor: string;
  zone: string;
  entrance: string;
  landmark: string;
  spotType: SpotType;
  carSize: CarSize;
  vehicle: string;
  leaveTime: string; // HH:MM
  isLadyBay: boolean;
};

const DRAFT_KEY = "ps_offer_draft";
/** Drafts older than this are discarded (the spot details are probably stale). */
const DRAFT_TTL_MS = 30 * 60_000;
const LEAVE_PRESETS = [10, 20, 30, 45];

function Chips({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={`chip ${value === o ? "on" : ""}`}
          onClick={() => onChange(value === o ? "" : o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/** Pull floor / zone hints out of free text like "B2 floor, Zone C, near the red elevator". */
function detectFromText(text: string, b: Building) {
  const t = ` ${text.toLowerCase()} `;
  const floor = b.floors.find((f) => new RegExp(`[\\s,(]${f.toLowerCase()}[\\s,).]`).test(t)) ?? "";
  const zoneMatch = t.match(/zone\s*([a-z0-9])\b/);
  const zone = zoneMatch ? (b.zones.find((z) => z.toLowerCase() === zoneMatch[1]) ?? "") : "";
  const landmark = b.landmarks.find((l) => t.includes(l.toLowerCase())) ?? "";
  const entrance = b.entrances.find((e) => t.includes(e.toLowerCase().replace(" entrance", ""))) ?? "";
  return { floor, zone, landmark, entrance };
}

function OfferFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("edit");
  const fromLast = params.get("from") === "last";
  const { me, buildingId, setBuildingId, refreshMe, toast } = useApp();
  const { data: bdata } = usePoll<{ buildings: Building[] }>("/api/buildings");
  const [step, setStep] = useState<1 | 2>(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picker, setPicker] = useState(false);
  const [quote, setQuote] = useState<{ price: number; providerEarning: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(15_000);

  const building = useMemo(() => bdata?.buildings.find((b) => b.id === draft?.buildingId) ?? null, [bdata, draft?.buildingId]);

  // Initialise the draft: edit existing listing → saved draft → last parked spot → defaults.
  useEffect(() => {
    if (draft || !bdata || !me) return;
    const defaults = (): Draft => ({
      buildingId: buildingId && bdata.buildings.some((b) => b.id === buildingId) ? buildingId : bdata.buildings[0].id,
      descriptionText: "",
      floor: "",
      zone: "",
      entrance: "",
      landmark: "",
      spotType: "indoor",
      carSize: "any",
      vehicle: me.vehicle?.text ?? "",
      leaveTime: toTimeInput(new Date(Date.now() + 20 * 60_000)),
      isLadyBay: false,
    });
    (async () => {
      if (editId) {
        try {
          const t = await api<TransactionView>(`/api/listings/${editId}`);
          const l = t.listing;
          setDraft({
            buildingId: l.building.id,
            descriptionText: l.descriptionText,
            floor: l.floor,
            zone: l.zone,
            entrance: l.entrance,
            landmark: l.landmark,
            spotType: l.spotType as SpotType,
            carSize: l.carSize as CarSize,
            vehicle: l.vehicle,
            leaveTime: toTimeInput(new Date(l.leaveAt)),
            isLadyBay: l.isLadyBay,
          });
        } catch (err) {
          setError(errorMessage(err));
          setDraft(defaults());
        }
        return;
      }
      try {
        const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null") as { savedAt: number; draft: Draft } | null;
        if (saved?.draft && Date.now() - saved.savedAt < DRAFT_TTL_MS) {
          const restored = { ...defaults(), ...saved.draft };
          // A leave time that has already passed is reset to the default.
          if (fromTimeInput(restored.leaveTime).getTime() - Date.now() < 5 * 60_000) restored.leaveTime = defaults().leaveTime;
          setDraft(restored);
          return;
        }
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {}
      const d = defaults();
      if (fromLast && me.lastParked) {
        Object.assign(d, {
          buildingId: me.lastParked.buildingId,
          floor: me.lastParked.floor,
          zone: me.lastParked.zone,
          entrance: me.lastParked.entrance,
          landmark: me.lastParked.landmark,
        });
      }
      setDraft(d);
    })();
  }, [bdata, me, draft, buildingId, editId, fromLast]);

  // Keep the draft across the login detour.
  useEffect(() => {
    if (!draft || editId) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), draft }));
    } catch {}
  }, [draft, editId]);

  useEffect(() => {
    if (!draft) return;
    let cancelled = false;
    api<{ price: number; providerEarning: number }>(`/api/quote?buildingId=${draft.buildingId}&lady=${draft.isLadyBay ? 1 : 0}`)
      .then((q) => !cancelled && setQuote(q))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [draft?.buildingId, draft?.isLadyBay]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!draft || !building) return <LoadingScreen title="Offer my spot" />;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const leaveAt = fromTimeInput(draft.leaveTime, new Date(now));
  const minutes = Math.round((leaveAt.getTime() - now) / 60_000);
  const leaveError =
    minutes < 5 ? "Pick a time at least 5 minutes from now." : minutes > 120 ? "Pick a time within the next 2 hours." : null;

  const onDescribe = (text: string) => {
    const hint = detectFromText(text, building);
    setDraft((d) =>
      d
        ? {
            ...d,
            descriptionText: text,
            floor: d.floor || hint.floor,
            zone: d.zone || hint.zone,
            landmark: d.landmark || hint.landmark,
            entrance: d.entrance || hint.entrance,
            spotType: /roof/i.test(hint.floor) ? "rooftop" : d.spotType,
          }
        : d,
    );
  };

  const needsLogin = !editId && !!me && !me.canOffer;
  const step1Missing = !draft.floor
    ? "Choose your floor"
    : !draft.zone
      ? "Choose your zone"
      : !draft.vehicle.trim()
        ? "Add your car info"
        : leaveError;

  const payload = () => ({
    buildingId: draft.buildingId,
    floor: draft.floor,
    zone: draft.zone,
    entrance: draft.entrance,
    landmark: draft.landmark,
    descriptionText: draft.descriptionText,
    vehicle: draft.vehicle,
    spotType: draft.spotType,
    carSize: draft.carSize,
    isLadyBay: draft.isLadyBay,
    leaveAt: leaveAt.toISOString(),
    expectedEarning: quote?.providerEarning,
  });

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (editId) {
        await api(`/api/listings/${editId}`, { method: "PATCH", body: payload() });
        toast("Spot details updated");
        router.replace(`/trip/${editId}`);
        return;
      }
      const t = await api<TransactionView>("/api/listings", { body: payload() });
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {}
      setBuildingId(draft.buildingId);
      await refreshMe();
      router.replace(`/trip/${t.listing.id}`);
    } catch (err) {
      if (err instanceof ClientError && err.code === "PRICE_CHANGED") {
        setQuote({ price: Number(err.details.price), providerEarning: Number(err.details.providerEarning) });
        setError(`${err.message} Tap Confirm again to accept.`);
      } else if (err instanceof ClientError && err.code === "ACTIVE_LISTING" && err.details.listingId) {
        router.replace(`/trip/${err.details.listingId}`);
      } else if (err instanceof ClientError && err.code === "LOGIN_REQUIRED") {
        router.push("/login?next=/offer");
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 1) {
    return (
      <div className="screen">
        <TopBar title={editId ? "Edit spot details" : "Offer my spot"} back={editId ? `/trip/${editId}` : "/"} />
        <div className="body">
          <h2 className="h-title">Where is your parking spot?</h2>

          <div className="card row">
            <span className="icon-btn border-primary bg-primary">
              <IconPin />
            </span>
            <div className="col grow gap-0">
              <span className="small faint">Current location</span>
              <b>{building.name}</b>
            </div>
            {!editId && (
              <button className="btn btn-outline btn-sm" onClick={() => setPicker(true)}>
                Change
              </button>
            )}
          </div>

          <div className="field">
            <label htmlFor="desc">Describe it in your own words</label>
            <VoiceInput
              id="desc"
              multiline
              value={draft.descriptionText}
              onChange={onDescribe}
              placeholder="B2 floor, Zone C, near the red elevator"
            />
          </div>

          <h3 className="h-section">Help us narrow it down</h3>
          <div className="field">
            <span className="label">Floor *</span>
            <Chips
              options={building.floors}
              value={draft.floor}
              onChange={(v) => {
                set("floor", v);
                if (/roof/i.test(v)) set("spotType", "rooftop");
              }}
            />
          </div>
          <div className="field">
            <span className="label">Zone *</span>
            <Chips options={building.zones} value={draft.zone} onChange={(v) => set("zone", v)} />
          </div>
          <div className="field">
            <span className="label">Nearest entrance</span>
            <Chips options={building.entrances} value={draft.entrance} onChange={(v) => set("entrance", v)} />
          </div>
          <div className="field">
            <span className="label">Landmark</span>
            <Chips options={building.landmarks} value={draft.landmark} onChange={(v) => set("landmark", v)} />
          </div>
          <div className="field">
            <span className="label">Spot type</span>
            <Chips
              options={SPOT_TYPES.map((s) => SPOT_TYPE_LABEL[s])}
              value={SPOT_TYPE_LABEL[draft.spotType]}
              onChange={(v) => set("spotType", SPOT_TYPES.find((s) => SPOT_TYPE_LABEL[s] === v) ?? "indoor")}
            />
          </div>
          <div className="field">
            <span className="label">Fits car size</span>
            <Chips
              options={CAR_SIZES.map((s) => CAR_SIZE_LABEL[s])}
              value={CAR_SIZE_LABEL[draft.carSize]}
              onChange={(v) => set("carSize", CAR_SIZES.find((s) => CAR_SIZE_LABEL[s] === v) ?? "any")}
            />
          </div>

          <div className="field">
            <label htmlFor="car">Your car info *</label>
            {(me?.vehicles.length ?? 0) > 0 && (
              <div className="chips">
                {me!.vehicles.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`chip ${draft.vehicle === v.text ? "on" : ""}`}
                    onClick={() => set("vehicle", v.text)}
                  >
                    {v.makeModel || v.text}
                    {v.plate && <span className="faint mono small">{v.plate}</span>}
                  </button>
                ))}
              </div>
            )}
            <VoiceInput
              id="car"
              value={draft.vehicle}
              onChange={(v) => set("vehicle", v)}
              placeholder="Toyota Yaris, Red, AB1460"
              lang="en-US"
            />
            {me?.user.isGuest ? (
              <Link href="/login?next=/offer" className="small link self-start">
                Log in to save your car info for next time
              </Link>
            ) : (
              <Link href="/account/vehicles" className="small faint">
                New cars are saved automatically · Manage cars
              </Link>
            )}
          </div>

          <div className="field">
            <label htmlFor="leave">When do you want to leave?</label>
            <div className="input-wrap">
              <input
                id="leave"
                type="time"
                className="input mono"
                value={draft.leaveTime}
                onChange={(e) => set("leaveTime", e.target.value)}
              />
            </div>
            <div className="chips">
              {LEAVE_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="chip"
                  onClick={() => set("leaveTime", toTimeInput(new Date(Date.now() + m * 60_000)))}
                >
                  in {m} min
                </button>
              ))}
            </div>
            {leaveError ? <span className="err">{leaveError}</span> : <span className="small faint">In about {minutes} min</span>}
          </div>
          {error && <div className="banner error">{error}</div>}
        </div>

        <div className="footer">
          <div className="footer-row">
            <span>You&apos;ll earn for this spot</span>
            <strong className="mono">{quote ? baht(quote.providerEarning) : "…"}</strong>
          </div>
          {needsLogin ? (
            <>
              <span className="small muted center">
                You&apos;ve used your guest offer. Log in to keep offering — your draft is saved.
              </span>
              <Link href="/login?next=/offer" className="btn btn-dark">
                Log in to continue
              </Link>
            </>
          ) : (
            <button
              className="btn btn-dark"
              disabled={!!step1Missing || submitting}
              onClick={() => (editId ? submit() : setStep(2))}
            >
              {submitting ? <Spinner /> : (step1Missing ?? (editId ? "Save changes" : "Continue"))}
            </button>
          )}
        </div>

        {picker && bdata && (
          <Sheet onClose={() => setPicker(false)}>
            <h3 className="h-section">Change location</h3>
            <div className="options">
              {bdata.buildings.map((b) => (
                <button
                  key={b.id}
                  className={`option ${b.id === draft.buildingId ? "on" : ""}`}
                  onClick={() => {
                    setDraft({ ...draft, buildingId: b.id, floor: "", zone: "", entrance: "", landmark: "" });
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
            </div>
          </Sheet>
        )}
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar title="Offer my spot" />
      <div className="body">
        <button className="link-arrow self-start" onClick={() => setStep(1)}>
          ← Back to edit
        </button>
        <h2 className="h-title">Confirm your parking details</h2>
        <div className="card">
          <KV
            rows={[
              ["Building", building.name],
              ["Spot", `${draft.floor} · Zone ${draft.zone}`],
              ["Type", `${SPOT_TYPE_LABEL[draft.spotType]} · ${CAR_SIZE_LABEL[draft.carSize]}`],
              ["Entrance", draft.entrance || "—"],
              ["Landmark", draft.landmark || "—"],
              ["Car info", draft.vehicle],
              [
                "Leave time",
                <span key="t" className="mono">
                  {clock(leaveAt)}
                </span>,
              ],
            ]}
          />
          {draft.descriptionText && <p className="small muted mt-2">“{draft.descriptionText}”</p>}
        </div>

        <button type="button" className="card row text-left" onClick={() => set("isLadyBay", !draft.isLadyBay)}>
          <span className="icon-btn border-[#fce7f3] bg-[#fce7f3] text-[#be185d]">
            <IconLady />
          </span>
          <span className="col grow gap-0.5">
            <b>Lady parking bay</b>
            <span className="small muted">Special parking earns an extra ฿10</span>
          </span>
          <span className={`toggle ${draft.isLadyBay ? "on" : ""}`} role="switch" aria-checked={draft.isLadyBay} />
        </button>

        <p className="small faint">
          Free to cancel while we look for a driver. Once a driver is matched, cancelling or not leaving on time costs ฿20.
        </p>
        {error && <div className="banner error">{error}</div>}
      </div>
      <div className="footer">
        <div className="footer-row">
          <span>Spot price</span>
          <span className="mono">{quote ? baht(quote.price) : "…"}</span>
        </div>
        <div className="footer-row">
          <span>You&apos;ll earn for this spot</span>
          <strong className="mono">{quote ? baht(quote.providerEarning) : "…"}</strong>
        </div>
        <button className="btn btn-dark" onClick={submit} disabled={submitting || !!leaveError}>
          {submitting ? <Spinner /> : (leaveError ?? "Confirm spot")}
        </button>
      </div>
    </div>
  );
}

export default function OfferPage() {
  return (
    <Suspense fallback={<LoadingScreen title="Offer my spot" />}>
      <OfferFlow />
    </Suspense>
  );
}
