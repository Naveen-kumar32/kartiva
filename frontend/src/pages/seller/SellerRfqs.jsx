import { useFormik } from "formik";
import { CalendarClock, ClipboardList, Crown, MapPin, MessagesSquare, Send, Target, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { getSellerRfqs, markRfqViewed, submitRfqQuote } from "@/api";
import {
  Badge, Button, EmptyState, ErrorState, FormInput, FormTextarea, Modal, PageHeader, PageLoader, Panel, Tabs,
} from "@/components";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { cn, errorToast, formatCurrency, formatDate, formatNumber, getErrorMessage, successToast } from "@/utils";
import { createQuoteSchema } from "@/validators";

const P = EN.SELLER_PRO;
const R = P.RFQ;
const V = { ...EN.VALIDATION, ...EN.SELLER_HUB.VALIDATION, ...P.VALIDATION };
const QUOTE_TONE = { accepted: "success", rejected: "danger", submitted: "info" };
const RFQ_TONE = { awarded: "success", closed: "neutral", open: "brand" };
const isoDate = (d) => new Date(d).toISOString().slice(0, 10);

function Countdown({ deadline, now }) {
  const hours = (new Date(deadline).getTime() - now) / 3_600_000;
  const tone = hours <= 0 ? "text-muted" : hours < 48 ? "text-red-600" : hours < 120 ? "text-amber-700" : "text-emerald-700";
  return <span className={cn("inline-flex items-center gap-1 font-medium", tone)}><CalendarClock aria-hidden className="size-4" />{R.DEADLINE_IN(hours)}</span>;
}

function QuoteModal({ onClose, onSaved, rfq, storeSlug, actor }) {
  const mine = rfq?.myQuote;
  const [today] = useState(() => Date.now());
  const formik = useFormik({
    initialValues: {
      leadTimeDays: mine?.leadTimeDays ?? 7, note: mine?.note ?? "", pricePerUnit: mine?.pricePerUnit ?? "",
      validTill: mine ? isoDate(mine.validTill) : isoDate(today + 14 * 86_400_000),
    },
    onSubmit: async (values) => {
      try {
        await submitRfqQuote(storeSlug, rfq.id, values, actor);
        successToast(mine ? R.QUOTE_UPDATED : R.QUOTE_SENT);
        onSaved();
      } catch (err) {
        errorToast(getErrorMessage(err));
      }
    },
    validationSchema: createQuoteSchema(V),
  });
  const { errors, handleBlur, handleChange, handleSubmit, isSubmitting, touched, values } = formik;
  const total = (Number(values.pricePerUnit) || 0) * (rfq?.quantity ?? 0);
  const field = (name) => ({ error: errors[name], name, onBlur: handleBlur, onChange: handleChange, touched: touched[name], value: values[name] });

  return (
    <Modal onClose={onClose} open={Boolean(rfq)} title={mine ? R.EDIT_QUOTE : R.SEND_QUOTE}>
      {rfq && (
        <form className="space-y-4" noValidate onSubmit={handleSubmit}>
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="font-semibold">{rfq.title}</p>
            <p className="text-muted">{formatNumber(rfq.quantity)} {rfq.unit} · {rfq.deliveryCity}{rfq.targetPrice ? ` · ${R.TARGET(formatCurrency(rfq.targetPrice), rfq.unit)}` : ""}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormInput inputMode="decimal" label={R.PRICE_PER_UNIT(rfq.unit)} {...field("pricePerUnit")} />
            <FormInput inputMode="numeric" label={R.LEAD_TIME} {...field("leadTimeDays")} />
            <FormInput className="sm:col-span-2" label={R.VALID_TILL} min={isoDate(today)} type="date" {...field("validTill")} />
          </div>
          <FormTextarea label={R.NOTE} placeholder={R.NOTE_PLACEHOLDER} rows={3} {...field("note")} />
          <p className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3 text-sm">
            <span className="text-brand-800">{R.TOTAL(formatNumber(rfq.quantity), rfq.unit)}</span>
            <b className="text-lg tabular text-brand-800">{formatCurrency(total)}</b>
          </p>
          <p className="text-xs text-muted">{mine ? R.EDIT_NOTE : R.CREDIT_NOTE}</p>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose} variant="ghost">{EN.COMMON.CANCEL}</Button>
            <Button loading={isSubmitting} type="submit"><Send className="size-4" />{mine ? R.UPDATE_QUOTE : R.SEND_QUOTE}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function SellerRfqs() {
  useDocumentTitle(EN.SELLER.NAV_RFQS);
  const { user } = useAuth();
  const storeSlug = user.storeSlug;
  const actor = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
  const { data, error, loading, reload, setData } = useAsync(() => getSellerRfqs(storeSlug), [storeSlug]);
  const [tab, setTab] = useState("matching");
  const [quoting, setQuoting] = useState(null);
  const [now] = useState(() => Date.now());
  const [params] = useSearchParams();
  const focusId = Number(params.get("rfq")) || null;

  // Requests sent to this store count as "viewed" once the seller opens this page; jump to the one from the alert.
  useEffect(() => {
    if (!data) return;
    data.rfqs.filter((r) => r.sentToMe && !r.viewedAt).forEach((r) => markRfqViewed(storeSlug, r.id));
    if (focusId) document.getElementById(`rfq-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [data, focusId, storeSlug]);

  const rfqs = useMemo(() => data?.rfqs ?? [], [data]);
  const groups = useMemo(() => ({
    all: rfqs.filter((r) => r.status === "open"),
    matching: rfqs.filter((r) => r.status === "open" && r.matches),
    mine: rfqs.filter((r) => r.myQuote),
  }), [rfqs]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const { credits } = data;
  const exhausted = credits.total != null && credits.used >= credits.total;
  const rows = groups[tab];

  const startQuote = (rfq) => {
    if (!rfq.myQuote && exhausted) return errorToast(R.EXHAUSTED);
    setQuoting(rfq);
    return null;
  };

  return (
    <div className="space-y-6">
      <PageHeader subtitle={R.SUBTITLE} title={EN.SELLER.NAV_RFQS} />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Panel>
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700"><Target aria-hidden className="size-6" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{R.HOW_TITLE}</p>
              <p className="text-sm text-muted">{R.HOW_BODY}</p>
            </div>
          </div>
        </Panel>
        <Panel>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{R.CREDITS}</p>
          <p className="mt-1 text-2xl font-bold tabular">{credits.total == null ? R.UNLIMITED : `${credits.used} / ${credits.total}`}</p>
          {credits.total != null && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={cn("h-full rounded-full", exhausted ? "bg-red-500" : "bg-[#14a397]")} style={{ width: `${Math.min(100, (credits.used / Math.max(1, credits.total)) * 100)}%` }} />
            </div>
          )}
          {exhausted ? (
            <p className="mt-2 text-sm text-red-700">{R.EXHAUSTED} <Button className="mt-2" size="sm" to={ROUTES.SELLER.PLAN} variant="accent"><Crown className="size-4" />{R.UPGRADE}</Button></p>
          ) : <p className="mt-2 text-xs text-muted">{credits.total == null ? R.UNLIMITED_NOTE : R.CREDITS_LEFT(credits.left)}</p>}
        </Panel>
      </div>

      <Tabs
        onChange={setTab}
        tabs={[
          { count: groups.matching.length, label: R.TAB_MATCHING, value: "matching" },
          { count: groups.all.length, label: R.TAB_ALL, value: "all" },
          { count: groups.mine.length, label: R.TAB_MINE, value: "mine" },
        ]}
        value={tab}
      />

      {rows.length === 0 ? (
        <EmptyState body={tab === "mine" ? R.EMPTY_MINE : tab === "matching" ? R.EMPTY_MATCHING : R.EMPTY_ALL} icon={ClipboardList} title={R.EMPTY} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {rows.map((r) => (
            <article className={cn("flex scroll-mt-28 flex-col rounded-2xl bg-white p-5 shadow-card", r.id === focusId && "ring-2 ring-accent-500")} id={`rfq-${r.id}`} key={r.id}>
              <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">{r.categoryName} · {R.POSTED(formatDate(r.createdAt))}</p>
                  <h2 className="mt-1 font-semibold leading-snug">{r.title}</h2>
                </div>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={RFQ_TONE[r.status] ?? "neutral"}>{R.RFQ_STATUS[r.status] ?? r.status}</Badge>
                  {r.forwardedByKartiva ? <Badge tone="info">{R.FROM_KARTIVA}</Badge> : r.sentToMe ? <Badge tone="accent">{R.SENT_TO_YOU}</Badge> : r.matches && <Badge tone="accent">{R.MATCH}</Badge>}
                </span>
              </header>
              <p className={cn("mt-2 text-sm text-ink/80", r.id !== focusId && "line-clamp-2")}>{r.details}</p>
              {r.kartivaNote && <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 ring-1 ring-sky-100">{R.KARTIVA_NOTE(r.kartivaNote)}</p>}
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
                <div><dt className="text-xs text-muted">{R.QUANTITY}</dt><dd className="font-semibold tabular">{formatNumber(r.quantity)} {r.unit}</dd></div>
                <div><dt className="text-xs text-muted">{R.TARGET_PRICE}</dt><dd className="font-semibold tabular">{r.targetPrice ? `${formatCurrency(r.targetPrice)}/${r.unit}` : "—"}</dd></div>
                <div><dt className="text-xs text-muted">{R.DELIVERY_TO}</dt><dd className="flex items-center gap-1 font-semibold"><MapPin aria-hidden className="size-3.5" />{r.deliveryCity}</dd></div>
                <div><dt className="text-xs text-muted">{R.QUOTES}</dt><dd className="flex items-center gap-1 font-semibold"><Users aria-hidden className="size-3.5" />{r.quoteCount}</dd></div>
              </dl>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
                <span className="text-muted">{R.BUYER(r.buyer.name, r.buyer.city)} · {r.status === "open" ? <Countdown deadline={r.deadline} now={now} /> : formatDate(r.deadline)}</span>
                <span className="flex flex-wrap gap-2">
                  {r.threadId && <Button size="sm" to={`${ROUTES.SELLER.MESSAGES}?thread=${r.threadId}`} variant="ghost"><MessagesSquare className="size-4" />{R.CONVERSATION}</Button>}
                  {r.status === "open" && (!r.myQuote || r.myQuote.status === "submitted") && (
                    <Button onClick={() => startQuote(r)} size="sm" variant={r.myQuote ? "outline" : "primary"}><Send className="size-4" />{r.myQuote ? R.EDIT_QUOTE : R.SEND_QUOTE}</Button>
                  )}
                </span>
              </div>
              {r.myQuote && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <span>{R.YOUR_QUOTE}: <b className="tabular">{formatCurrency(r.myQuote.pricePerUnit)}/{r.unit}</b> · {R.DAYS(r.myQuote.leadTimeDays)} · <span className="tabular">{formatCurrency(r.myQuote.pricePerUnit * r.quantity)}</span></span>
                  <Badge tone={QUOTE_TONE[r.myQuote.status] ?? "neutral"}>{R.QUOTE_STATUS[r.myQuote.status] ?? r.myQuote.status}</Badge>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <QuoteModal actor={actor} key={quoting?.id ?? "none"} onClose={() => setQuoting(null)} onSaved={async () => { setQuoting(null); setData(await getSellerRfqs(storeSlug)); }} rfq={quoting} storeSlug={storeSlug} />
    </div>
  );
}
