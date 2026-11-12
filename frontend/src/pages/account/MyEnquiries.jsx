import { CalendarDays, ClipboardList, MapPin, MessageSquareQuote, MessageSquareText, Trophy, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { acceptQuote, closeRfq, getMyEnquiries, getMyRfqs, openEnquiryChat, openRfqChat } from "@/api";
import { Badge, Button, ConfirmDialog, Container, EmptyState, ErrorState, PageHeader, PageLoader, SmartImage, StoreAvatar, Tabs, VerifiedBadges } from "@/components";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { cn } from "@/utils/cn";
import { formatCurrency, formatDate, formatNumber } from "@/utils/format";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast, successToast } from "@/utils/toast";

const B = EN.BUYER_HUB.MY_ENQUIRIES;
const UNITS = EN.BUYER_HUB.RFQ.UNITS;
const TONE = { accepted: "success", awarded: "success", closed: "neutral", contacted: "warning", lost: "neutral", new: "info", open: "brand", quoted: "brand", rejected: "neutral", spam: "danger", submitted: "info", won: "success" };
const StatusChip = ({ status }) => <Badge tone={TONE[status] ?? "neutral"}>{B.STATUS[status] ?? status}</Badge>;
const unitLabel = (u) => UNITS[u] ?? u;

