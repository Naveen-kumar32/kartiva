import { ArrowRightLeft, BellRing, Ban, ClipboardList, Eye, Inbox as InboxIcon, Lock, RotateCcw, Star } from "lucide-react";
import { useMemo, useState } from "react";

import { adminNotifyRfqSellers, adminReassignEnquiry, adminSetEnquirySpam, adminUpdateRfq, getAdminLeads, getAdminThread } from "@/api";
import {
  Badge, Button, DataTable, Drawer, EmptyState, ErrorState, FormSelect, KeyValue, Modal, PageHeader, PageLoader, Panel, SearchInput, Tabs, Toggle, VerifiedBadges,
} from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { cn, errorToast, formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent, getErrorMessage, infoToast, successToast } from "@/utils";

import { DrawerSection, FilterBar, FilterSelect, IconAction, KpiStrip, Pill, SrHeader } from "./opsShared";
import { timeAgo, useActor } from "./opsUtils";

const P = EN.ADMIN_PRO.LEADS;
const C = EN.ADMIN_PRO.COMMON;
const LEAD_TONE = { contacted: "warning", lost: "neutral", new: "info", quoted: "brand", spam: "danger", won: "success" };
const RFQ_TONE = { awarded: "success", closed: "neutral", open: "info" };
const QUOTE_TONE = { accepted: "success", rejected: "danger", submitted: "info" };

