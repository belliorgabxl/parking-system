"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, errorMessage } from "@/lib/client";
import { mmss } from "@/lib/format";
import { useCountdown } from "@/lib/hooks";
import { useApp } from "@/components/AppProvider";
import { LoadingScreen, Spinner, TopBar } from "@/components/ui";

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const { refreshMe, toast } = useApp();
  const [step, setStep] = useState<"phone" | "code" | "name">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [otpTimes, setOtpTimes] = useState<{ expiresAt: string; resendAt: string; serverNow: string } | null>(null);
  const expiresIn = useCountdown(otpTimes?.expiresAt, otpTimes?.serverNow);
  const resendIn = useCountdown(otpTimes?.resendAt, otpTimes?.serverNow);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const digits = phone.replace(/\D/g, "");
  const phoneOk = /^0?[689]\d{8}$/.test(digits);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const requestCode = () =>
    run(async () => {
      const r = await api<{ devCode?: string; expiresAt: string; resendAt: string; serverNow: string }>("/api/auth/otp", {
        body: { phone: `+66${digits.replace(/^0/, "")}` },
      });
      setDevCode(r.devCode ?? null);
      setOtpTimes({ expiresAt: r.expiresAt, resendAt: r.resendAt, serverNow: r.serverNow });
      setCode("");
      setStep("code");
    });

  const verify = (value = code) =>
    run(async () => {
      const r = await api<{ isNew: boolean; displayName: string }>("/api/auth/verify", { body: { code: value } });
      await refreshMe();
      if (r.isNew) {
        setStep("name");
        return;
      }
      toast(`Welcome back, ${r.displayName}`);
      router.replace(next);
    });

  const saveName = () =>
    run(async () => {
      await api("/api/me", { method: "PATCH", body: { displayName: name } });
      await refreshMe();
      toast("You're logged in");
      router.replace(next);
    });

  if (step === "name") {
    return (
      <div className="screen">
        <TopBar title="" />
        <div className="body">
          <h2 className="h-title">What should we call you?</h2>
          <p className="muted">
            Shown to the other driver during a handover. Use the name on your bank account so you can withdraw.
          </p>
          <div className="input-wrap">
            <input
              className="input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          </div>
          {err && <div className="banner error">{err}</div>}
        </div>
        <div className="footer">
          <button className="btn btn-dark" disabled={!name.trim() || busy} onClick={saveName}>
            {busy ? <Spinner /> : "Continue"}
          </button>
          <button className="btn btn-ghost" onClick={() => router.replace(next)}>
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  if (step === "code") {
    return (
      <div className="screen">
        <TopBar title="" back={true} />
        <div className="body">
          <h2 className="h-title">Enter the 6-digit code</h2>
          <p className="muted">
            Sent to <b className="mono">+66 {digits.replace(/^0/, "")}</b>{" "}
            <button className="link" onClick={() => setStep("phone")}>
              Change
            </button>
          </p>
          <div className="input-wrap">
            <input
              className="input mono text-center text-[28px] tracking-[0.4em]"

              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(v);
                if (v.length === 6) verify(v);
              }}
            />
          </div>
          {devCode && (
            <div className="banner info">
              Demo mode (no SMS provider): your code is&nbsp;<b className="mono">{devCode}</b>
            </div>
          )}
          {err && <div className="banner error">{err}</div>}
          <p className="small muted">
            {expiresIn > 0 ? (
              <>
                Code expires in <b className="mono">{mmss(expiresIn)}</b>
              </>
            ) : (
              <span className="red">Code expired — request a new one.</span>
            )}
          </p>
          <button className="link-arrow self-start" onClick={requestCode} disabled={busy || resendIn > 0}>
            {resendIn > 0 ? `Resend code in ${Math.ceil(resendIn / 1000)}s` : "Resend code"}
          </button>
        </div>
        <div className="footer">
          <button className="btn btn-dark" disabled={code.length !== 6 || busy || expiresIn <= 0} onClick={() => verify()}>
            {busy ? <Spinner /> : "Verify"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar title="" back={true} />
      <div className="body">
        <h2 className="h-title">Log in to save your car and payment info</h2>
        <div className="field">
          <label htmlFor="phone">Phone number</label>
          <div className="input-wrap">
            <span className="prefix mono">+66</span>
            <input
              id="phone"
              className="input mono"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="81 234 5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d\s-]/g, "").slice(0, 13))}
            />
          </div>
          <span className="small faint">We&apos;ll text you a one-time code.</span>
        </div>
        <p className="small faint">
          Anything you did as a guest on this device — wallet balance, history — moves into your account.
        </p>
        {err && <div className="banner error">{err}</div>}
      </div>
      <div className="footer">
        <button className="btn btn-dark" disabled={!phoneOk || busy} onClick={requestCode}>
          {busy ? <Spinner /> : "Continue"}
        </button>
        <button className="btn btn-ghost" onClick={() => router.replace(next)}>
          Continue as guest
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Login />
    </Suspense>
  );
}
