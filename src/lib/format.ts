export function baht(n: number, opts: { sign?: boolean } = {}) {
  const abs = Math.abs(Math.round(n)).toLocaleString("en-US");
  if (opts.sign) return `${n < 0 ? "-" : "+"}฿${abs}`;
  return `${n < 0 ? "-" : ""}฿${abs}`;
}

export function clock(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function relDay(iso: string | Date) {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diff === 0) return `Today ${clock(d)}`;
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Value for <input type="time"> */
export function toTimeInput(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Next occurrence of HH:MM from now (rolls to tomorrow if already passed). */
export function fromTimeInput(v: string, now = new Date()) {
  const [h, m] = v.split(":").map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d.getTime() < now.getTime() - 60_000) d.setDate(d.getDate() + 1);
  return d;
}
