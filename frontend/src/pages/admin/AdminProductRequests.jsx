import { CheckCircle2, Eye, EyeOff, Forward, Mail, MapPin, Phone, Send, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { adminForwardRfq, adminUpdateRfq, getProductRequests } from "@/api";
import { Badge, Button, DataTable, Drawer, ErrorState, FormTextarea, PageHeader, PageLoader, Panel, SearchInput, Tabs } from "@/components";
import { useAsync } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { cn } from "@/utils/cn";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "@/utils/format";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast, successToast } from "@/utils/toast";

import { KpiStrip } from "./opsShared";
import { useActor } from "./opsUtils";

const Q = EN.PRODUCT_REQ;
const STAGE_TONE = { awaiting: "warning", awarded: "success", closed: "neutral", quoted: "info", sourcing: "danger" };
const STAGES = ["all", "sourcing", "awaiting", "quoted", "awarded", "closed"];

// Admin: every customer product request (buy request / RFQ) with delivery tracking per seller + forwarding.
export function AdminProductRequests() {
  const actor = useActor();
  const { data, error, reload: load } = useAsync(getProductRequests, []);
  const [stage, setStage] = useState("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.requests ?? []).filter((r) => (stage === "all" || r.stage === stage)
      && (!q || `${r.title} ${r.buyer.name} ${r.buyer.businessName ?? ""} ${r.deliveryCity} ${r.categoryName}`.toLowerCase().includes(q)));
  }, [data, stage, query]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <PageLoader />;
  const all = data.requests;
  const count = (s) => all.filter((r) => r.stage === s).length;
  const sent = all.reduce((n, r) => n + r.stats.sent, 0);
  const viewed = all.reduce((n, r) => n + r.stats.viewed, 0);
  const active = all.find((r) => r.id === openId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader actions={<Button to={ROUTES.ADMIN.LEADS} variant="outline">{Q.OPEN_LEADS}</Button>} subtitle={Q.SUBTITLE} title={Q.TITLE} />
      <KpiStrip items={[
        [Q.KPI.OPEN, formatNumber(all.filter((r) => ["sourcing", "awaiting", "quoted"].includes(r.stage)).length)],
        [Q.KPI.SOURCING, formatNumber(count("sourcing")), count("sourcing") ? "danger" : undefined],
        [Q.KPI.AWAITING, formatNumber(count("awaiting"))],
        [Q.KPI.QUOTED, formatNumber(count("quoted"))],
        [Q.KPI.AWARDED, formatNumber(count("awarded"))],
        [Q.KPI.VIEW_RATE, sent ? `${Math.round((viewed / sent) * 100)}%` : "—"],
      ]} />

      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Tabs onChange={setStage} tabs={STAGES.map((s) => ({ count: s === "all" ? all.length : count(s), label: s === "all" ? EN.COMMON.ALL : Q.STAGE[s], value: s }))} value={stage} />
          <SearchInput className="w-full sm:w-72" onChange={setQuery} placeholder={Q.SEARCH} value={query} />
        </div>
        <DataTable
          columns={[
            { header: Q.REQUEST, key: "title", render: (r) => (
              <div className="min-w-0 max-w-xs">
                <p className="font-medium text-ink">{r.title}</p>
                <p className="text-xs text-muted">{r.categoryName} · {Q.POSTED} {formatDate(r.createdAt)}</p>
              </div>
            ) },
            { header: Q.BUYER, key: "buyer", render: (r) => <div><p className="font-medium">{r.buyer.name}</p><p className="text-xs text-muted">{r.buyer.businessName ? `${r.buyer.businessName} · ` : ""}{r.deliveryCity}</p></div> },
            { align: "right", header: Q.QUANTITY, key: "quantity", render: (r) => `${formatNumber(r.quantity)} ${r.unit}` },
            { align: "right", header: Q.TARGET, key: "targetPrice", render: (r) => (r.targetPrice ? formatCurrency(r.targetPrice) : "—") },
            { header: Q.DEADLINE, key: "deadline", render: (r) => formatDate(r.deadline) },
            { header: Q.PROGRESS, key: "progress", render: (r) => <span className="tabular whitespace-nowrap">{r.stats.sent} · {r.stats.viewed} · {r.stats.quoted}</span> },
            { header: Q.STATUS, key: "stage", render: (r) => <Badge tone={STAGE_TONE[r.stage]}>{Q.STAGE[r.stage]}</Badge> },
          ]}
          empty={Q.EMPTY}
          onRowClick={(r) => setOpenId(r.id)}
          rows={rows}
        />
      </Panel>

      <Drawer onClose={() => setOpenId(null)} open={Boolean(active)} side="right" size="lg" title={active?.title ?? ""}>
        {active && <RequestDetail actor={actor} key={active.id} onChanged={load} request={active} stores={data.stores} />}
      </Drawer>
    </div>
  );
}

