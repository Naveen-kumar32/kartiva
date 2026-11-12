import { AlarmClock, LifeBuoy, Lock, Send, StickyNote } from "lucide-react";
import { useMemo, useState } from "react";

import { addTicketNote, adminReplyTicket, adminUpdateTicket, getAdminTickets } from "@/api";
import {
  Badge, Button, DataTable, Drawer, EmptyState, ErrorState, FormSelect, FormTextarea, KeyValue, PageHeader, PageLoader, Panel, SearchInput, Select, Tabs,
} from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { cn, errorToast, formatDateTime, formatNumber, getErrorMessage, successToast } from "@/utils";

import { DrawerSection, FilterBar, FilterSelect, KpiStrip, Pill } from "./opsShared";
import { timeAgo, useActor } from "./opsUtils";

const P = EN.ADMIN_PRO.SUPPORT;
const C = EN.ADMIN_PRO.COMMON;
const STATUS_TONE = { closed: "neutral", in_progress: "info", open: "warning", resolved: "success" };
const PRIORITY_TONE = { high: "danger", low: "neutral", medium: "info", urgent: "danger" };
const STATUSES = ["open", "in_progress", "resolved", "closed"];
const PRIORITIES = ["urgent", "high", "medium", "low"];

function SlaChip({ ticket, now }) {
  if (!["open", "in_progress"].includes(ticket.status)) return <span className="text-xs text-muted">—</span>;
  const left = (new Date(ticket.slaDueAt).getTime() - now) / 3_600_000;
  if (left < 0) return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200"><AlarmClock aria-hidden className="size-3.5" />{P.OVERDUE(formatHours(-left))}</span>;
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", left < 2 ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-slate-50 text-slate-700 ring-slate-200")}><AlarmClock aria-hidden className="size-3.5" />{P.DUE_IN(formatHours(left))}</span>;
}
const formatHours = (h) => (h >= 48 ? P.DAYS(Math.round(h / 24)) : h >= 1 ? P.HRS(Math.round(h)) : P.MINS(Math.max(1, Math.round(h * 60))));

