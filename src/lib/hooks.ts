"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api, ClientError } from "./client";

/**
 * Loads `path` and re-polls every `intervalMs` (0 = no polling). Keeps showing the last good data
 * while the connection is flaky, and exposes `stale` so screens can show a subtle indicator.
 */
export function usePoll<T>(path: string | null, intervalMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ClientError | null>(null);
  const [stale, setStale] = useState(false);
  const pathRef = useRef(path);

  const load = useCallback(async () => {
    const p = pathRef.current;
    if (!p) return;
    try {
      const d = await api<T>(p);
      if (pathRef.current !== p) return;
      setData(d);
      setError(null);
      setStale(false);
    } catch (err) {
      const e = err instanceof ClientError ? err : new ClientError(0, "NETWORK", String(err));
      if (e.code === "NETWORK") setStale(true);
      else setError(e);
    }
  }, []);

  useEffect(() => {
    pathRef.current = path;
    if (!path) return;
    load();
    if (!intervalMs) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, intervalMs);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [path, intervalMs, load]);

  return { data, setData, error, stale, loading: !data && !error, reload: load };
}

/** Current time, re-rendering every `everyMs`. */
export function useNow(everyMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

/** Milliseconds left until `deadline`, corrected for client/server clock skew, ticking every second. */
export function useCountdown(deadline: string | null | undefined, serverNow?: string) {
  const now = useNow(1000);
  const [skew, setSkew] = useState(0);
  useEffect(() => {
    if (!serverNow) return;
    const id = setTimeout(() => setSkew(new Date(serverNow).getTime() - Date.now()), 0);
    return () => clearTimeout(id);
  }, [serverNow]);
  return deadline ? new Date(deadline).getTime() - (now + skew) : 0;
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** Read a browser-only value once on the client without hydration mismatches. */
export function useClientValue<T>(get: () => T, serverValue: T) {
  return useSyncExternalStore(
    () => () => {},
    get,
    () => serverValue,
  );
}
