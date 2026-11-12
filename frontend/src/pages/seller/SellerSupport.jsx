import { useFormik } from "formik";
import { CheckCircle2, ChevronDown, Clock, LifeBuoy, Mail, Phone, Plus, Send } from "lucide-react";
import { useMemo, useState } from "react";

import { createSellerTicket, getSellerTickets, replySellerTicket, resolveSellerTicket } from "@/api";
import {
  Badge, Button, DataTable, Drawer, EmptyState, ErrorState, FormInput, FormSelect, FormTextarea, MiniStat, Modal, PageHeader, PageLoader, Panel, Tabs,
} from "@/components";
import { PLATFORM } from "@/data";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { cn, errorToast, formatDateTime, getErrorMessage, successToast } from "@/utils";
import { createTicketSchema } from "@/validators";

const P = EN.SELLER_PRO;
const S = P.SUPPORT;
const V = { ...EN.VALIDATION, ...P.VALIDATION };
const CATEGORIES = ["payments", "orders", "catalogue", "kyc", "ads", "technical", "other"];
const PRIORITIES = ["low", "medium", "high", "urgent"];
const STATUS_TONE = { closed: "neutral", in_progress: "info", open: "warning", resolved: "success" };
const PRIORITY_TONE = { high: "accent", low: "neutral", medium: "info", urgent: "danger" };
const isOpen = (t) => ["open", "in_progress"].includes(t.status);

function Sla({ now, ticket }) {
  if (!isOpen(ticket)) return <span className="text-xs text-muted">—</span>;
  const h = (new Date(ticket.slaDueAt).getTime() - now) / 3_600_000;
  return <span className={cn("inline-flex items-center gap-1 text-xs font-medium", h < 0 ? "text-red-600" : h < 4 ? "text-amber-700" : "text-emerald-700")}><Clock aria-hidden className="size-3.5" />{S.SLA(h)}</span>;
}