export function AdminSupport() {
  useDocumentTitle(P.TITLE);
  const actor = useActor();
  const { data, error, loading, reload, setData } = useAsync(getAdminTickets, []);
  const [tab, setTab] = useState("active");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState({ assignee: "", category: "", priority: "", role: "" });
  const [viewId, setViewId] = useState(null);
  const [now] = useState(() => Date.now());

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.tickets ?? []).filter((t) => (tab === "all" || (tab === "active" ? ["open", "in_progress"].includes(t.status) : tab === "overdue" ? t.overdue : t.status === tab))
      && (!filters.role || t.raisedBy.role === filters.role) && (!filters.priority || t.priority === filters.priority) && (!filters.category || t.category === filters.category)
      && (!filters.assignee || (filters.assignee === "_none" ? !t.assignee : t.assignee === filters.assignee))
      && (!term || [t.number, t.subject, t.raisedBy.name, t.storeName].some((x) => x?.toLowerCase().includes(term))));
  }, [data, tab, filters, q]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const refresh = async () => setData(await getAdminTickets());
  const { kpis } = data;
  const viewing = data.tickets.find((t) => t.id === viewId);
  const setFilter = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));
  const tabCount = (k) => data.tickets.filter((t) => (k === "all" ? true : k === "active" ? ["open", "in_progress"].includes(t.status) : k === "overdue" ? t.overdue : t.status === k)).length;

  return (
    <div className="space-y-6">
      <PageHeader subtitle={P.SUBTITLE} title={P.TITLE} />
      <KpiStrip className="xl:grid-cols-4" items={[
        [P.KPI_OPEN, formatNumber(kpis.open)],
        [P.KPI_OVERDUE, formatNumber(kpis.overdue), kpis.overdue ? "danger" : "success"],
        [P.KPI_FIRST_RESPONSE, kpis.avgFirstResponseHours == null ? "—" : C.HOURS(kpis.avgFirstResponseHours.toFixed(1))],
        [P.KPI_RESOLVED, formatNumber(kpis.resolvedWeek), "success"],
      ]} />
      <Panel>
        <Tabs onChange={setTab} tabs={["active", "overdue", ...STATUSES, "all"].map((k) => ({ count: tabCount(k), label: P.TAB[k], value: k }))} value={tab} />
        <div className="mt-4">
          <FilterBar>
            <SearchInput className="w-full sm:w-64" onChange={setQ} placeholder={P.SEARCH} value={q} />
            <FilterSelect label={P.ALL_REQUESTERS} onChange={setFilter("role")} options={[["buyer", P.ROLE.buyer], ["seller", P.ROLE.seller]]} value={filters.role} />
            <FilterSelect label={P.ALL_PRIORITIES} onChange={setFilter("priority")} options={PRIORITIES.map((p) => [p, P.PRIORITY[p]])} value={filters.priority} />
            <FilterSelect label={P.ALL_CATEGORIES} onChange={setFilter("category")} options={Object.entries(P.CATEGORY)} value={filters.category} />
            <FilterSelect label={P.ALL_ASSIGNEES} onChange={setFilter("assignee")} options={[["_none", P.UNASSIGNED], ...data.staff.map((s) => [s.name, s.name])]} value={filters.assignee} />
          </FilterBar>
          {rows.length === 0 ? <EmptyState body={C.NO_MATCHES_BODY} icon={LifeBuoy} title={C.NO_MATCHES} /> : (
            <DataTable
              columns={[
                { header: P.COL_TICKET, key: "number", render: (t) => (
                  <span className="block max-w-72"><span className="font-mono text-xs text-muted">{t.number}</span><span className="line-clamp-1 font-medium">{t.subject}</span></span>
                ) },
                { header: P.COL_REQUESTER, key: "raisedBy", render: (t) => <>{t.raisedBy.name}<span className="block text-xs text-muted">{P.ROLE[t.raisedBy.role]}{t.storeName ? ` · ${t.storeName}` : ""}</span></> },
                { header: C.CATEGORY, key: "category", render: (t) => P.CATEGORY[t.category] ?? t.category },
                { header: P.COL_PRIORITY, key: "priority", render: (t) => <Pill tone={PRIORITY_TONE[t.priority]}>{P.PRIORITY[t.priority]}</Pill> },
                { header: C.STATUS, key: "status", render: (t) => <Pill tone={STATUS_TONE[t.status]}>{P.STATUS[t.status]}</Pill> },
                { header: P.COL_SLA, key: "slaDueAt", render: (t) => <SlaChip now={now} ticket={t} /> },
                { header: P.COL_ASSIGNEE, key: "assignee", render: (t) => t.assignee ?? <span className="text-muted">{P.UNASSIGNED}</span> },
                { header: P.COL_UPDATED, key: "updatedAt", render: (t) => <span className="whitespace-nowrap text-xs text-muted">{timeAgo(t.updatedAt)}</span> },
              ]}
              onRowClick={(t) => setViewId(t.id)}
              rows={rows}
            />
          )}
        </div>
      </Panel>

      <Drawer onClose={() => setViewId(null)} open={Boolean(viewing)} side="right" size="lg" title={viewing ? `${viewing.number} · ${viewing.subject}` : ""}>
        {viewing && <TicketDetail actor={actor} key={viewing.id} now={now} onChanged={refresh} staff={data.staff} ticket={viewing} />}
      </Drawer>
    </div>
  );
}

