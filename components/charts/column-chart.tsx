"use client";

import { useId, useMemo, useState } from "react";

export type Pt = { key: string; label: string; value: number };

const W = 640, H = 220, ML = 46, MR = 8, MT = 12, MB = 26;
const PW = W - ML - MR, PH = H - MT - MB;

const fmt = {
  usd: (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n),
  count: (n: number) => new Intl.NumberFormat("en-US").format(n),
};
const compact = (n: number, kind: "usd" | "count") => {
  const s = n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n);
  return kind === "usd" ? `$${s}` : s;
};

/** Round the top of the axis up to a clean number so ticks read 0 / 25 / 50 / 75 / 100. */
function niceMax(v: number) {
  if (v <= 0) return 4;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 4 ? 4 : f <= 5 ? 5 : 10;
  return nice * exp;
}

/** Column with a 4px rounded top and a square baseline. */
function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function ColumnChart({ title, subtitle, data, kind }: { title: string; subtitle?: string; data: Pt[]; kind: "usd" | "count" }) {
  const uid = useId();
  const [active, setActive] = useState<number | null>(null);
  const n = data.length;

  const { max, ticks, slot, barW } = useMemo(() => {
    const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
    const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);
    const slot = n ? PW / n : PW;
    return { max, ticks, slot, barW: Math.min(24, slot * 0.7) };
  }, [data, n]);

  const total = data.reduce((s, d) => s + d.value, 0);
  const step = Math.max(1, Math.ceil(n / 6));
  const y = (v: number) => MT + PH - (v / max) * PH;
  const a = active !== null ? data[active] : null;
  const leftPct = active !== null ? ((ML + (active + 0.5) * slot) / W) * 100 : 0;

  function onKey(e: React.KeyboardEvent) {
    if (!n) return;
    if (e.key === "ArrowRight") { e.preventDefault(); setActive((i) => (i === null ? 0 : Math.min(n - 1, i + 1))); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); setActive((i) => (i === null ? n - 1 : Math.max(0, i - 1))); }
    else if (e.key === "Escape") setActive(null);
  }

  return (
    <figure className="card min-w-0 p-4 sm:p-5">
      <figcaption className="mb-3">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-ink-soft">{subtitle ?? ""}{subtitle ? " · " : ""}Total {fmt[kind](total)}</p>
      </figcaption>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full touch-pan-y select-none" role="img" tabIndex={0}
          aria-label={`${title}. ${n} points, total ${fmt[kind](total)}. Use left and right arrow keys to read each value.`}
          onKeyDown={onKey} onBlur={() => setActive(null)} onPointerLeave={() => setActive(null)}>
          {/* gridlines + y ticks: hairline, solid, recessive */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={ML} x2={W - MR} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" strokeWidth={1} />
              <text x={ML - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--viz-text)">{compact(t, kind)}</text>
            </g>
          ))}

          {data.map((d, i) => {
            const x0 = ML + i * slot;
            const h = (d.value / max) * PH;
            const bx = x0 + (slot - barW) / 2;
            return (
              <g key={d.key}>
                {active === i && <rect x={x0} y={MT} width={slot} height={PH} fill="var(--viz-hover)" />}
                {h > 0 && <path d={columnPath(bx, MT + PH - h, barW, h)} fill="var(--viz-1)" />}
                {/* hit area is the whole slot (far larger than the mark) */}
                <rect x={x0} y={MT} width={slot} height={PH} fill="transparent" onPointerEnter={() => setActive(i)} onPointerMove={() => setActive(i)} />
                {i % step === 0 && <text x={x0 + slot / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--viz-text)">{d.label}</text>}
              </g>
            );
          })}
          <line x1={ML} x2={W - MR} y1={MT + PH} y2={MT + PH} stroke="var(--viz-axis)" strokeWidth={1} />
        </svg>

        {a && (
          <div role="status" className="pointer-events-none absolute top-1 z-10 rounded border border-paper-line bg-paper px-3 py-2 text-xs shadow-sm"
            style={{ left: `${leftPct}%`, transform: leftPct > 78 ? "translateX(-100%)" : leftPct < 22 ? "translateX(0)" : "translateX(-50%)" }}>
            <p className="text-base font-semibold leading-tight">{fmt[kind](a.value)}</p>
            <p className="text-ink-soft"><span aria-hidden className="mr-1.5 inline-block h-0.5 w-3 align-middle" style={{ background: "var(--viz-1)" }} />{a.label}</p>
          </div>
        )}
      </div>

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-ink-soft underline-offset-2 hover:underline">View as table</summary>
        <div className="mt-2 max-h-56 overflow-auto rounded border border-paper-line">
          <table className="w-full text-left" aria-describedby={uid}>
            <caption id={uid} className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-paper-dim"><tr><th className="px-3 py-1.5 font-medium">Day</th><th className="px-3 py-1.5 text-right font-medium">{kind === "usd" ? "Amount" : "Count"}</th></tr></thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key} className="border-t border-paper-line"><td className="px-3 py-1">{d.label}</td><td className="px-3 py-1 text-right tabular-nums">{fmt[kind](d.value)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
