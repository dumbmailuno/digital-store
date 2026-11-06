"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

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
  const [passwordVisible, setPasswordVisible] = useState(false);
  const showError = p.touched && p.error;
  const showOk = p.touched && p.valid;
  const isPassword = p.type === "password";
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{p.label}</label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && passwordVisible ? "text" : p.type ?? "text"}
          value={p.value}
          autoComplete={p.autoComplete}
          onChange={(e) => p.onChange(e.target.value)}
          onBlur={p.onBlur}
          aria-invalid={!!showError}
          aria-describedby={`${id}-msg`}
          className={`input ${isPassword ? "pr-12" : ""} ${showError ? "border-bad" : showOk ? "border-ok" : ""}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setPasswordVisible((visible) => !visible)}
            aria-label={passwordVisible ? "Hide password" : "Show password"}
            aria-pressed={passwordVisible}
            className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-full text-ink-mute transition-colors hover:text-ink"
          >
            {passwordVisible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
          </button>
        )}
      </div>
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
