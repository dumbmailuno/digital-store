export type BarRow = { key: string; label: string; value: number; display: string; sub?: string };

/**
 * Horizontal bars for ranked categories. One series, so no legend; the value
 * sits at the bar tip. Text stays in ink tokens; only the mark carries colour.
 * Server-renderable (no JS needed) and fully readable as text.
 */
export function BarList({ title, subtitle, rows, empty = "Nothing to show yet." }: { title: string; subtitle?: string; rows: BarRow[]; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure className="card min-w-0 p-4 sm:p-5">
      <figcaption className="mb-3">
        <p className="text-sm font-semibold">{title}</p>
        {subtitle && <p className="text-xs text-ink-soft">{subtitle}</p>}
      </figcaption>
      {rows.length === 0 ? <p className="text-sm text-ink-soft">{empty}</p> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate" title={r.label}>{r.label}</span>
                <span className="shrink-0 font-semibold tabular-nums">{r.display}</span>
              </div>
              <div className="mt-1 h-2.5 w-full" aria-hidden>
                <div className="h-full rounded-r-[4px]" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: "var(--viz-1)" }} />
              </div>
              {r.sub && <p className="mt-0.5 text-xs text-ink-soft">{r.sub}</p>}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
