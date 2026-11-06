"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type Kind = "success" | "error" | "info";
type Toast = { id: number; kind: Kind; message: string };

const ToastCtx = createContext<{ toast: (kind: Kind, message: string) => void } | null>(null);

const styles: Record<Kind, string> = {
  success: "border-ok/40 text-ok",
  error: "border-bad/40 text-bad",
  info: "border-paper-line text-ink",
};
const icons: Record<Kind, string> = { success: "✓", error: "!", info: "i" };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (kind: Kind, message: string) => {
      const id = nextId.current++;
      setItems((l) => [...l.slice(-3), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      {/* polite live region so screen readers announce toasts */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-paper px-4 py-3 text-sm shadow-sm ${styles[t.kind]}`}
          >
            <span aria-hidden className="mt-px font-semibold">{icons[t.kind]}</span>
            <span className="flex-1 text-ink">{t.message}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-ink-mute hover:text-ink">×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx.toast;
}
