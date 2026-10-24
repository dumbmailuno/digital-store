"use client";

import { useId } from "react";

type Props = {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  error: string | null;
  valid: boolean;
  touched: boolean;
  autoComplete?: string;
  hint?: string;
  children?: React.ReactNode;
};

/**
 * Inline field: error appears after the user leaves the field (or while
 * correcting a field that already had an error); a quiet check shows when valid.
 */
export function Field(p: Props) {
  const id = useId();
  const showError = p.touched && p.error;
  const showOk = p.touched && p.valid;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{p.label}</label>
      <input
        id={id}
        type={p.type ?? "text"}
        value={p.value}
        autoComplete={p.autoComplete}
        onChange={(e) => p.onChange(e.target.value)}
        onBlur={p.onBlur}
        aria-invalid={!!showError}
        aria-describedby={`${id}-msg`}
        className={`input ${showError ? "border-bad" : showOk ? "border-ok" : ""}`}
      />
      <p id={`${id}-msg`} className="mt-1 min-h-[1.25rem] text-xs">
        {showError ? (
          <span className="text-bad">{p.error}</span>
        ) : showOk ? (
          <span className="text-ok">✓ Looks good</span>
        ) : (
          <span className="text-ink-mute">{p.hint}</span>
        )}
      </p>
      {p.children}
    </div>
  );
}