function NewTicketModal({ onClose, onCreated, open, storeSlug, user }) {
  const formik = useFormik({
    initialValues: { category: "payments", message: "", priority: "medium", subject: "" },
    onSubmit: async (values, { resetForm }) => {
      try {
        const t = await createSellerTicket(storeSlug, user, values);
        successToast(S.CREATED(t.number));
        resetForm();
        onCreated(t);
      } catch (err) {
        errorToast(getErrorMessage(err));
      }
    },
    validationSchema: createTicketSchema(V),
  });
  const { errors, handleBlur, handleChange, handleSubmit, isSubmitting, touched, values } = formik;
  const field = (name) => ({ error: errors[name], name, onBlur: handleBlur, onChange: handleChange, touched: touched[name], value: values[name] });
  return (
    <Modal onClose={onClose} open={open} title={S.NEW_TICKET}>
      <form className="space-y-4" noValidate onSubmit={handleSubmit}>
        <FormInput label={S.SUBJECT} {...field("subject")} />
        <div className="grid gap-3 sm:grid-cols-2">
          <FormSelect label={S.CATEGORY} options={CATEGORIES.map((c) => ({ label: S.CATEGORIES[c], value: c }))} {...field("category")} />
          <FormSelect label={S.PRIORITY} options={PRIORITIES.map((p) => ({ label: S.PRIORITIES[p], value: p }))} {...field("priority")} />
        </div>
        <FormTextarea label={S.MESSAGE} placeholder={S.MESSAGE_PLACEHOLDER} rows={5} {...field("message")} />
        <p className="text-xs text-muted">{S.SLA_NOTE(S.SLA_HOURS[values.priority])}</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">{EN.COMMON.CANCEL}</Button>
          <Button loading={isSubmitting} type="submit"><Send className="size-4" />{S.SUBMIT}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function SellerSupport() {
  useDocumentTitle(EN.SELLER.NAV_SUPPORT);
  const { user } = useAuth();
  const storeSlug = user.storeSlug;
  const { data, error, loading, reload, setData } = useAsync(() => getSellerTickets(storeSlug), [storeSlug]);
  const [tab, setTab] = useState("open");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(null);
  const [now] = useState(() => Date.now());

  const tickets = useMemo(() => data ?? [], [data]);
  const rows = tickets.filter((t) => (tab === "open" ? isOpen(t) : tab === "done" ? !isOpen(t) : true));
  const active = tickets.find((t) => t.id === openId) ?? null;
  const replace = (t) => setData(tickets.map((x) => (x.id === t.id ? t : x)));

  const send = async () => {
    setBusy("reply");
    try {
      replace(await replySellerTicket(storeSlug, active.id, reply));
      setReply("");
      successToast(S.REPLY_SENT);
    } catch (err) {
      errorToast(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const resolve = async () => {
    setBusy("resolve");
    try {
      replace(await resolveSellerTicket(storeSlug, active.id));
      successToast(S.RESOLVED);
    } catch (err) {
      errorToast(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const openCount = tickets.filter(isOpen).length;
  const breached = tickets.filter((t) => isOpen(t) && new Date(t.slaDueAt).getTime() < now).length;

  return (
    <div className="space-y-6">
      <PageHeader actions={<Button onClick={() => setCreating(true)} size="sm"><Plus className="size-4" />{S.NEW_TICKET}</Button>} subtitle={S.SUBTITLE} title={EN.SELLER.NAV_SUPPORT} />
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat label={S.KPI_OPEN} tone={openCount ? "warning" : undefined} value={openCount} />
        <MiniStat label={S.KPI_OVERDUE} tone={breached ? "danger" : undefined} value={breached} />
        <div className="rounded-xl bg-white px-4 py-3 text-sm shadow-card">
          <p className="text-xs text-muted">{S.CONTACT}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 font-medium"><a className="inline-flex items-center gap-1 hover:text-brand-700" href={`tel:${PLATFORM.supportPhone.replace(/\s/g, "")}`}><Phone aria-hidden className="size-3.5" />{PLATFORM.supportPhone}</a><a className="inline-flex items-center gap-1 hover:text-brand-700" href={`mailto:${PLATFORM.supportEmail}`}><Mail aria-hidden className="size-3.5" />{PLATFORM.supportEmail}</a></p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel>
          <Tabs className="mb-2" onChange={setTab} tabs={[{ count: openCount, label: S.TAB_OPEN, value: "open" }, { count: tickets.length - openCount, label: S.TAB_DONE, value: "done" }, { count: tickets.length, label: EN.COMMON.ALL, value: "all" }]} value={tab} />
          {rows.length === 0 ? <EmptyState body={S.EMPTY_BODY} icon={LifeBuoy} title={S.EMPTY} /> : (
            <DataTable
              columns={[
                { header: S.TICKET, key: "number", render: (t) => <span className="block min-w-0"><span className="font-mono text-xs text-muted">{t.number}</span><span className="block font-medium">{t.subject}</span><span className="text-xs text-muted">{S.CATEGORIES[t.category] ?? t.category}</span></span> },
                { header: S.PRIORITY, key: "priority", render: (t) => <Badge tone={PRIORITY_TONE[t.priority]}>{S.PRIORITIES[t.priority]}</Badge> },
                { header: EN.TABLE.STATUS, key: "status", render: (t) => <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{S.STATUS[t.status] ?? t.status}</Badge> },
                { header: S.SLA_COL, key: "sla", render: (t) => <Sla now={now} ticket={t} /> },
                { header: S.UPDATED, key: "updatedAt", render: (t) => formatDateTime(t.updatedAt) },
              ]}
              onRowClick={(t) => { setOpenId(t.id); setReply(""); }}
              rows={rows}
            />
          )}
        </Panel>
        <Panel title={S.FAQ}>
          <ul className="divide-y divide-line">
            {S.FAQS.map(([q, a]) => (
              <li key={q}>
                <details className="group py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">{q}<ChevronDown aria-hidden className="size-4 shrink-0 text-muted transition group-open:rotate-180" /></summary>
                  <p className="mt-2 text-sm text-muted">{a}</p>
                </details>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Drawer onClose={() => setOpenId(null)} open={Boolean(active)} side="right" size="md" title={active?.number ?? ""}>
        {active && (
          <div className="space-y-4 p-5">
            <div>
              <p className="text-lg font-bold">{active.subject}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={STATUS_TONE[active.status] ?? "neutral"}>{S.STATUS[active.status] ?? active.status}</Badge>
                <Badge tone={PRIORITY_TONE[active.priority]}>{S.PRIORITIES[active.priority]}</Badge>
                <span className="text-muted">{S.CATEGORIES[active.category] ?? active.category}</span>
                <Sla now={now} ticket={active} />
              </p>
              {active.assignee && <p className="mt-1 text-xs text-muted">{S.ASSIGNED(active.assignee)}</p>}
            </div>
            <ol className="space-y-3">
              {active.messages.map((m) => (
                <li className={cn("max-w-[88%] rounded-2xl px-4 py-2.5 text-sm", m.from === "admin" ? "bg-slate-100" : "ml-auto bg-brand-600 text-white")} key={m.id}>
                  <p className="whitespace-pre-line">{m.body}</p>
                  <p className={cn("mt-1 text-[11px]", m.from === "admin" ? "text-muted" : "text-white/75")}>{m.from === "admin" ? S.KARTIVA_TEAM : EN.MARKET.YOU} · {formatDateTime(m.at)}</p>
                </li>
              ))}
            </ol>
            <div className="border-t border-line pt-4">
              <label className="text-sm font-medium" htmlFor="ticket-reply">{S.REPLY}</label>
              <textarea className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" id="ticket-reply" maxLength={4000} onChange={(e) => setReply(e.target.value)} rows={3} value={reply} />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button disabled={!reply.trim() || busy != null} loading={busy === "reply"} onClick={send} size="sm"><Send className="size-4" />{S.SEND}</Button>
                {isOpen(active) && <Button disabled={busy != null} loading={busy === "resolve"} onClick={resolve} size="sm" variant="outline"><CheckCircle2 className="size-4" />{S.MARK_RESOLVED}</Button>}
              </div>
            </div>
          </div>
        )}
      </Drawer>
      <NewTicketModal onClose={() => setCreating(false)} onCreated={async (t) => { setCreating(false); setData(await getSellerTickets(storeSlug)); setTab("open"); setOpenId(t.id); }} open={creating} storeSlug={storeSlug} user={user} />
    </div>
  );
}
