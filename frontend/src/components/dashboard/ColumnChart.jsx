import { useState } from "react";

import { CHART_SERIES } from "@/constants/charts";
import { EN } from "@/locales";
import { formatCompactInr, formatCurrency } from "@/utils/format";

/**
 * Column chart (single or stacked). series: [{ name, values[] }], labels: x categories.
 * Thin columns, 4px rounded top on the top segment, 2px surface gap between stacked segments,
 * recessive grid, per-column hover tooltip, legend when ≥ 2 series.
 */
export function ColumnChart({ height = 220, labels, series }) {
  const [hover, setHover] = useState(null);
  const W = 600;
  const H = height;
  const pad = { bottom: 26, left: 52, right: 8, top: 10 };
  const totals = labels.map((_, i) => series.reduce((s, ser) => s + ser.values[i], 0));
  const rawMax = Math.max(...totals) || 1;
  const step = niceStep(rawMax / 4);
  const max = Math.ceil(rawMax / step) * step;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const band = plotW / labels.length;
  const barW = Math.min(36, band * 0.5);
  const y = (v) => pad.top + plotH - (v / max) * plotH;

  return (
    <div className="relative">
      {series.length > 1 && (
        <ul className="mb-3 flex flex-wrap gap-4 text-xs text-muted">
          {series.map((s, i) => (
            <li className="flex items-center gap-1.5" key={s.name}>
              <span aria-hidden className="size-2.5 rounded-sm" style={{ background: CHART_SERIES[i] }} />{s.name}
            </li>
          ))}
        </ul>
      )}
      <svg aria-label={series.map((s) => s.name).join(" and ")} className="w-full overflow-visible" role="img" viewBox={`0 0 ${W} ${H}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line stroke="#e2e8f0" strokeWidth="1" x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} />
            <text className="fill-slate-500 text-[11px]" textAnchor="end" x={pad.left - 8} y={y(t) + 4}>{formatCompactInr(t)}</text>
          </g>
        ))}
        {labels.map((label, i) => {
          const cx = pad.left + band * i + band / 2;
          let acc = 0;
          const visible = series.map((s, si) => ({ si, v: s.values[i] })).filter((d) => d.v > 0);
          return (
            <g key={label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect fill="transparent" height={plotH} width={band} x={pad.left + band * i} y={pad.top} />
              {visible.map(({ si, v }, k) => {
                const isTop = k === visible.length - 1;
                const y0 = y(acc);
                acc += v;
                const y1 = y(acc);
                const gap = k > 0 ? 2 : 0;
                const h = Math.max(0, y0 - y1 - gap);
                return isTop
                  ? <path d={roundedTop(cx - barW / 2, y1, barW, h, 4)} fill={CHART_SERIES[si]} key={si} opacity={hover == null || hover === i ? 1 : 0.55} />
                  : <rect fill={CHART_SERIES[si]} height={h} key={si} opacity={hover == null || hover === i ? 1 : 0.55} width={barW} x={cx - barW / 2} y={y1 + gap} />;
              })}
              <text className="fill-slate-500 text-[11px]" textAnchor="middle" x={cx} y={H - 8}>{label}</text>
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-raised"
          style={{ left: `${((pad.left + band * hover + band / 2) / W) * 100}%`, top: 0 }}
        >
          <p className="mb-1 font-semibold text-ink">{labels[hover]}</p>
          {series.map((s, i) => (
            <p className="flex items-center justify-between gap-3 text-muted" key={s.name}>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: CHART_SERIES[i] }} />{s.name}</span>
              <span className="font-medium text-ink tabular">{formatCurrency(s.values[hover])}</span>
            </p>
          ))}
          {series.length > 1 && <p className="mt-1 flex justify-between border-t border-line pt-1 font-semibold text-ink"><span>{EN.COMMON.TOTAL}</span><span className="tabular">{formatCurrency(totals[hover])}</span></p>}
        </div>
      )}
    </div>
  );
}

function niceStep(raw) {
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

function roundedTop(x, y, w, h, r) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}
