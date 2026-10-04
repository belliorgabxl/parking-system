"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { IconBack, IconHelp, IconSad, IconCheck } from "./Icons";

export function TopBar({
  title,
  back,
  right,
  help = true,
}: {
  title?: ReactNode;
  back?: string | true;
  right?: ReactNode;
  help?: boolean;
}) {
  const router = useRouter();
  return (
    <header className="topbar">
      {back &&
        (back === true ? (
          <button className="icon-btn" aria-label="Back" onClick={() => router.back()}>
            <IconBack />
          </button>
        ) : (
          <Link className="icon-btn" aria-label="Back" href={back}>
            <IconBack />
          </Link>
        ))}
      <h1>{title}</h1>
      {right}
      {help && (
        <Link className="icon-btn" href="/help" aria-label="Help">
          <IconHelp />
        </Link>
      )}
    </header>
  );
}

export function FloorBadge({ floor, zone, lg }: { floor: string; zone: string; lg?: boolean }) {
  return (
    <div className={`floor-badge ${lg ? "lg" : ""}`}>
      <b>{floor.length > 3 ? floor.slice(0, 3) : floor}</b>
      <span>{zone}</span>
    </div>
  );
}

export function Sheet({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        {children}
      </div>
    </div>
  );
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDone, 3500);
    return () => clearTimeout(id);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}

export function LoadingScreen({ title }: { title?: string }) {
  return (
    <div className="screen">
      <TopBar title={title} back />
      <div className="body">
        <div className="skeleton h-[120px]" />
        <div className="skeleton h-[80px]" />
        <div className="skeleton h-[80px]" />
      </div>
    </div>
  );
}

export function ErrorScreen({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="screen">
      <TopBar back="/" />
      <div className="body center-v text-center">
        <div className="hero-icon sad">
          <IconSad />
        </div>
        <p className="h-title text-[20px]">{message}</p>
        {action ?? (
          <Link href="/" className="btn btn-dark mt-3">
            Back to home
          </Link>
        )}
      </div>
    </div>
  );
}

export function SuccessHero({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="center col mt-3 items-center gap-1">
      <div className="hero-icon green">
        <IconCheck size={40} />
      </div>
      <h2 className="h-title">{title}</h2>
      {subtitle && <p className="muted">{subtitle}</p>}
    </div>
  );
}

export function Option({
  on,
  onClick,
  icon,
  title,
  subtitle,
  kind = "radio",
  right,
}: {
  on: boolean;
  onClick: () => void;
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  kind?: "radio" | "check";
  right?: ReactNode;
}) {
  return (
    <button type="button" className={`option ${on ? "on" : ""}`} onClick={onClick} role={kind} aria-checked={on}>
      {icon && <span className="ico">{icon}</span>}
      <span className="col grow gap-0.5">
        <span className="font-[650]">{title}</span>
        {subtitle && <span className="small muted">{subtitle}</span>}
      </span>
      {right}
      <span className={kind}>{kind === "check" && on && <IconCheck size={14} />}</span>
    </button>
  );
}

/** Confirmation bottom sheet for destructive or costly actions. */
export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Sheet onClose={busy ? undefined : onClose}>
      <h3 className="h-title text-[20px]">{title}</h3>
      {body && <div className="muted">{body}</div>}
      {children}
      <button className={`btn ${danger ? "btn-red" : "btn-dark"}`} onClick={onConfirm} disabled={busy}>
        {busy ? <Spinner /> : confirmLabel}
      </button>
      <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
        Keep it
      </button>
    </Sheet>
  );
}

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows
        .filter(([, v]) => v !== "" && v !== null && v !== undefined)
        .map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
    </dl>
  );
}
