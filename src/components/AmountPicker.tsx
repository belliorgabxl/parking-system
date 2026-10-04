"use client";

import { AMOUNT_PRESETS } from "@/lib/constants";
import { baht } from "@/lib/format";

/** Preset amounts + "Other amount". `custom` is the raw text of the other-amount field (null = preset mode). */
export function AmountPicker({
  amount,
  custom,
  onPreset,
  onCustom,
}: {
  amount: number;
  custom: string | null;
  onPreset: (n: number) => void;
  onCustom: (raw: string) => void;
}) {
  return (
    <div className="col gap-2.5">
      <div className="amounts">
        {AMOUNT_PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            className={`amount ${custom === null && amount === n ? "on" : ""}`}
            onClick={() => onPreset(n)}
          >
            {baht(n)}
          </button>
        ))}
      </div>
      <div className={`input-wrap ${custom !== null ? "border-ink" : ""}`}>
        <span className="prefix mono">฿</span>
        <input
          className="input mono"
          inputMode="numeric"
          placeholder="Other amount"
          value={custom ?? ""}
          onFocus={() => custom === null && onCustom("")}
          onChange={(e) => onCustom(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
      </div>
    </div>
  );
}
