"use client";

import { useRef, useState } from "react";
import { useClientValue } from "@/lib/hooks";
import { IconMic } from "./Icons";

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};

function getRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => Recognition) | null;
}

/** Text input / textarea with an optional mic button (Web Speech API, Thai + English). */
export function VoiceInput({
  value,
  onChange,
  placeholder,
  multiline,
  id,
  lang = "th-TH",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  id?: string;
  lang?: string;
}) {
  const supported = useClientValue(() => !!getRecognition(), false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);

  const toggle = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const R = getRecognition();
    if (!R) return;
    const rec = new R();
    rec.lang = lang;
    rec.interimResults = false;
    rec.continuous = false;
    const base = value;
    rec.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(" ");
      onChange(base ? `${base} ${text}` : text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <div className="input-wrap">
      {multiline ? (
        <textarea
          id={id}
          className="textarea"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      ) : (
        <input id={id} className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {supported && (
        <button
          type="button"
          className={`mic ${listening ? "on" : ""}`}
          onClick={toggle}
          aria-label={listening ? "Stop voice input" : "Voice input"}
        >
          <IconMic />
        </button>
      )}
    </div>
  );
}
