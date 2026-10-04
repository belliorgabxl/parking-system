"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="screen">
      <div className="body center-v items-center text-center">
        <h1 className="h-title">Something went wrong</h1>
        <p className="muted">Your money is safe — any payment stays held until the handover is confirmed.</p>
        <button className="btn btn-dark mt-3" onClick={reset}>
          Try again
        </button>
        <Link href="/" className="btn btn-ghost">
          Back to home
        </Link>
      </div>
    </div>
  );
}