function RequestDetail({ actor, onChanged, request: r, stores }) {
  const [picked, setPicked] = useState([]);
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const sentSlugs = new Set(r.dispatches.map((d) => d.storeSlug));
  const isOpen = ["sourcing", "awaiting", "quoted"].includes(r.stage);
  const visible = stores.filter((s) => `${s.name} ${s.city}`.toLowerCase().includes(search.toLowerCase()));
  const suggested = visible.filter((s) => r.suggested.includes(s.slug));
  const others = visible.filter((s) => !r.suggested.includes(s.slug));
  const toggle = (slug) => setPicked((p) => (p.includes(slug) ? p.filter((x) => x !== slug) : [...p, slug]));

  const forward = async (slugs) => {
    setBusy(true);
    try {
      const { count } = await adminForwardRfq(r.id, slugs, note, actor);
      successToast(Q.FORWARDED(count));
      setPicked([]); setNote("");
      await onChanged();
    } catch (err) { errorToast(getErrorMessage(err)); } finally { setBusy(false); }
  };
  const close = async () => {
    try { await adminUpdateRfq(r.id, { status: "closed" }, actor); successToast(Q.CLOSED_TOAST); await onChanged(); } catch (err) { errorToast(getErrorMessage(err)); }
  };
  const storeRow = (s) => (
    <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-50", picked.includes(s.slug) && "bg-brand-50")} key={s.slug}>
      <input checked={picked.includes(s.slug)} className="size-4 accent-brand-600" onChange={() => toggle(s.slug)} type="checkbox" />
      <span className="flex-1">{s.name} <span className="text-xs text-muted">· {s.city}</span></span>
      {sentSlugs.has(s.slug) && <Badge tone="neutral">{Q.SENT_AT}</Badge>}
    </label>
  );

  return (
    <div className="space-y-5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STAGE_TONE[r.stage]}>{Q.STAGE[r.stage]}</Badge>
        <span className="text-sm text-muted">{r.rootName ? `${r.rootName} › ` : ""}{r.categoryName}</span>
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-muted">{Q.QUANTITY}</dt><dd className="font-semibold tabular">{formatNumber(r.quantity)} {r.unit}</dd></div>
        <div><dt className="text-xs text-muted">{Q.TARGET}</dt><dd className="font-semibold tabular">{r.targetPrice ? `${formatCurrency(r.targetPrice)}/${r.unit}` : "—"}</dd></div>
        <div><dt className="text-xs text-muted">{Q.DELIVERY}</dt><dd className="font-semibold">{r.deliveryCity}</dd></div>
        <div><dt className="text-xs text-muted">{Q.DEADLINE}</dt><dd className="font-semibold">{formatDate(r.deadline)}</dd></div>
      </dl>

      <section>
        <h3 className="mb-1 text-sm font-semibold">{Q.DETAILS}</h3>
        <p className="whitespace-pre-line text-sm text-ink/90">{r.details}</p>
      </section>

      <section className="rounded-xl border border-line p-4 text-sm">
        <h3 className="mb-2 font-semibold">{Q.BUYER_CONTACT}</h3>
        <p className="font-medium">{r.buyer.name}{r.buyer.businessName ? ` · ${r.buyer.businessName}` : ""}</p>
        <ul className="mt-1 space-y-0.5 text-muted">
          {r.buyer.email && <li className="flex items-center gap-2"><Mail aria-hidden className="size-4" />{r.buyer.email}</li>}
          {r.buyer.phone && <li className="flex items-center gap-2"><Phone aria-hidden className="size-4" />{r.buyer.phone}</li>}
          <li className="flex items-center gap-2"><MapPin aria-hidden className="size-4" />{r.buyer.city || r.deliveryCity}</li>
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">{Q.SELLERS} ({r.dispatches.length})</h3>
        {r.dispatches.length === 0 ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{Q.NO_SUGGESTED}</p> : (
          <ul className="divide-y divide-line rounded-xl border border-line text-sm">
            {r.dispatches.map((d) => (
              <li className="grid gap-1 px-4 py-3 sm:grid-cols-[1fr_auto]" key={d.storeSlug}>
                <div>
                  <p className="font-medium">{d.storeName}</p>
                  <p className="text-xs text-muted">{Q.SENT_BY(d.by)} · {formatDateTime(d.at)}</p>
                  {d.note && <p className="mt-1 text-xs text-sky-800">“{d.note}”</p>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                  {d.viewedAt ? <Badge tone="info"><Eye aria-hidden className="size-3.5" />{Q.VIEWED}</Badge> : <Badge tone="neutral"><EyeOff aria-hidden className="size-3.5" />{Q.NOT_VIEWED}</Badge>}
                  {d.quote ? <Badge tone={d.quote.status === "accepted" ? "success" : d.quote.status === "rejected" ? "neutral" : "brand"}><CheckCircle2 aria-hidden className="size-3.5" />{Q.QUOTE} {formatCurrency(d.quote.pricePerUnit)}/{r.unit}</Badge> : <Badge tone="warning">{Q.NO_QUOTE}</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOpen && (
        <section className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
          <h3 className="flex items-center gap-2 font-semibold"><Forward aria-hidden className="size-4" />{Q.FORWARD}</h3>
          <p className="mt-1 text-xs text-muted">{Q.FORWARD_HINT}</p>
          <SearchInput className="mt-3" onChange={setSearch} placeholder={Q.SEARCH_SELLERS} value={search} />
          <div className="mt-3 max-h-64 overflow-y-auto rounded-lg bg-white ring-1 ring-line">
            {suggested.length > 0 && <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{Q.SUGGESTED}</p>}
            {suggested.map(storeRow)}
            {others.length > 0 && <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{Q.OTHER_SELLERS}</p>}
            {others.map(storeRow)}
          </div>
          <FormTextarea className="mt-3" label={Q.FORWARD_NOTE} name="forward-note" onChange={(e) => setNote(e.target.value)} rows={2} value={note} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={!picked.length} loading={busy} onClick={() => forward(picked)}><Send aria-hidden className="size-4" />{Q.FORWARD_SEND(picked.length)}</Button>
            {r.suggested.some((slug) => !sentSlugs.has(slug)) && <Button disabled={busy} onClick={() => forward(r.suggested.filter((slug) => !sentSlugs.has(slug)))} variant="outline">{Q.ALL_MATCHING}</Button>}
          </div>
        </section>
      )}

      {isOpen && <Button onClick={close} variant="ghost"><XCircle aria-hidden className="size-4" />{Q.CLOSE}</Button>}
    </div>
  );
}
