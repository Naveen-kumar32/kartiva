import { Bike, Building2, Crown, Inbox, Lock, Mail, MapPin, MessageSquareReply, Phone, ShieldAlert, StickyNote } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { addLeadNote, getSellerLeads, replyToLead, updateLeadStatus } from "@/api";
import {
  Badge, Button, Drawer, EmptyState, ErrorState, ExportMenu, KeyValue, MiniStat, PageHeader, PageLoader, Panel, SearchInput, SmartImage, Tabs,
} from "@/components";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { cn, errorToast, formatDateTime, formatNumber, formatPercent, getErrorMessage, successToast } from "@/utils";

const P = EN.SELLER_PRO;
const L = P.LEADS;
const TABS = ["all", "new", "contacted", "quoted", "won", "lost", "spam"];
const PIPELINE = ["new", "contacted", "quoted", "won", "lost"];
const LEAD_TONE = { contacted: "warning", lost: "neutral", new: "info", quoted: "brand", spam: "danger", won: "success" };

function LeadStatusBadge({ status }) {
  return <Badge tone={LEAD_TONE[status] ?? "neutral"}>{L.STATUS[status] ?? status}</Badge>;
}

export function SellerLeads() {
  useDocumentTitle(EN.SELLER.NAV_LEADS);
  const { user } = useAuth();
  const navigate = useNavigate();
  const storeSlug = user.storeSlug;
  const author = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
  const { data, error, loading, reload, setData } = useAsync(() => getSellerLeads(storeSlug), [storeSlug]);
  const [tab, setTab] = useState("all");
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);

  const leads = useMemo(() => data?.leads ?? [], [data]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => (kind === "all" || l.requirementType === kind)
      && (!q || `${l.buyer.name} ${l.buyer.city} ${l.buyer.businessName ?? ""} ${l.product?.name ?? ""} ${l.message}`.toLowerCase().includes(q)));
  }, [leads, kind, query]);
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t, filtered.filter((l) => (t === "all" ? l.status !== "spam" : l.status === t)).length])), [filtered]);
  const rows = filtered.filter((l) => (tab === "all" ? l.status !== "spam" : l.status === tab));
  const active = leads.find((l) => l.id === openId) ?? null;

  const replaceLead = (lead) => setData({ ...data, leads: data.leads.map((l) => (l.id === lead.id ? lead : l)) });
  const refresh = async () => setData(await getSellerLeads(storeSlug));

  const setStatus = async (lead, status) => {
    setBusy(status);
    try {
      await updateLeadStatus(storeSlug, lead.id, status, author);
      await refresh();
      successToast(L.STATUS_CHANGED(L.STATUS[status]));
    } catch (err) {
      errorToast(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const saveNote = async () => {
    if (!note.trim()) return;
    setBusy("note");
    try {
      replaceLead(await addLeadNote(storeSlug, active.id, note, author));
      setNote("");
      successToast(L.NOTE_ADDED);
    } catch (err) {
      errorToast(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const reply = async (lead) => {
    setBusy("reply");
    try {
      const { threadId } = await replyToLead(storeSlug, lead.id);
      navigate(`${ROUTES.SELLER.MESSAGES}?thread=${threadId}`);
    } catch (err) {
      errorToast(getErrorMessage(err));
      setBusy(null);
    }
  };
  const exportList = async (format) => {
    const { downloadTable } = await import("@/utils/documents");
    await downloadTable(format, `kartiva-leads-${storeSlug}.csv`, [
      { header: "Date", value: (l) => l.createdAt.slice(0, 10) }, { header: "Buyer", value: (l) => l.buyer.name }, { header: "Business", value: (l) => l.buyer.businessName ?? "" },
      { header: "City", value: (l) => l.buyer.city }, { header: "Phone", value: (l) => l.buyer.phone }, { header: "Email", value: (l) => l.buyer.email },
      { header: "Product", value: (l) => l.product?.name ?? L.STORE_ENQUIRY }, { header: "Quantity", value: (l) => `${l.quantity} ${l.unit}` }, { header: "Type", key: "requirementType" },
      { header: "Status", key: "status" }, { header: "Test ride", value: (l) => (l.wantsTestRide ? "Yes" : "") }, { header: "Message", key: "message" },
    ], rows, { title: EN.SELLER.NAV_LEADS });
  };

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const { kpis, plan } = data;

  return (
    <div className="space-y-6">
      <PageHeader actions={<ExportMenu disabled={!rows.length} onExport={exportList} />} subtitle={L.SUBTITLE} title={EN.SELLER.NAV_LEADS} />

      {plan === "free" && (
        <div className="flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4 ring-1 ring-amber-200 sm:flex-row sm:items-center">
          <Lock aria-hidden className="hidden size-5 shrink-0 text-amber-700 sm:block" />
          <p className="min-w-0 flex-1 text-sm text-amber-900">{L.FREE_PLAN_BANNER}</p>
          <Button size="sm" to={ROUTES.SELLER.PLAN} variant="accent"><Crown className="size-4" />{L.UPGRADE_TO_VIEW}</Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MiniStat label={L.KPI_NEW} tone={kpis.newCount ? "warning" : undefined} value={formatNumber(kpis.newCount)} />
        <MiniStat label={L.KPI_IN_PROGRESS} value={formatNumber(kpis.inProgress)} />
        <MiniStat label={L.KPI_WON_MONTH} tone="success" value={formatNumber(kpis.wonThisMonth)} />
        <MiniStat label={L.KPI_CONVERSION} value={formatPercent(kpis.conversion, 0)} />
        <MiniStat className="col-span-2 lg:col-span-1" label={L.KPI_RESPONSE} value={P.COMMON.HOURS(kpis.avgResponseHours)} />
      </div>

      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SearchInput className="w-full sm:w-80" onChange={setQuery} placeholder={L.SEARCH} value={query} />
          <div aria-label={L.REQUIREMENT_TYPE} className="flex rounded-lg bg-slate-100 p-0.5 text-sm" role="group">
            {["all", "retail", "bulk"].map((k) => (
              <button aria-pressed={kind === k} className={cn("rounded-md px-3 py-1.5 font-medium", kind === k ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")} key={k} onClick={() => setKind(k)} type="button">{L.KIND[k]}</button>
            ))}
          </div>
        </div>
        <Tabs onChange={setTab} tabs={TABS.map((t) => ({ count: counts[t], label: t === "all" ? EN.COMMON.ALL : L.STATUS[t], value: t }))} value={tab} />

        {rows.length === 0 ? (
          <div className="mt-4"><EmptyState body={leads.length ? L.EMPTY_FILTER_BODY : L.EMPTY_BODY} icon={Inbox} title={L.EMPTY} /></div>
        ) : (
          <ul className="-mx-5 divide-y divide-line">
            <li aria-hidden className="hidden grid-cols-[1.1fr_1.3fr_0.5fr_1.8fr_0.7fr] gap-4 bg-slate-50 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted lg:grid">
              <span>{EN.TABLE.BUYER}</span><span>{EN.SELLER.PRODUCT}</span><span>{L.QTY}</span><span>{L.MESSAGE}</span><span className="text-right">{EN.TABLE.STATUS}</span>
            </li>
            {rows.map((l) => (
              <li key={l.id}>
                <button className={cn("grid w-full gap-2 px-5 py-3.5 text-left text-sm hover:bg-slate-50 lg:grid-cols-[1.1fr_1.3fr_0.5fr_1.8fr_0.7fr] lg:items-center lg:gap-4", l.status === "new" && "bg-sky-50/40")} onClick={() => { setOpenId(l.id); setNote(""); }} type="button">
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-semibold">{l.status === "new" && <span aria-label={L.STATUS.new} className="size-2 shrink-0 rounded-full bg-sky-500" />}<span className="truncate">{l.buyer.name}</span></span>
                    <span className="block truncate text-xs text-muted">{[l.buyer.businessName, l.buyer.city].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-2.5">
                    {l.product ? <SmartImage alt="" className="size-9 shrink-0 rounded-md bg-slate-50 object-contain" src={l.product.thumbnail} /> : <span className="grid size-9 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-500"><Building2 aria-hidden className="size-4" /></span>}
                    <span className="line-clamp-2 min-w-0">{l.product?.name ?? <span className="text-muted">{L.STORE_ENQUIRY}</span>}</span>
                  </span>
                  <span className="tabular">
                    <b>{formatNumber(l.quantity)}</b> <span className="text-muted">{l.unit}</span>
                    {l.requirementType === "bulk" && <Badge className="ml-1.5 lg:ml-0 lg:mt-1 lg:flex lg:w-fit" tone="accent">{L.KIND.bulk}</Badge>}
                  </span>
                  <span className="line-clamp-2 text-ink/80">{l.message}</span>
                  <span className="flex flex-wrap items-center gap-1.5 lg:flex-col lg:items-end">
                    <LeadStatusBadge status={l.status} />
                    {l.wantsTestRide && <Badge tone="danger"><Bike aria-hidden className="size-3" />{L.TEST_RIDE}</Badge>}
                    <span className="text-xs text-muted">{P.COMMON.AGO(l.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Drawer onClose={() => setOpenId(null)} open={Boolean(active)} side="right" size="md" title={active ? L.DRAWER_TITLE(active.id) : ""}>
        {active && (
          <div className="space-y-5 p-5">
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-bold">{active.buyer.name}</p>
                <p className="flex items-center gap-1 text-sm text-muted"><MapPin aria-hidden className="size-3.5" />{[active.buyer.businessName, active.buyer.city].filter(Boolean).join(" · ")}</p>
              </div>
              <LeadStatusBadge status={active.status} />
            </header>

            <section className="rounded-xl bg-slate-50 p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{L.CONTACT}</h3>
              <p className="flex items-center gap-2 text-sm"><Phone aria-hidden className="size-4 text-muted" />{active.contactLocked ? <span className="font-mono">{active.buyer.phone}</span> : <a className="font-medium text-brand-700 hover:underline" href={`tel:${active.buyer.phone}`}>{active.buyer.phone}</a>}</p>
              <p className="mt-1.5 flex items-center gap-2 text-sm"><Mail aria-hidden className="size-4 text-muted" />{active.contactLocked ? <span className="font-mono">{active.buyer.email}</span> : <a className="font-medium text-brand-700 hover:underline" href={`mailto:${active.buyer.email}`}>{active.buyer.email}</a>}</p>
              {active.contactLocked && (
                <Link className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:underline" to={ROUTES.SELLER.PLAN}><Lock aria-hidden className="size-3.5" />{L.UPGRADE_TO_VIEW}</Link>
              )}
            </section>

            <KeyValue
              items={[
                [EN.SELLER.PRODUCT, active.product?.name ?? L.STORE_ENQUIRY],
                [L.QTY, `${formatNumber(active.quantity)} ${active.unit}`],
                [L.REQUIREMENT_TYPE, L.KIND[active.requirementType]],
                active.wantsTestRide && [L.TEST_RIDE, L.TEST_RIDE_YES],
                [L.RECEIVED, formatDateTime(active.createdAt)],
                [L.RESPONSE_TIME, active.responseHours == null ? L.NOT_RESPONDED : P.COMMON.HOURS(active.responseHours)],
              ]}
            />
            <blockquote className="rounded-xl border-l-4 border-brand-500 bg-brand-50/50 px-4 py-3 text-sm text-ink/90">“{active.message}”</blockquote>

            <section>
              <h3 className="mb-2 text-sm font-semibold">{L.PIPELINE}</h3>
              <div className="flex flex-wrap gap-1.5">
                {PIPELINE.map((s) => (
                  <Button disabled={active.status === s || busy != null} key={s} loading={busy === s} onClick={() => setStatus(active, s)} size="sm" variant={active.status === s ? "primary" : "outline"}>{L.STATUS[s]}</Button>
                ))}
              </div>
            </section>

            <div className="flex flex-wrap gap-2 border-y border-line py-4">
              <Button disabled={active.status === "spam" || (busy != null && busy !== "reply")} loading={busy === "reply"} onClick={() => reply(active)}><MessageSquareReply className="size-4" />{active.threadId ? L.OPEN_CONVERSATION : L.REPLY}</Button>
              {active.status !== "spam" && <Button disabled={busy != null} onClick={() => setStatus(active, "spam")} variant="ghost"><ShieldAlert className="size-4 text-red-600" />{L.MARK_SPAM}</Button>}
              {active.status === "spam" && <Button disabled={busy != null} onClick={() => setStatus(active, "new")} variant="ghost">{L.NOT_SPAM}</Button>}
            </div>

            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><StickyNote aria-hidden className="size-4 text-muted" />{L.NOTES}</h3>
              {(active.notes ?? []).length === 0 ? <p className="text-sm text-muted">{L.NO_NOTES}</p> : (
                <ul className="space-y-2">
                  {active.notes.map((n, i) => (
                    <li className="rounded-lg bg-amber-50/70 px-3 py-2 text-sm ring-1 ring-amber-100" key={`${n.at}-${i}`}>
                      <p>{n.text}</p>
                      <p className="mt-1 text-xs text-muted">{n.author} · {formatDateTime(n.at)}</p>
                    </li>
                  ))}
                </ul>
              )}
              <label className="mt-3 block text-sm font-medium" htmlFor="lead-note">{L.ADD_NOTE}</label>
              <textarea className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" id="lead-note" maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder={L.NOTE_PLACEHOLDER} rows={2} value={note} />
              <Button className="mt-2" disabled={!note.trim()} loading={busy === "note"} onClick={saveNote} size="sm" variant="subtle">{L.SAVE_NOTE}</Button>
            </section>
          </div>
        )}
      </Drawer>
    </div>
  );
}
