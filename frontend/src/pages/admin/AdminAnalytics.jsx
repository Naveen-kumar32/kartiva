import { useState } from "react";
import { Link } from "react-router-dom";

import { getAdminAnalytics } from "@/api";
import { Button, ColumnChart, DataTable, ErrorState, PageHeader, Panel, ShareBars, Skeleton, StoreAvatar } from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { formatCompactInr, formatCurrency, formatNumber, formatPercent } from "@/utils";

import { KpiStrip, Pill } from "./opsShared";

const P = EN.ADMIN_PRO.ANALYTICS;
const RANGES = [30, 90];
const PLAN_TONE = { free: "neutral", gold: "accent", platinum: "info" };

export function AdminAnalytics() {
  useDocumentTitle(P.TITLE);
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useAsync(() => getAdminAnalytics(days), [days]);

  return (
    <div className="space-y-6">
      <PageHeader
        actions={<div className="flex gap-1 rounded-lg bg-white p-1 shadow-card" role="group" aria-label={P.RANGE}>{RANGES.map((d) => <Button aria-pressed={days === d} key={d} onClick={() => setDays(d)} size="sm" variant={days === d ? "primary" : "ghost"}>{P.LAST(d)}</Button>)}</div>}
        subtitle={P.SUBTITLE}
        title={P.TITLE}
      />
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading || !data ? <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton className="h-64 rounded-2xl" key={i} />)}</div> : (
        <>
          <KpiStrip items={[
            ["GMV", formatCompactInr(data.totals.gmv)],
            [P.ORDERS, formatNumber(data.totals.orders)],
            [P.AOV, formatCurrency(data.totals.aov)],
            [P.BUYERS, formatNumber(data.totals.buyers)],
            [P.NEW_BUYERS, formatNumber(data.totals.newBuyers), "success"],
            [P.RETURNING, formatNumber(data.totals.returningBuyers)],
          ]} />
          <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
            <Panel title={P.GMV_TREND(days <= 30 ? 3 : 7)}>
              <ColumnChart labels={data.trend.map((t) => t.label)} series={[{ name: "GMV", values: data.trend.map((t) => t.gmv) }]} />
            </Panel>
            <Panel title={P.REVENUE_MIX}>
              <p className="mb-3 text-2xl font-bold tabular">{formatCurrency(data.revenueTotal)}<span className="ml-1 text-xs font-normal text-muted">{P.PLATFORM_REVENUE}</span></p>
              <ShareBars items={data.revenue.map((r) => ({ label: `${P.STREAM[r.key]} · ${formatCompactInr(r.value)}`, share: r.share }))} />
            </Panel>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title={P.BY_CATEGORY}><ShareBars items={data.byCategory.map((c) => ({ label: `${c.label} · ${formatCompactInr(c.value)}`, share: c.share }))} /></Panel>
            <Panel title={P.BY_STATE}><ShareBars items={data.byState.map((c) => ({ label: `${c.label} · ${formatCompactInr(c.value)}`, share: c.share }))} /></Panel>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel action={<Pill tone="warning">{P.SAMPLE_TRAFFIC}</Pill>} title={P.FUNNEL}>
              <ol className="space-y-3">
                {data.funnel.map((f, i) => (
                  <li key={f.key}>
                    <div className="mb-1 flex justify-between gap-2 text-sm"><span>{P.STAGE[f.key]}</span><span className="tabular"><b>{formatNumber(f.value)}</b>{i > 0 && <span className="ml-2 text-xs text-muted">{P.STEP_RATE(formatPercent((f.value / data.funnel[i - 1].value) * 100, 1))}</span>}</span></div>
                    <div className="h-6 overflow-hidden rounded bg-slate-100"><div className="h-full rounded bg-[#14a397]" style={{ width: `${Math.max(1.5, f.rate)}%` }} /></div>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted">{P.FUNNEL_NOTE(formatPercent(data.funnel.at(-1).rate, 2))}</p>
            </Panel>
            <Panel action={<Link className="text-sm font-semibold text-brand-700 hover:underline" to={ROUTES.ADMIN.LEADS}>{P.OPEN_LEADS}</Link>} title={P.LEADS}>
              <div className="grid grid-cols-2 gap-3">
                {[[P.ENQUIRIES, data.leads.enquiries], [P.ENQUIRIES_WON, data.leads.won], [P.RFQS, data.leads.rfqs], [P.QUOTES, data.leads.quotes]].map(([l, v]) => (
                  <div className="rounded-xl bg-slate-50 p-3" key={l}><p className="text-xs text-muted">{l}</p><p className="text-xl font-bold tabular">{formatNumber(v)}</p></div>
                ))}
              </div>
              <p className="mt-3 text-sm">{P.WIN_RATE}: <b className="tabular">{formatPercent(data.leads.winRate, 0)}</b></p>
            </Panel>
          </div>
          <Panel title={P.LEADERBOARD}>
            <DataTable
              columns={[
                { header: "#", key: "rank", render: (r) => <span className="text-muted tabular">{r.rank}</span> },
                { header: P.SELLER, key: "name", render: (r) => <span className="flex items-center gap-2"><StoreAvatar size="size-8 text-xs" store={r.store} />{r.name}</span> },
                { align: "right", header: "GMV", key: "gmv", render: (r) => formatCurrency(r.gmv) },
                { align: "right", header: P.SHIPMENTS, key: "orders", render: (r) => formatNumber(r.orders) },
                { align: "right", header: P.RATING, key: "rating", render: (r) => (r.rating ? `${r.rating} ★` : "—") },
                { align: "right", header: P.CANCEL_RATE, key: "cancelRate", render: (r) => <span className={r.cancelRate >= 10 ? "font-semibold text-red-600" : ""}>{formatPercent(r.cancelRate, 1)}</span> },
                { header: P.PLAN, key: "plan", render: (r) => <Pill tone={PLAN_TONE[r.plan]}>{P.PLANS[r.plan] ?? r.plan}</Pill> },
              ]}
              empty={P.NO_DATA}
              rowKey="slug"
              rows={data.leaderboard.map((r, i) => ({ ...r, rank: i + 1 }))}
            />
          </Panel>
        </>
      )}
    </div>
  );
}