export function AdminLeads() {
  useDocumentTitle(P.TITLE);
  const actor = useActor();
  const { data, error, loading, reload, setData } = useAsync(getAdminLeads, []);
  const [tab, setTab] = useState("enquiries");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState({ source: "", status: "", store: "" });
  const [viewLead, setViewLead] = useState(null);
  const [viewRfqId, setViewRfqId] = useState(null);
  const [reassign, setReassign] = useState(null);
  const [busy, setBusy] = useState(null);

  const term = q.trim().toLowerCase();
  const enquiries = useMemo(() => (data?.enquiries ?? []).filter((e) => (!filters.store || e.storeSlug === filters.store)
    && (!filters.status || e.status === filters.status) && (!filters.source || e.source === filters.source)
    && (!term || [e.buyer.name, e.productName, e.storeName, e.message, e.buyer.city].some((x) => x?.toLowerCase().includes(term)))), [data, filters, term]);
  const rfqs = useMemo(() => (data?.rfqs ?? []).filter((r) => (!filters.status || r.status === filters.status)
    && (!term || [r.title, r.buyer.name, r.categoryName, r.deliveryCity].some((x) => x?.toLowerCase().includes(term)))), [data, filters, term]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const refresh = async () => setData(await getAdminLeads());
  const act = async (key, fn, message, toast = successToast) => {
    setBusy(key);
    try {
      const result = await fn();
      await refresh();
      toast(typeof message === "function" ? message(result) : message);
      return true;
    } catch (err) {
      errorToast(getErrorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  };
  const setFilter = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));
  const switchTab = (t) => { setTab(t); setFilters({ source: "", status: "", store: "" }); };
  const { kpis } = data;
  const viewRfq = data.rfqs.find((r) => r.id === viewRfqId);
  const filtered = Boolean(filters.store || filters.status || filters.source || term);

  return (
    <div className="space-y-6">
      <PageHeader subtitle={P.SUBTITLE} title={P.TITLE} />
      <KpiStrip items={[
        [P.KPI_TODAY, formatNumber(kpis.leadsToday)],
        [P.KPI_7D, formatNumber(kpis.leads7d)],
        [P.KPI_RESPONSE, kpis.avgResponseHours == null ? "—" : C.HOURS(kpis.avgResponseHours.toFixed(1))],
        [P.KPI_OPEN_RFQS, formatNumber(kpis.openRfqs)],
        [P.KPI_QUOTE_RATE, formatPercent(kpis.quoteRate, 0), "success"],
        [P.KPI_AWARDED, formatCurrency(kpis.awardedValue)],
      ]} />
      <Panel>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{P.BY_STATUS}</p>
        <div className="flex flex-wrap gap-2">
          {Object.keys(LEAD_TONE).map((s) => (
            <button
              aria-pressed={filters.status === s && tab === "enquiries"}
              className={cn("rounded-full transition", filters.status === s && tab === "enquiries" && "ring-2 ring-brand-500 ring-offset-1")}
              key={s}
              onClick={() => { setTab("enquiries"); setFilters((f) => ({ ...f, status: f.status === s ? "" : s })); }}
              type="button"
            >
              <Pill tone={LEAD_TONE[s]}>{P.STATUS[s]} · {kpis.byStatus[s] ?? 0}</Pill>
            </button>
          ))}
        </div>
      </Panel>

      <Panel>
        <Tabs onChange={switchTab} tabs={[{ count: data.enquiries.length, label: P.TAB_ENQUIRIES, value: "enquiries" }, { count: data.rfqs.length, label: P.TAB_RFQS, value: "rfqs" }]} value={tab} />
        <div className="mt-4">
          <FilterBar>
            <SearchInput className="w-full sm:w-72" onChange={setQ} placeholder={tab === "enquiries" ? P.SEARCH_LEADS : P.SEARCH_RFQS} value={q} />
            {tab === "enquiries" ? (
              <>
                <FilterSelect label={C.ALL_STORES} onChange={setFilter("store")} options={[...new Set(data.enquiries.map((e) => e.storeSlug))].map((slug) => [slug, data.enquiries.find((e) => e.storeSlug === slug).storeName]).sort((a, b) => a[1].localeCompare(b[1]))} value={filters.store} />
                <FilterSelect label={C.ALL_STATUSES} onChange={setFilter("status")} options={Object.keys(LEAD_TONE).map((s) => [s, P.STATUS[s]])} value={filters.status} />
                <FilterSelect label={P.ALL_SOURCES} onChange={setFilter("source")} options={[["product", P.SOURCE.product], ["store", P.SOURCE.store]]} value={filters.source} />
              </>
            ) : (
              <FilterSelect label={C.ALL_STATUSES} onChange={setFilter("status")} options={Object.keys(RFQ_TONE).map((s) => [s, P.RFQ_STATUS[s]])} value={filters.status} />
            )}
            {filtered && <Button onClick={() => { setQ(""); setFilters({ source: "", status: "", store: "" }); }} size="sm" variant="ghost">{C.CLEAR_FILTERS}</Button>}
          </FilterBar>

          {tab === "enquiries" && (enquiries.length === 0 ? <EmptyState body={C.NO_MATCHES_BODY} icon={InboxIcon} title={C.NO_MATCHES} /> : (
            <DataTable
              columns={[
                { header: C.STORE, key: "storeName", render: (e) => <span className="font-medium">{e.storeName}</span> },
                { header: C.BUYER, key: "buyer", render: (e) => <><span className="font-medium">{e.buyer.name}</span><span className="block text-xs text-muted">{[e.buyer.businessName, e.buyer.city].filter(Boolean).join(" · ")}</span></> },
                { header: P.COL_PRODUCT, key: "productName", render: (e) => <span className="block max-w-64"><span className="line-clamp-1">{e.productName ?? P.STORE_ENQUIRY}</span><span className="line-clamp-1 text-xs text-muted">{e.message}</span></span> },
                { align: "right", header: P.COL_QTY, key: "quantity", render: (e) => <span className="whitespace-nowrap">{formatNumber(e.quantity)} {e.unit}</span> },
                { header: C.STATUS, key: "status", render: (e) => <Pill tone={LEAD_TONE[e.status]}>{P.STATUS[e.status] ?? e.status}</Pill> },
                { header: P.COL_AGE, key: "createdAt", render: (e) => <span className="whitespace-nowrap text-xs text-muted" title={formatDateTime(e.createdAt)}>{timeAgo(e.createdAt)}</span> },
                { header: <SrHeader>{C.ACTIONS}</SrHeader>, key: "actions", render: (e) => (
                  <span className="flex justify-end gap-0.5">
                    <IconAction icon={Eye} label={P.VIEW_LEAD(e.buyer.name)} onClick={() => setViewLead(e)} />
                    <IconAction disabled={e.status === "spam"} icon={ArrowRightLeft} label={P.REASSIGN} onClick={() => setReassign(e)} />
                    {e.status === "spam"
                      ? <IconAction icon={RotateCcw} label={P.RESTORE} onClick={() => act(`s-${e.id}`, () => adminSetEnquirySpam(e.id, false, actor), P.RESTORED, infoToast)} />
                      : <IconAction danger icon={Ban} label={P.MARK_SPAM} onClick={() => act(`s-${e.id}`, () => adminSetEnquirySpam(e.id, true, actor), P.MARKED_SPAM, infoToast)} />}
                  </span>
                ) },
              ]}
              rows={enquiries}
            />
          ))}

          {tab === "rfqs" && (rfqs.length === 0 ? <EmptyState body={C.NO_MATCHES_BODY} icon={ClipboardList} title={C.NO_MATCHES} /> : (
            <DataTable
              columns={[
                { header: P.COL_RFQ, key: "title", render: (r) => (
                  <button className="block max-w-72 text-left" onClick={() => setViewRfqId(r.id)} type="button">
                    <span className="flex items-center gap-1 font-medium hover:text-brand-700">{r.featured && <Star aria-label={P.FEATURED} className="size-3.5 shrink-0 fill-amber-400 text-amber-500" />}<span className="line-clamp-1">{r.title}</span></span>
                    <span className="text-xs text-muted">{r.deliveryCity} · {P.DEADLINE(formatDate(r.deadline))}</span>
                  </button>
                ) },
                { header: C.BUYER, key: "buyer", render: (r) => <><span>{r.buyer.name}</span>{r.buyer.businessName && <span className="block text-xs text-muted">{r.buyer.businessName}</span>}</> },
                { header: C.CATEGORY, key: "categoryName" },
                { align: "right", header: P.COL_QTY, key: "quantity", render: (r) => <span className="whitespace-nowrap">{formatNumber(r.quantity)} {r.unit}</span> },
                { align: "right", header: P.COL_TARGET, key: "targetPrice", render: (r) => (r.targetPrice ? formatCurrency(r.targetPrice) : "—") },
                { align: "right", header: P.COL_QUOTES, key: "quotes", render: (r) => <span className={cn("font-semibold", !r.quotes.length && "text-amber-700")}>{r.quotes.length}</span> },
                { header: C.STATUS, key: "status", render: (r) => <Pill tone={RFQ_TONE[r.status]}>{P.RFQ_STATUS[r.status] ?? r.status}</Pill> },
                { header: <SrHeader>{C.ACTIONS}</SrHeader>, key: "actions", render: (r) => <span className="flex justify-end"><Button onClick={() => setViewRfqId(r.id)} size="sm" variant="outline">{P.COMPARE_QUOTES}</Button></span> },
              ]}
              rows={rfqs}
            />
          ))}
        </div>
      </Panel>

      <Drawer onClose={() => setViewLead(null)} open={Boolean(viewLead)} side="right" size="md" title={viewLead ? P.LEAD_TITLE(viewLead.id) : ""}>
        {viewLead && <LeadDetail lead={viewLead} />}
      </Drawer>

      <Drawer onClose={() => setViewRfqId(null)} open={Boolean(viewRfq)} side="right" size="lg" title={viewRfq?.title ?? ""}>
        {viewRfq && (
          <RfqDetail
            busy={busy}
            onClose={() => act("close", () => adminUpdateRfq(viewRfq.id, { status: "closed" }, actor), P.RFQ_CLOSED, infoToast)}
            onFeature={(on) => act("feature", () => adminUpdateRfq(viewRfq.id, { featured: on }, actor), on ? P.RFQ_FEATURED : P.RFQ_UNFEATURED, infoToast)}
            onNotify={() => act("notify", () => adminNotifyRfqSellers(viewRfq.id, actor), (r) => P.SELLERS_NOTIFIED(r.count))}
            rfq={viewRfq}
          />
        )}
      </Drawer>

      {reassign && (
        <ReassignModal
          key={reassign.id}
          lead={reassign}
          loading={busy === "reassign"}
          onCancel={() => setReassign(null)}
          onConfirm={async (slug) => {
            const ok = await act("reassign", () => adminReassignEnquiry(reassign.id, slug, actor), P.REASSIGNED(data.stores.find((s) => s.slug === slug)?.name));
            if (ok) setReassign(null);
          }}
          stores={data.stores}
        />
      )}
    </div>
  );
}

function LeadDetail({ lead }) {
  const { data: thread, loading } = useAsync(() => (lead.threadId ? getAdminThread(lead.threadId) : Promise.resolve(null)), [lead.threadId]);
  return (
    <div className="space-y-5 p-4">
      <div className="flex flex-wrap items-center gap-2"><Pill tone={LEAD_TONE[lead.status]}>{P.STATUS[lead.status]}</Pill>{lead.wantsTestRide && <Badge tone="accent">{P.TEST_RIDE}</Badge>}<Badge>{P.SOURCE[lead.source] ?? lead.source}</Badge></div>
      <KeyValue items={[
        [C.STORE, lead.storeName], [C.BUYER, lead.buyer.name], [P.BUSINESS, lead.buyer.businessName], [P.CITY, lead.buyer.city], [P.EMAIL, lead.buyer.email], [P.PHONE, lead.buyer.phone],
        [P.COL_PRODUCT, lead.productName ?? P.STORE_ENQUIRY], [P.COL_QTY, `${formatNumber(lead.quantity)} ${lead.unit} · ${P.REQ_TYPE[lead.requirementType] ?? lead.requirementType}`],
        [P.RECEIVED, formatDateTime(lead.createdAt)], [P.FIRST_REPLY, lead.replyHours == null ? P.NO_REPLY : C.HOURS(lead.replyHours.toFixed(1))],
      ]} />
      <DrawerSection title={P.MESSAGE}><p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm">{lead.message}</p></DrawerSection>
      {lead.notes?.length > 0 && (
        <DrawerSection title={P.SELLER_NOTES}>
          <ul className="space-y-2 text-sm">{lead.notes.map((n) => <li className="rounded-lg bg-amber-50 p-3" key={n.at}><p>{n.text}</p><p className="mt-1 text-xs text-muted">{n.author} · {formatDateTime(n.at)}</p></li>)}</ul>
        </DrawerSection>
      )}
      <DrawerSection action={<span className="flex items-center gap-1 text-xs text-muted"><Lock aria-hidden className="size-3.5" />{P.READ_ONLY}</span>} title={P.CONVERSATION}>
        {!lead.threadId ? <p className="text-sm text-muted">{P.NO_THREAD}</p> : loading || !thread ? <p className="text-sm text-muted">{EN.COMMON.LOADING}</p> : (
          <ol className="space-y-2">
            {thread.messages.map((m) => (
              <li className={cn("max-w-[85%] rounded-xl px-3 py-2 text-sm", m.from === "buyer" ? "bg-slate-100" : "ml-auto bg-brand-50 text-brand-900")} key={m.id}>
                <p className="text-xs font-semibold">{m.from === "buyer" ? thread.buyer.name : thread.storeName}</p>
                <p className="whitespace-pre-line">{m.body}</p>
                <p className="mt-1 text-[11px] text-muted">{formatDateTime(m.at)}</p>
              </li>
            ))}
          </ol>
        )}
      </DrawerSection>
    </div>
  );
}

function RfqDetail({ busy, onClose, onFeature, onNotify, rfq }) {
  const lowest = rfq.quotes.length ? Math.min(...rfq.quotes.map((q) => q.pricePerUnit)) : null;
  return (
    <div className="space-y-5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={RFQ_TONE[rfq.status]}>{P.RFQ_STATUS[rfq.status]}</Pill>
        <span className="text-xs text-muted">{P.POSTED(timeAgo(rfq.createdAt))}</span>
      </div>
      <KeyValue items={[
        [C.BUYER, `${rfq.buyer.name}${rfq.buyer.businessName ? ` · ${rfq.buyer.businessName}` : ""}`], [C.CATEGORY, rfq.categoryName], [P.COL_QTY, `${formatNumber(rfq.quantity)} ${rfq.unit}`],
        [P.COL_TARGET, rfq.targetPrice ? `${formatCurrency(rfq.targetPrice)} / ${rfq.unit}` : "—"], [P.DELIVERY_CITY, rfq.deliveryCity], [P.DEADLINE_LABEL, formatDate(rfq.deadline)],
        rfq.notifiedAt && [P.LAST_NOTIFIED, formatDateTime(rfq.notifiedAt)],
      ]} />
      <DrawerSection title={P.REQUIREMENT}><p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm">{rfq.details}</p></DrawerSection>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3">
        <span className="flex items-center gap-2 text-sm font-medium"><Toggle checked={Boolean(rfq.featured)} label={P.FEATURE_RFQ} onChange={onFeature} />{P.FEATURE_RFQ}</span>
        <span className="ml-auto flex flex-wrap gap-2">
          <Button disabled={rfq.status !== "open"} loading={busy === "notify"} onClick={onNotify} size="sm" variant="subtle"><BellRing className="size-4" />{P.NOTIFY_SELLERS}</Button>
          <Button disabled={rfq.status !== "open"} loading={busy === "close"} onClick={onClose} size="sm" variant="outline">{P.CLOSE_RFQ}</Button>
        </span>
      </div>
      <DrawerSection title={P.QUOTES_COUNT(rfq.quotes.length)}>
        {rfq.quotes.length === 0 ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{P.NO_QUOTES}</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {[...rfq.quotes].sort((a, b) => a.pricePerUnit - b.pricePerUnit).map((q) => (
              <article className={cn("rounded-xl border p-4", q.pricePerUnit === lowest ? "border-emerald-300 bg-emerald-50/40" : "border-line")} key={q.id}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{q.store.name}</p>
                  <Pill tone={QUOTE_TONE[q.status]}>{P.QUOTE_STATUS[q.status] ?? q.status}</Pill>
                </div>
                <VerifiedBadges className="mt-1" compact store={q.store} />
                <p className="mt-3 text-xl font-bold tabular">{formatCurrency(q.pricePerUnit)}<span className="text-xs font-normal text-muted"> / {rfq.unit}</span></p>
                {q.pricePerUnit === lowest && rfq.quotes.length > 1 && <p className="text-xs font-semibold text-emerald-700">{P.LOWEST}</p>}
                <dl className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between gap-2"><dt className="text-muted">{P.QUOTE_TOTAL}</dt><dd className="tabular">{formatCurrency(q.pricePerUnit * rfq.quantity)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted">{P.LEAD_TIME}</dt><dd>{P.DAYS(q.leadTimeDays)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted">{P.VS_TARGET}</dt><dd className="tabular">{rfq.targetPrice ? formatPercent(((q.pricePerUnit - rfq.targetPrice) / rfq.targetPrice) * 100, 1) : "—"}</dd></div>
                </dl>
                {q.note && <p className="mt-2 text-xs text-muted">{q.note}</p>}
              </article>
            ))}
          </div>
        )}
      </DrawerSection>
    </div>
  );
}

function ReassignModal({ lead, loading, onCancel, onConfirm, stores }) {
  const [slug, setSlug] = useState("");
  return (
    <Modal onClose={onCancel} open title={P.REASSIGN}>
      <p className="mb-3 text-sm text-muted">{P.REASSIGN_BODY(lead.buyer.name, lead.storeName)}</p>
      <FormSelect label={P.NEW_STORE} name="reassignStore" onChange={(e) => setSlug(e.target.value)} options={stores.filter((s) => s.slug !== lead.storeSlug).map((s) => ({ label: s.name, value: s.slug }))} placeholder={EN.COMMON.SELECT} value={slug} />
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onCancel} variant="ghost">{C.CANCEL}</Button>
        <Button disabled={!slug} loading={loading} onClick={() => onConfirm(slug)}><ArrowRightLeft className="size-4" />{P.REASSIGN}</Button>
      </div>
    </Modal>
  );
}
