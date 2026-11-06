"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function DismissibleDetails({
  children, summary, summaryClassName, className, label, title,
}: {
  children: ReactNode;
  summary: ReactNode;
  summaryClassName: string;
  className: string;
  label: string;
  title?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function dismiss(event: PointerEvent | KeyboardEvent) {
      if (event.type === "keydown" && (event as KeyboardEvent).key !== "Escape") return;
      if (event.type === "pointerdown" && ref.current?.contains(event.target as Node)) return;
      if (ref.current?.open) {
        ref.current.open = false;
        if (event.type === "keydown") {
          ref.current.querySelector("summary")?.focus();
        }
      }
    }

    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, []);

  return (
    <details ref={ref} className={className}>
      <summary aria-label={label} title={title ?? label} className={summaryClassName}>
        {summary}
      </summary>
      {children}
    </details>
  );
}
