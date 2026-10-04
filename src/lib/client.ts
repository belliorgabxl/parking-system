"use client";

export class ClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/**
 * fetch wrapper tuned for weak underground signal: timeout, a couple of retries for reads,
 * and errors normalised to ClientError.
 */
export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; timeoutMs?: number; retries?: number } = {},
): Promise<T> {
  const method = opts.method ?? (opts.body ? "POST" : "GET");
  const retries = opts.retries ?? (method === "GET" ? 2 : 0);
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12_000);
    try {
      const res = await fetch(path, {
        method,
        headers: opts.body ? { "content-type": "application/json" } : undefined,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal,
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const { code = "ERROR", message = "Something went wrong.", ...details } = data?.error ?? {};
        throw new ClientError(res.status, code, message, details);
      }
      return data as T;
    } catch (err) {
      lastErr = err;
      if (err instanceof ClientError) throw err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new ClientError(0, "NETWORK", "Weak connection — retrying when you're back online.", { cause: String(lastErr) });
}

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong.";
}
