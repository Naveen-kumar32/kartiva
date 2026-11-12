import { ChevronDown, FileText, Package, RotateCcw, Truck, XCircle } from "lucide-react";
import { useState } from "react";

import { cancelMySubOrder, escalateReturn, getMyOrders, getMyReturns, requestReturn } from "@/api";
import {
  Button, Container, EmptyState, FormSelect, FormTextarea, Modal, OrderDocumentActions, PageLoader, PromptDialog, ShipmentTracker, SmartImage, StatusBadge, Tabs, Timeline,
} from "@/components";
import { PLATFORM } from "@/data";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { getStore } from "@/utils/catalog";
import { formatCurrency, formatDate, formatDateTime } from "@/utils/format";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast, successToast } from "@/utils/toast";

const A = EN.ACCOUNT;
const DAY = 86_400_000;
// PDFs are generated on demand; load jsPDF only when a buyer actually downloads (keeps the storefront bundle small).
const docs = () => import("@/utils/documents");

export function MyOrders() {
  useDocumentTitle(A.MY_ORDERS);
  const { user } = useAuth();
  const load = () => Promise.all([getMyOrders(user.email), getMyReturns(user.email)]).then(([orders, returns]) => ({ orders, returns }));
  const { data, loading, reload } = useAsync(load, [user.email]);
  const [tab, setTab] = useState("orders");
  const [cancelling, setCancelling] = useState(null);
  const [returning, setReturning] = useState(null);
  const [now] = useState(() => Date.now()); // fixed per visit, keeps render pure
  if (loading) return <PageLoader />;
  const { orders, returns } = data;

  const run = async (fn, msg) => {
    try { await fn(); successToast(msg); reload(); } catch (err) { errorToast(getErrorMessage(err)); }
  };
  const invoice = async (order, sub) => (await docs()).downloadTaxInvoice({ order, platform: PLATFORM, store: getStore(sub.storeSlug), sub });
  const creditNote = async (ret) => {
    const order = orders.find((o) => o.number === ret.orderNumber);
    const sub = order.subOrders.find((s) => s.number === ret.subOrderNumber);
    (await docs()).downloadCreditNote({ order, platform: PLATFORM, ret, store: getStore(ret.storeSlug), sub });
  };

  return (
    <Container className="max-w-4xl pt-6">
      <h1 className="mb-4 text-2xl font-bold">{A.MY_ORDERS}</h1>
      <Tabs className="mb-6" onChange={setTab} tabs={[{ count: orders.length, label: A.ORDERS_TAB, value: "orders" }, { count: returns.length, label: A.RETURNS_TAB, value: "returns" }]} value={tab} />

      {tab === "orders" && (!orders.length ? (
        <EmptyState actionLabel={EN.CART.CONTINUE_SHOPPING} actionTo={ROUTES.HOME} body={A.EMPTY_ORDERS_BODY} icon={Package} title={A.EMPTY_ORDERS_TITLE} />
      ) : (
        <div className="space-y-6">
          {orders.map((order) => (
            <article className="overflow-hidden rounded-2xl bg-white shadow-card" key={order.number}>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-slate-50 px-5 py-3 text-sm">
                <div>
                  <p className="font-mono font-semibold">{order.number}</p>
                  <p className="text-xs text-muted">{A.ORDER_PLACED_ON(formatDateTime(order.createdAt))} · {A.PAID_BY(order.paymentMethod === "cod" ? EN.ORDER.METHOD_COD : EN.ORDER.METHOD_ONLINE)}</p>
                </div>
                <p className="text-right"><span className="block text-xs text-muted">{A.ORDER_TOTAL}</span><b className="tabular">{formatCurrency(order.grandTotal)}</b></p>
                <div className="flex w-full flex-wrap gap-2"><OrderDocumentActions audience="buyer" order={order} /></div>
              </header>
              <div className="divide-y divide-line">
                {order.subOrders.map((sub) => (
                  <SubOrder
                    key={sub.number}
                    now={now}
                    onCancel={() => setCancelling(sub)}
                    onInvoice={() => invoice(order, sub)}
                    onReturn={(item) => setReturning({ item, order, sub })}
                    returnWindowDays={PLATFORM.defaultReturnWindowDays}
                    address={order.address}
                    sub={sub}
                  />
                ))}
              </div>
            </article>
          ))}
        </div>
      ))}

      {tab === "returns" && (!returns.length ? (
        <EmptyState body={A.NO_RETURNS_BODY} icon={RotateCcw} title={A.NO_RETURNS} />
      ) : (
        <div className="space-y-4">
          {returns.map((ret) => (
            <article className="rounded-2xl bg-white p-5 shadow-card" key={ret.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{ret.items[0].name} <span className="text-sm font-normal text-muted">× {ret.items[0].quantity}</span></p>
                <StatusBadge status={ret.status} />
              </div>
              <p className="mt-1 text-xs text-muted">{ret.number} · {A.REASON(ret.reasonCode)} · {A.REFUND_OF(formatCurrency(ret.refundAmount))}</p>
              {ret.rejectionReason && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{ret.rejectionReason}</p>}
              <div className="mt-4"><Timeline events={ret.timeline} /></div>
              <div className="mt-4 flex flex-wrap gap-2">
                {ret.status === "rejected" && !ret.escalated && <Button onClick={() => run(() => escalateReturn(ret.id), A.ESCALATED)} size="sm" variant="outline">{A.ESCALATE}</Button>}
                {ret.escalated && <span className="text-sm text-amber-700">{A.ESCALATED_NOTE}</span>}
                {ret.creditNoteNumber && <Button onClick={() => creditNote(ret)} size="sm" variant="outline"><FileText className="size-4" />{A.CREDIT_NOTE}</Button>}
              </div>
            </article>
          ))}
        </div>
      ))}

      <PromptDialog
        body={cancelling && A.CANCEL_BODY(cancelling.storeName)}
        confirmLabel={A.CANCEL_SHIPMENT}
        danger
        key={cancelling?.number ?? "none"}
        label={A.CANCEL_REASON}
        onCancel={() => setCancelling(null)}
        onConfirm={(reason) => run(() => cancelMySubOrder(cancelling.number, reason), A.CANCELLED).then(() => setCancelling(null))}
        open={Boolean(cancelling)}
        title={A.CANCEL_SHIPMENT}
      />
      {returning && <ReturnModal context={returning} onClose={() => setReturning(null)} onDone={() => { setReturning(null); setTab("returns"); reload(); }} />}
    </Container>
  );
}

function SubOrder({ address, now, onCancel, onInvoice, onReturn, returnWindowDays, sub }) {
  const [open, setOpen] = useState(false);
  const canCancel = ["confirmed", "processing"].includes(sub.status);
  const windowOpen = sub.status === "delivered" && now - new Date(sub.deliveredAt).getTime() < returnWindowDays * DAY;
  return (
    <section className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold"><Truck aria-hidden className="size-4 text-brand-600" />{A.SUB_ORDER_FROM(sub.storeName)}<span className="font-mono text-xs font-normal text-muted">{sub.number}</span></p>
        <StatusBadge status={sub.status} />
      </div>
      {sub.trackingNumber && <p className="mb-3 text-xs text-muted">{sub.carrier} · {sub.trackingNumber}{sub.deliveredAt ? ` · ${A.DELIVERED_ON(formatDate(sub.deliveredAt))}` : ""}</p>}
      <ul className="space-y-3">
        {sub.items.map((it) => (
          <li className="flex flex-wrap items-center gap-3 text-sm" key={it.variantId}>
            <SmartImage alt="" className="size-14 rounded-lg bg-slate-50 object-contain p-1" src={it.image} />
            <span className="min-w-0 flex-1"><span className="line-clamp-1 font-medium">{it.name}</span><span className="text-xs text-muted">{it.variantLabel && `${it.variantLabel} · `}× {it.quantity}{it.returnedQuantity ? ` · ${A.RETURNED(it.returnedQuantity)}` : ""}</span></span>
            <span className="tabular">{formatCurrency(it.price * it.quantity)}</span>
            {windowOpen && it.isReturnable !== false && it.returnedQuantity < it.quantity && (
              <Button onClick={() => onReturn(it)} size="sm" variant="ghost"><RotateCcw className="size-4" />{A.REQUEST_RETURN}</Button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button aria-expanded={open} onClick={() => setOpen((v) => !v)} size="sm" variant="outline"><Truck className="size-4" />{open ? EN.TRACKING.HIDE : EN.TRACKING.TRACK}<ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} /></Button>
        {sub.invoiceNumber && <Button onClick={onInvoice} size="sm" variant="outline"><FileText className="size-4" />{A.GST_INVOICE}</Button>}
        {canCancel && <Button onClick={onCancel} size="sm" variant="ghost"><XCircle className="size-4" />{A.CANCEL_SHIPMENT}</Button>}
        <span className="ml-auto text-xs text-muted">{sub.method.name} · GST {formatCurrency(sub.tax.cgst + sub.tax.sgst + sub.tax.igst, { decimals: true })} ({sub.tax.igst ? EN.CHECKOUT.IGST : EN.CHECKOUT.CGST_SGST})</span>
      </div>
      {open && <div className="mt-4 rounded-xl bg-slate-50 p-4"><ShipmentTracker address={address} sub={sub} /></div>}
    </section>
  );
}

function ReturnModal({ context: { item, order, sub }, onClose, onDone }) {
  const [form, setForm] = useState({ description: "", payoutTo: "", quantity: 1, reasonCode: "defective" });
  const [saving, setSaving] = useState(false);
  const cod = order.paymentMethod === "cod";
  const maxQty = item.quantity - (item.returnedQuantity ?? 0);
  const submit = async () => {
    if (form.description.trim().length < 10) return errorToast(A.DESCRIBE_ISSUE);
    if (cod && !/^[\w.-]+@[\w]+$|^\d{9,18}$/.test(form.payoutTo.trim())) return errorToast(A.PAYOUT_INVALID);
    setSaving(true);
    try {
      await requestReturn({ ...form, quantity: Number(form.quantity), subOrderNumber: sub.number, variantId: item.variantId });
      successToast(A.RETURN_REQUESTED);
      onDone();
    } catch (err) { errorToast(getErrorMessage(err)); setSaving(false); }
  };
  return (
    <Modal onClose={onClose} open title={A.REQUEST_RETURN}>
      <p className="mb-4 text-sm"><b>{item.name}</b>{item.variantLabel && ` · ${item.variantLabel}`}</p>
      <div className="space-y-4">
        <FormSelect label={A.RETURN_REASON} name="reasonCode" onChange={(e) => setForm((f) => ({ ...f, reasonCode: e.target.value }))} options={Object.entries(A.REASONS).map(([value, label]) => ({ label, value }))} value={form.reasonCode} />
        {maxQty > 1 && <FormSelect label={EN.PRODUCT.QUANTITY} name="quantity" onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} options={Array.from({ length: maxQty }, (_, i) => ({ label: String(i + 1), value: i + 1 }))} value={form.quantity} />}
        <FormTextarea label={A.DESCRIBE} name="description" onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder={A.DESCRIBE_PLACEHOLDER} rows={3} value={form.description} />
        {cod && (
          <label className="block text-sm font-medium">{A.PAYOUT_LABEL}
            <input className="mt-1.5 h-11 w-full rounded-lg border border-line px-3 text-sm" onChange={(e) => setForm((f) => ({ ...f, payoutTo: e.target.value }))} placeholder="name@okaxis" value={form.payoutTo} />
            <span className="mt-1 block text-xs font-normal text-muted">{A.PAYOUT_HINT}</span>
          </label>
        )}
        <p className="text-xs text-muted">{cod ? A.REFUND_COD_NOTE : A.REFUND_ONLINE_NOTE}</p>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onClose} variant="ghost">{EN.COMMON.CANCEL}</Button>
        <Button loading={saving} onClick={submit}>{A.SUBMIT_RETURN}</Button>
      </div>
    </Modal>
  );
}