function TicketDetail({ actor, now, onChanged, staff, ticket }) {
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const run = async (key, fn, message) => {
    setBusy(key);
    try {
      await fn();
      await onChanged();
      if (message) successToast(message);
      return true;
    } catch (err) {
      errorToast(getErrorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  };
  const update = (patch) => run("update", () => adminUpdateTicket(ticket.id, patch, actor), P.UPDATED);
  const timeline = [
    ...ticket.messages.map((m) => ({ ...m, kind: "message" })),
    ...(ticket.internalNotes ?? []).map((n, i) => ({ ...n, from: "note", id: `n${i}`, kind: "note" })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="space-y-5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={STATUS_TONE[ticket.status]}>{P.STATUS[ticket.status]}</Pill>
        <Pill tone={PRIORITY_TONE[ticket.priority]}>{P.PRIORITY[ticket.priority]}</Pill>
        <SlaChip now={now} ticket={ticket} />
      </div>
      <KeyValue items={[
        [P.COL_REQUESTER, `${ticket.raisedBy.name} (${P.ROLE[ticket.raisedBy.role]})`], [P.EMAIL, ticket.raisedBy.email], ticket.storeName && [C.STORE, ticket.storeName],
        [C.CATEGORY, P.CATEGORY[ticket.category] ?? ticket.category], [P.OPENED, formatDateTime(ticket.createdAt)], [P.SLA_DUE, formatDateTime(ticket.slaDueAt)],
        [P.FIRST_RESPONSE, ticket.firstResponseAt ? formatDateTime(ticket.firstResponseAt) : P.NO_RESPONSE],
      ]} />
      <div className="grid gap-3 sm:grid-cols-3">
        <FormSelect disabled={busy === "update"} label={C.STATUS} name="t-status" onChange={(e) => update({ status: e.target.value })} options={STATUSES.map((s) => ({ label: P.STATUS[s], value: s }))} value={ticket.status} />
        <FormSelect disabled={busy === "update"} label={P.COL_PRIORITY} name="t-priority" onChange={(e) => update({ priority: e.target.value })} options={PRIORITIES.map((p) => ({ label: P.PRIORITY[p], value: p }))} value={ticket.priority} />
        <FormSelect disabled={busy === "update"} label={P.COL_ASSIGNEE} name="t-assignee" onChange={(e) => update({ assignee: e.target.value })} options={[{ label: P.UNASSIGNED, value: "" }, ...staff.map((s) => ({ label: `${s.name} · ${P.STAFF_ROLE[s.role] ?? s.role}`, value: s.name }))]} value={ticket.assignee ?? ""} />
      </div>

      <DrawerSection title={P.CONVERSATION}>
        <ol className="space-y-2">
          {timeline.map((m) => (
            <li className={cn("rounded-xl px-3 py-2 text-sm", m.kind === "note" ? "border border-dashed border-amber-300 bg-amber-50" : m.from === "admin" ? "ml-8 bg-brand-50 text-brand-900" : "mr-8 bg-slate-100")} key={m.id}>
              <p className="flex items-center gap-1 text-xs font-semibold">
                {m.kind === "note" && <Lock aria-hidden className="size-3" />}
                {m.kind === "note" ? P.INTERNAL_NOTE(m.author) : m.from === "admin" ? P.KARTIVA_SUPPORT(m.author) : ticket.raisedBy.name}
              </p>
              <p className="whitespace-pre-line">{m.body ?? m.text}</p>
              <p className="mt-1 text-[11px] text-muted">{formatDateTime(m.at)}</p>
            </li>
          ))}
        </ol>
      </DrawerSection>

      <DrawerSection action={<Select ariaLabel={P.CANNED} className="w-48 text-xs" onChange={(k) => { const text = P.CANNED_TEXT[k]?.(ticket.raisedBy.name.split(" ")[0]); if (text) setReply((r) => (r ? `${r}\n\n` : "") + text); }} options={Object.keys(P.CANNED_TEXT).map((k) => ({ label: P.CANNED_LABEL[k] ?? k, value: k }))} placeholder={P.CANNED} searchable={false} size="sm" value="" />} title={P.REPLY}>
        <FormTextarea label={P.REPLY_LABEL(ticket.raisedBy.name)} name="reply" onChange={(e) => setReply(e.target.value)} rows={4} value={reply} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Badge tone="info">{ticket.raisedBy.role === "seller" ? P.NOTIFY_SELLER : P.NOTIFY_BUYER}</Badge>
          <Button disabled={!reply.trim()} loading={busy === "reply"} onClick={async () => { if (await run("reply", () => adminReplyTicket(ticket.id, reply, actor), P.REPLIED(ticket.raisedBy.name))) setReply(""); }}><Send className="size-4" />{P.SEND_REPLY}</Button>
        </div>
      </DrawerSection>

      <DrawerSection title={P.ADD_NOTE}>
        <FormTextarea label={P.NOTE_LABEL} name="note" onChange={(e) => setNote(e.target.value)} rows={2} value={note} />
        <div className="mt-2 flex justify-end">
          <Button disabled={!note.trim()} loading={busy === "note"} onClick={async () => { if (await run("note", () => addTicketNote(ticket.id, note, actor), P.NOTE_ADDED)) setNote(""); }} variant="outline"><StickyNote className="size-4" />{P.SAVE_NOTE}</Button>
        </div>
      </DrawerSection>
    </div>
  );
}
