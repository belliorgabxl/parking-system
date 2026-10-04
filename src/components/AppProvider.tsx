"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { MeView } from "@/app/api/me/route";
import { api, ClientError } from "@/lib/client";
import { useOnline } from "@/lib/hooks";
import { Toast } from "./ui";

type Ctx = {
  me: MeView | null;
  refreshMe: () => Promise<MeView | null>;
  buildingId: string | null;
  setBuildingId: (id: string) => void;
  toast: (msg: string) => void;
};

const AppCtx = createContext<Ctx | null>(null);
const BUILDING_KEY = "ps_building";

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp outside AppProvider");
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeView | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [buildingId, setBuildingIdState] = useState<string | null>(() => {
    try {
      return typeof window === "undefined" ? null : localStorage.getItem(BUILDING_KEY);
    } catch {
      return null;
    }
  });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const online = useOnline();

  const refreshMe = useCallback(async () => {
    try {
      const data = await api<MeView>("/api/me");
      setMe(data);
      setSetupError(null);
      return data;
    } catch (err) {
      if (err instanceof ClientError && err.code === "DB_NOT_CONFIGURED") setSetupError(err.message);
      return null;
    }
  }, []);

  useEffect(() => {
    refreshMe(); // eslint-disable-line react-hooks/set-state-in-effect -- initial fetch
  }, [refreshMe]);

  const setBuildingId = useCallback((id: string) => {
    setBuildingIdState(id);
    try {
      localStorage.setItem(BUILDING_KEY, id);
    } catch {}
  }, []);

  const clearToast = useCallback(() => setToastMsg(null), []);

  if (setupError) {
    return (
      <main className="phone">
        <div className="screen">
          <div className="body center-v">
            <div className="card col gap-2.5">
              <h2 className="h-title text-[20px]">Database not connected</h2>
              <p className="muted small">{setupError}</p>
              <pre className="mono small rounded-[10px] bg-[#f4f4f5] p-3 whitespace-pre-wrap">
                cp .env.example .env.local{"\n"}# set MONGODB_URI then restart `npm run dev`
              </pre>
              <button className="btn btn-dark" onClick={refreshMe}>
                Retry
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <AppCtx.Provider value={{ me, refreshMe, buildingId, setBuildingId, toast: setToastMsg }}>
      <main className="phone">
        {!online && <div className="offline">You&apos;re offline — we&apos;ll sync when signal is back</div>}
        {children}
        <Toast message={toastMsg} onDone={clearToast} />
      </main>
    </AppCtx.Provider>
  );
}
