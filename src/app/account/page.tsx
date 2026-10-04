"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/client";
import { baht } from "@/lib/format";
import { useApp } from "@/components/AppProvider";
import { ConfirmSheet, LoadingScreen, Spinner, TopBar } from "@/components/ui";
import { IconBell, IconCar, IconCard, IconChevron, IconClock, IconHelp, IconShield, IconWallet } from "@/components/Icons";

export default function AccountPage() {
  const router = useRouter();
  const { me, refreshMe, toast } = useApp();
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"logout" | "delete" | null>(null);

  if (!me) return <LoadingScreen title="Account" />;
  const guest = me.user.isGuest;
  const nameValue = name ?? me.user.displayName;

  const saveName = async () => {
    setBusy(true);
    try {
      await api("/api/me", { method: "PATCH", body: { displayName: nameValue } });
      await refreshMe();
      setName(null);
      toast("Name saved");
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    await refreshMe();
    router.replace("/");
  };

  const deleteAccount = async () => {
    setBusy(true);
    try {
      await api("/api/me", { method: "DELETE" });
      await refreshMe();
      toast("Your account was deleted");
      router.replace("/");
    } catch (e) {
      toast(errorMessage(e));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  const menu: [string, string, React.ReactNode, React.ReactNode?][] = [
    ["/account/history", "Handover history", <IconClock key="h" />],
    [
      "/wallet",
      "Wallet",
      <IconWallet key="w" />,
      <span key="b" className="mono small muted">
        {baht(me.balance)}
      </span>,
    ],
    [
      "/account/vehicles",
      "My cars",
      <IconCar key="c" />,
      <span key="n" className="small muted">
        {me.vehicles.length || ""}
      </span>,
    ],
    [
      "/account/payments",
      "Payment methods",
      <IconCard key="p" />,
      <span key="n" className="small muted">
        {me.payments.length || ""}
      </span>,
    ],
    [
      "/notifications",
      "Notifications",
      <IconBell key="n" />,
      me.unread ? (
        <span key="u" className="badge red">
          {me.unread}
        </span>
      ) : null,
    ],
    ["/help", "Help & how it works", <IconHelp key="q" />],
  ];

  return (
    <div className="screen">
      <TopBar title="Account" back="/" help={false} />
      <div className="body">
        <div className="card row">
          <span className="avatar">{me.user.displayName.charAt(0).toUpperCase()}</span>
          <div className="col grow gap-0.5">
            <b>{guest ? "Guest" : me.user.displayName}</b>
            <span className="small muted mono">{me.user.phone ? `+66 ${me.user.phone.slice(3)}` : "Not logged in"}</span>
          </div>
          {!guest && (
            <span className="badge soft row gap-1" title="Account standing">
              <IconShield size={12} /> {me.user.standingScore}
            </span>
          )}
        </div>

        {guest ? (
          <div className="card col gap-2.5">
            <b>Save your car, payment and earnings</b>
            <span className="small muted">Log in with your phone number. Everything you did as a guest comes with you.</span>
            <Link href="/login?next=/account" className="btn btn-dark">
              Log in
            </Link>
          </div>
        ) : (
          <div className="card col gap-2">
            <label className="label" htmlFor="name">
              Name <span className="faint small">(must match your bank account to withdraw)</span>
            </label>
            <div className="row">
              <div className="input-wrap grow">
                <input id="name" className="input" value={nameValue} maxLength={40} onChange={(e) => setName(e.target.value)} />
              </div>
              {name !== null && name !== me.user.displayName && (
                <button
                  className="btn btn-dark btn-sm h-[52px]"
                  onClick={saveName}
                  disabled={busy || nameValue.trim().length < 2}
                >
                  {busy ? <Spinner /> : "Save"}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="card pt-0 pb-0">
          {menu.map(([href, label, icon, right]) => (
            <Link key={href} href={href} className="menu-item">
              <span className="faint">{icon}</span>
              <span className="grow">{label}</span>
              {right}
              <IconChevron size={16} />
            </Link>
          ))}
        </div>

        {!guest && (
          <button className="btn btn-outline" onClick={() => setConfirm("logout")}>
            Log out
          </button>
        )}
        <button className="btn btn-ghost red" onClick={() => setConfirm("delete")}>
          Delete {guest ? "guest data" : "account"}
        </button>
      </div>

      {confirm === "logout" && (
        <ConfirmSheet
          title="Log out?"
          body="You'll continue as a new guest on this device. Your account and balance stay safe."
          confirmLabel="Log out"
          onConfirm={logout}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "delete" && (
        <ConfirmSheet
          title="Delete your account?"
          danger
          busy={busy}
          body="Your profile, cars, saved payment methods and notifications are removed. You must have a ฿0 balance and no live handover. This can't be undone."
          confirmLabel="Delete permanently"
          onConfirm={deleteAccount}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
