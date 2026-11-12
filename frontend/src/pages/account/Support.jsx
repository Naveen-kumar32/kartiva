import { useFormik } from "formik";
import { CheckCircle2, ChevronRight, LifeBuoy, Plus, Send } from "lucide-react";
import { useState } from "react";

import { createTicket, getCmsPage, getMyOrders, getMyTickets, replyToTicket, resolveMyTicket, TICKET_CATEGORY_OPTIONS } from "@/api";
import { Badge, Button, Container, Drawer, EmptyState, ErrorState, FormInput, FormSelect, FormTextarea, Modal, PageHeader, PageLoader, Panel } from "@/components";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { cn } from "@/utils/cn";
import { formatDateTime } from "@/utils/format";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast, successToast } from "@/utils/toast";
import { createSupportTicketSchema } from "@/validators";

const B = EN.BUYER_HUB.SUPPORT;
const STATUS_TONE = { closed: "neutral", in_progress: "warning", open: "info", resolved: "success" };

// FAQ CMS body: blocks of "Q: …\nA: …" separated by blank lines.
const parseFaq = (body = "") => body.split(/\n\n+/).map((block) => {
  const q = block.match(/^Q:\s*(.+)$/m)?.[1];
  const a = block.match(/^A:\s*([\s\S]+)$/m)?.[1];
  return q && a ? { a: a.trim(), q: q.trim() } : null;
}).filter(Boolean);

function NewTicketForm({ onCreated, orders, user }) {
  const formik = useFormik({
    // Customers don't pick a priority — the support team triages (urgent refunds etc.).
    initialValues: { category: "orders", message: "", orderNumber: "", priority: "medium", subject: "" },
    onSubmit: async (values, { setSubmitting }) => {
      try { onCreated(await createTicket(user, values)); } catch (err) { errorToast(getErrorMessage(err)); setSubmitting(false); }
    },
    validationSchema: createSupportTicketSchema({ ...EN.VALIDATION, ...EN.BUYER_HUB.VALIDATION }),
  });
  const { errors, handleBlur, handleChange, handleSubmit, isSubmitting, touched, values } = formik;
  const field = (name) => ({ error: errors[name], name, onBlur: handleBlur, onChange: handleChange, touched: touched[name], value: values[name] });
  return (
    <form noValidate onSubmit={handleSubmit}>
      <div className="-mx-1 max-h-[65vh] space-y-3 overflow-y-auto px-1">
        <FormInput {...field("subject")} label={B.SUBJECT} />
        <div className="grid gap-3 sm:grid-cols-2">
          <FormSelect {...field("category")} label={B.CATEGORY} options={TICKET_CATEGORY_OPTIONS.map((c) => ({ label: B.CATEGORIES[c], value: c }))} />
        </div>
        <FormSelect {...field("orderNumber")} label={B.RELATED_ORDER} options={orders.map((o) => ({ label: o.number, value: o.number }))} placeholder={B.NO_ORDER} />
        <FormTextarea {...field("message")} label={B.MESSAGE} rows={4} />
        <p className="text-xs text-muted">{B.SLA_NOTE}</p>
      </div>
      <div className="mt-4 flex justify-end"><Button loading={isSubmitting} type="submit">{B.SUBMIT}</Button></div>
    </form>
  );
}