function EnquiryCard({ enquiry, onChat }) {
  const { product, store } = enquiry;
  return (
    <article className="flex gap-4 rounded-2xl bg-white p-4 shadow-card sm:p-5">
      {product ? (
        <Link className="size-16 shrink-0 overflow-hidden rounded-lg bg-slate-50 sm:size-20" to={ROUTES.PRODUCT(product.slug)}>
          <SmartImage alt={product.name} className="size-full object-contain p-1.5" src={product.thumbnail} />
        </Link>
      ) : store && <StoreAvatar size="size-16 sm:size-20 text-lg" store={store} />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold">{product ? <Link className="hover:text-brand-700" to={ROUTES.PRODUCT(product.slug)}>{product.name}</Link> : B.STORE_ENQUIRY}</p>
            {store && <p className="text-sm text-muted"><Link className="font-medium text-ink hover:text-brand-700" to={ROUTES.STORE(store.slug)}>{store.name}</Link> · {store.city}</p>}
          </div>
          <StatusChip status={enquiry.status} />
        </div>
        {store && <VerifiedBadges className="mt-1.5" compact store={store} />}
        <p className="mt-2 line-clamp-2 text-sm text-ink/80">{enquiry.message}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>{B.QTY(formatNumber(enquiry.quantity), unitLabel(enquiry.unit))}</span>
          <Badge tone={enquiry.requirementType === "bulk" ? "brand" : "neutral"}>{enquiry.requirementType === "bulk" ? EN.BUYER_HUB.ENQUIRY.BULK : EN.BUYER_HUB.ENQUIRY.RETAIL}</Badge>
          {enquiry.wantsTestRide && <span className="flex items-center gap-1"><CalendarDays aria-hidden className="size-3.5" />{B.TEST_RIDE(enquiry.preferredDate ? formatDate(enquiry.preferredDate) : null)}</span>}
          <span>{B.SENT_ON(formatDate(enquiry.createdAt))}</span>
        </p>
        <div className="mt-3">
          <Button onClick={() => onChat(enquiry)} size="sm" variant="outline"><MessageSquareText className="size-4" />{B.OPEN_CHAT}</Button>
        </div>
      </div>
    </article>
  );
}

function RfqCard({ onAccept, onChat, onClose, rfq }) {
  const best = rfq.quotes.length ? Math.min(...rfq.quotes.map((q) => q.pricePerUnit)) : null;
  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-slate-50 px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-semibold">{rfq.title}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>{rfq.categoryName}</span>
            <span>{B.QTY(formatNumber(rfq.quantity), unitLabel(rfq.unit))}</span>
            {rfq.targetPrice && <span>{B.TARGET(formatCurrency(rfq.targetPrice), unitLabel(rfq.unit))}</span>}
            <span className="flex items-center gap-1"><MapPin aria-hidden className="size-3" />{rfq.deliveryCity}</span>
            <span>{B.NEEDED_BY(formatDate(rfq.deadline))}</span>
            <span>{B.POSTED_ON(formatDate(rfq.createdAt))}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={rfq.status} />
          {rfq.status === "open" && <Button onClick={() => onClose(rfq)} size="sm" variant="ghost"><XCircle className="size-4" />{B.CLOSE_REQUEST}</Button>}
        </div>
      </header>
      <div className="p-5">
        {rfq.details && <p className="mb-4 text-sm text-muted">{rfq.details}</p>}
        <h3 className="mb-3 text-sm font-semibold">{B.QUOTES_TITLE(rfq.quotes.length)}</h3>
        {rfq.quotes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{rfq.status === "open" ? B.NO_QUOTES_OPEN : B.NO_QUOTES}</p>
        ) : (
          <div className="scrollbar-none -mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1">
            {rfq.quotes.map((q) => (
              <div className={cn("flex w-64 shrink-0 snap-start flex-col rounded-xl border p-4", q.status === "accepted" ? "border-emerald-400 bg-emerald-50/50" : "border-line")} key={q.id}>
                <div className="flex items-center gap-2">
                  {q.store && <StoreAvatar size="size-9" store={q.store} />}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{q.store ? <Link className="hover:text-brand-700" to={ROUTES.STORE(q.store.slug)}>{q.store.name}</Link> : q.storeSlug}</p>
                    <p className="text-xs text-muted">{q.store?.city}</p>
                  </div>
                </div>
                <VerifiedBadges className="mt-2" compact store={q.store} />
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between gap-2"><dt className="text-muted">{B.PRICE_UNIT}</dt><dd className="font-bold tabular">{formatCurrency(q.pricePerUnit)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted">{B.TOTAL}</dt><dd className="tabular">{formatCurrency(q.total)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted">{B.LEAD_TIME}</dt><dd>{B.DAYS(q.leadTimeDays)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted">{B.VALID_TILL}</dt><dd>{formatDate(q.validTill)}</dd></div>
                </dl>
                {q.note && <p className="mt-2 line-clamp-3 text-xs text-muted">{q.note}</p>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {q.pricePerUnit === best && rfq.quotes.length > 1 && <Badge tone="success"><Trophy aria-hidden className="size-3" />{B.BEST_PRICE}</Badge>}
                  {q.status !== "submitted" && <StatusChip status={q.status} />}
                </div>
                <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
                  {rfq.status === "open" && q.status === "submitted" && <Button onClick={() => onAccept(rfq, q)} size="sm">{B.ACCEPT_SHORT}</Button>}
                  <Button className={rfq.status === "open" && q.status === "submitted" ? "" : "col-span-2"} onClick={() => onChat(rfq, q)} size="sm" variant="outline"><MessageSquareText className="size-4" />{B.CHAT}</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export function MyEnquiries() {
  useDocumentTitle(B.TITLE);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "rfqs" ? "rfqs" : "enquiries";
  const { data, error, loading, reload } = useAsync(() => Promise.all([getMyEnquiries(user), getMyRfqs(user)]).then(([enquiries, rfqs]) => ({ enquiries, rfqs })), [user?.email]);
  const [confirm, setConfirm] = useState(null); // { type: "accept" | "close", rfq, quote? }
  const [busy, setBusy] = useState(false);

  if (loading) return <PageLoader />;
  if (error) return <Container className="pt-6"><ErrorState message={error} onRetry={reload} /></Container>;
  const { enquiries, rfqs } = data;

  const goChat = async (fn) => {
    try { navigate(`${ROUTES.ACCOUNT.MESSAGES}?thread=${await fn()}`); } catch (err) { errorToast(getErrorMessage(err)); }
  };
  const runConfirm = async () => {
    setBusy(true);
    try {
      if (confirm.type === "accept") { await acceptQuote(user, confirm.rfq.id, confirm.quote.id); successToast(B.ACCEPTED(confirm.quote.store?.name ?? "")); }
      else { await closeRfq(user, confirm.rfq.id); successToast(B.CLOSED); }
      setConfirm(null);
      reload();
    } catch (err) {
      errorToast(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container className="max-w-5xl space-y-5 pt-6">
      <PageHeader actions={<Button to={ROUTES.POST_REQUIREMENT} variant="accent"><ClipboardList className="size-4" />{EN.BUYER_HUB.NAV.POST_REQUIREMENT}</Button>} subtitle={B.SUBTITLE} title={B.TITLE} />
      <Tabs
        onChange={(v) => setParams(v === "rfqs" ? { tab: "rfqs" } : {}, { replace: true })}
        tabs={[{ count: enquiries.length, label: B.TAB_ENQUIRIES, value: "enquiries" }, { count: rfqs.length, label: B.TAB_RFQS, value: "rfqs" }]}
        value={tab}
      />
      {tab === "enquiries" && (enquiries.length ? (
        <div className="space-y-4">{enquiries.map((e) => <EnquiryCard enquiry={e} key={e.id} onChat={(x) => goChat(() => openEnquiryChat(user, x.id))} />)}</div>
      ) : (
        <EmptyState actionLabel={B.BROWSE} actionTo={ROUTES.SEARCH("")} body={B.EMPTY_ENQUIRIES_BODY} icon={MessageSquareQuote} title={B.EMPTY_ENQUIRIES} />
      ))}
      {tab === "rfqs" && (rfqs.length ? (
        <div className="space-y-5">
          {rfqs.map((r) => (
            <RfqCard
              key={r.id}
              onAccept={(rfq, quote) => setConfirm({ quote, rfq, type: "accept" })}
              onChat={(rfq, quote) => goChat(() => openRfqChat(user, rfq.id, quote.storeSlug))}
              onClose={(rfq) => setConfirm({ rfq, type: "close" })}
              rfq={r}
            />
          ))}
        </div>
      ) : (
        <EmptyState actionLabel={EN.BUYER_HUB.NAV.POST_REQUIREMENT} actionTo={ROUTES.POST_REQUIREMENT} body={B.EMPTY_RFQS_BODY} icon={ClipboardList} title={B.EMPTY_RFQS} />
      ))}
      <ConfirmDialog
        body={confirm?.type === "accept" ? B.ACCEPT_BODY(confirm.quote.store?.name ?? "", formatCurrency(confirm.quote.pricePerUnit), confirm.rfq.quotes.length - 1) : B.CLOSE_BODY}
        confirmLabel={confirm?.type === "accept" ? B.ACCEPT : B.CLOSE_REQUEST}
        danger={confirm?.type === "close"}
        loading={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirm}
        open={Boolean(confirm)}
        title={confirm?.type === "accept" ? B.ACCEPT_TITLE : B.CLOSE_TITLE}
      />
    </Container>
  );
}