function TicketThread({ onChange, ticket, user }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn, msg) => {
    setBusy(true);
    try { onChange(await fn()); if (msg) successToast(msg); return true; } catch (err) { errorToast(getErrorMessage(err)); return false; } finally { setBusy(false); }
  };
  const open = ticket.status !== "resolved" && ticket.status !== "closed";
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-line p-4 text-sm">
        <p className="font-semibold">{ticket.subject}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[ticket.status]}>{B.STATUS[ticket.status] ?? ticket.status}</Badge>
          <span className="text-xs text-muted">{B.CATEGORIES[ticket.category] ?? ticket.category}{ticket.orderNumber ? ` · ${ticket.orderNumber}` : ""}</span>
        </div>
        {open && <p className="text-xs text-muted">{B.SLA_DUE(formatDateTime(ticket.slaDueAt))}</p>}
      </div>
      <ol className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
        {ticket.messages.map((m) => {
          const mine = m.from !== "admin";
          return (
            <li className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", mine ? "ml-auto bg-brand-600 text-white" : "bg-white shadow-card")} key={m.id}>
              <p className={cn("text-[11px] font-semibold", mine ? "text-white/80" : "text-brand-700")}>{mine ? EN.MARKET.YOU : B.SUPPORT_TEAM}</p>
              <p className="whitespace-pre-line">{m.body}</p>
              <p className={cn("mt-1 text-[11px]", mine ? "text-white/70" : "text-muted")}>{formatDateTime(m.at)}</p>
            </li>
          );
        })}
      </ol>
      <form className="space-y-2 border-t border-line p-4" onSubmit={async (e) => { e.preventDefault(); if (draft.trim() && await run(() => replyToTicket(user, ticket.id, draft))) setDraft(""); }}>
        <FormTextarea label={B.REPLY} name="reply" onChange={(e) => setDraft(e.target.value)} rows={2} value={draft} />
        <div className="flex flex-wrap justify-between gap-2">
          {open ? <Button disabled={busy} onClick={() => run(() => resolveMyTicket(user, ticket.id), B.RESOLVED)} size="sm" variant="ghost"><CheckCircle2 className="size-4" />{B.MARK_RESOLVED}</Button> : <span className="text-xs text-muted">{B.REOPEN_HINT}</span>}
          <Button disabled={!draft.trim()} loading={busy} size="sm" type="submit"><Send className="size-4" />{EN.MARKET.SEND}</Button>
        </div>
      </form>
    </div>
  );
}

export function Support() {
  useDocumentTitle(B.TITLE);
  const { user } = useAuth();
  const load = () => Promise.all([getMyTickets(user), getMyOrders(user.email), getCmsPage("faq").catch(() => null)]).then(([tickets, orders, faq]) => ({ faq, orders, tickets }));
  const { data, error, loading, reload, setData } = useAsync(load, [user?.email]);
  const [creating, setCreating] = useState(false);
  const [activeId, setActiveId] = useState(null);
  if (loading) return <PageLoader />;
  if (error) return <Container className="pt-6"><ErrorState message={error} onRetry={reload} /></Container>;
  const { faq, orders, tickets } = data;
  const active = tickets.find((t) => t.id === activeId);
  const upsert = (ticket) => setData({ ...data, tickets: [ticket, ...tickets.filter((t) => t.id !== ticket.id)] });

  return (
    <Container className="max-w-5xl space-y-6 pt-6">
      <PageHeader actions={<Button onClick={() => setCreating(true)}><Plus className="size-4" />{B.NEW_TICKET}</Button>} subtitle={B.SUBTITLE} title={B.TITLE} />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title={B.MY_TICKETS}>
          {!tickets.length ? (
            <EmptyState actionLabel={B.NEW_TICKET} body={B.EMPTY_BODY} icon={LifeBuoy} onAction={() => setCreating(true)} title={B.EMPTY} />
          ) : (
            <ul className="-mx-5 divide-y divide-line">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50" onClick={() => setActiveId(t.id)} type="button">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium"><span className="font-mono text-xs text-muted">{t.number}</span>{t.subject}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <Badge tone={STATUS_TONE[t.status]}>{B.STATUS[t.status] ?? t.status}</Badge>
                        {B.UPDATED(formatDateTime(t.updatedAt))}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="size-4 text-muted" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={B.FAQ}>
          {faq ? (
            <div className="divide-y divide-line">
              {parseFaq(faq.body).map((f) => (
                <details className="group py-3" key={f.q}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium">{f.q}<ChevronRight aria-hidden className="size-4 shrink-0 text-muted transition group-open:rotate-90" /></summary>
                  <p className="mt-2 text-sm text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          ) : <p className="text-sm text-muted">{B.NO_FAQ}</p>}
        </Panel>
      </div>

      <Modal onClose={() => setCreating(false)} open={creating} title={B.NEW_TICKET}>
        {creating && <NewTicketForm onCreated={(t) => { upsert(t); setCreating(false); setActiveId(t.id); successToast(B.CREATED(t.number)); }} orders={orders} user={user} />}
      </Modal>
      <Drawer onClose={() => setActiveId(null)} open={Boolean(active)} side="right" size="md" title={active?.number ?? ""}>
        {active && <TicketThread key={active.id} onChange={upsert} ticket={active} user={user} />}
      </Drawer>
    </Container>
  );
}
