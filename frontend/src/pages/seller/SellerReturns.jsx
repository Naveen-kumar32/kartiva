import { Check, FileText, Info, PackageCheck, Truck, Undo2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { actOnSellerReturn, getSellerReturns } from "@/api";
import { getDb } from "@/api/mockDb";
import {
  Badge, Button, EmptyState, ErrorState, Modal, PageHeader, PageLoader, Panel, PromptDialog, StatusBadge, Tabs, Timeline,
} from "@/components";
import { PLATFORM, STORES } from "@/data";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { errorToast, formatCurrency, formatDateTime, getErrorMessage, successToast } from "@/utils";

const H = EN.SELLER_HUB;
const GROUPS = {
  all: () => true,
  approved: (r) => ["approved", "in_transit"].includes(r.status),
  done: (r) => ["received", "refunded"].includes(r.status),
  rejected: (r) => ["rejected", "cancelled"].includes(r.status),
  requested: (r) => r.status === "requested",
};

function ReceiveModal({ onCancel, onConfirm, open, ret }) {
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);
  return (
    <Modal onClose={onCancel} open={open} title={H.MARK_RECEIVED}>
      <p className="text-sm text-muted">{ret?.paymentMethod === "cod" ? H.RECEIVE_COD_NOTE(formatCurrency(ret?.refundAmount ?? 0)) : H.RECEIVE_ONLINE_NOTE(formatCurrency(ret?.refundAmount ?? 0))}</p>
      <label className="mt-4 flex items-center gap-2 text-sm font-medium">
        <input checked={restock} className="size-4 accent-brand-600" onChange={(e) => setRestock(e.target.checked)} type="checkbox" />{H.ADD_BACK_TO_STOCK}
      </label>
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onCancel} variant="ghost">{EN.COMMON.CANCEL}</Button>
        <Button loading={busy} onClick={async () => { setBusy(true); await onConfirm({ restock }); setBusy(false); }}><PackageCheck className="size-4" />{H.MARK_RECEIVED}</Button>
      </div>
    </Modal>
  );
}

export function SellerReturns() {
  useDocumentTitle(EN.SELLER.NAV_RETURNS);
  const { user } = useAuth();
  const storeSlug = user.storeSlug;
  const { data, error, loading, reload, setData } = useAsync(() => getSellerReturns(storeSlug), [storeSlug]);
  const [tab, setTab] = useState("requested");
  const [dialog, setDialog] = useState(null); // { kind, ret }

  const counts = useMemo(() => Object.fromEntries(Object.entries(GROUPS).map(([k, fn]) => [k, (data ?? []).filter(fn).length])), [data]);
  const rows = (data ?? []).filter(GROUPS[tab]);

  const act = async (ret, action, details, message) => {
    try {
      await actOnSellerReturn(storeSlug, ret.id, action, details);
      setData(await getSellerReturns(storeSlug));
      successToast(message);
      setDialog(null);
    } catch (err) {
      errorToast(getErrorMessage(err));
    }
  };

  const creditNote = async (ret) => {
    const order = getDb().orders.find((o) => o.number === ret.orderNumber);
    const sub = order?.subOrders.find((s) => s.number === ret.subOrderNumber);
    if (!sub) return errorToast(EN.ERRORS.FALLBACK);
    const { downloadCreditNote } = await import("@/utils/documents");
    downloadCreditNote({ order, platform: PLATFORM, ret, store: STORES.find((s) => s.slug === storeSlug), sub });
    return null;
  };

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-6">
      <PageHeader subtitle={H.RETURNS_SUBTITLE(PLATFORM.defaultReturnWindowDays)} title={EN.SELLER.NAV_RETURNS} />
      <Panel>
        <p className="flex gap-2 text-sm text-muted"><Info aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-600" />{H.RETURNS_EXPLAINER}</p>
      </Panel>
      <Tabs
        onChange={setTab}
        tabs={[
          { count: counts.requested, label: H.TAB_TO_REVIEW, value: "requested" },
          { count: counts.approved, label: H.TAB_IN_PROGRESS, value: "approved" },
          { count: counts.done, label: H.TAB_COMPLETED, value: "done" },
          { count: counts.rejected, label: EN.ORDER.STATUS.rejected, value: "rejected" },
          { count: counts.all, label: EN.COMMON.ALL, value: "all" },
        ]}
        value={tab}
      />
      {rows.length === 0 ? <EmptyState body={H.NO_RETURNS_BODY} icon={Undo2} title={H.NO_RETURNS} /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((ret) => (
            <article className="rounded-2xl bg-white p-5 shadow-card" key={ret.id}>
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-muted">{ret.number} · {ret.subOrderNumber}</p>
                  <h2 className="mt-1 font-semibold">{ret.items[0].name}</h2>
                  <p className="text-sm text-muted">{ret.items[0].variantLabel && `${ret.items[0].variantLabel} · `}{H.QTY(ret.items[0].quantity)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {ret.escalated && <Badge tone="danger">{EN.ORDER.STATUS.escalated}</Badge>}
                  <StatusBadge status={ret.status} />
                </div>
              </header>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <p><span className="block text-xs text-muted">{H.REASON}</span><b>{H.REASONS[ret.reasonCode] ?? ret.reasonCode}</b></p>
                <p><span className="block text-xs text-muted">{H.REFUND_AMOUNT}</span><b className="tabular">{formatCurrency(ret.refundAmount)}</b> · {ret.paymentMethod === "cod" ? H.REFUND_BANK : H.REFUND_GATEWAY}</p>
                <p><span className="block text-xs text-muted">{EN.TABLE.BUYER}</span>{ret.buyer.name}</p>
                <p><span className="block text-xs text-muted">{EN.TABLE.DATE}</span>{formatDateTime(ret.createdAt)}</p>
              </div>
              {ret.description && <blockquote className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm italic text-ink/80">“{ret.description}”</blockquote>}
              {ret.rejectionReason && <p className="mt-3 text-sm text-red-700">{H.REJECTED_REASON(ret.rejectionReason)}</p>}
              {ret.returnTracking && <p className="mt-2 text-xs text-muted">{H.TRACKING_NUMBER}: {ret.returnTracking}</p>}

              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-brand-700">{H.TIMELINE}</summary>
                <div className="mt-3"><Timeline events={ret.timeline} /></div>
              </details>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                {ret.status === "requested" && (
                  <>
                    <Button onClick={() => act(ret, "approve", {}, H.RETURN_APPROVED)} size="sm"><Check className="size-4" />{H.APPROVE}</Button>
                    <Button onClick={() => setDialog({ kind: "reject", ret })} size="sm" variant="outline"><X className="size-4" />{H.REJECT}</Button>
                  </>
                )}
                {ret.status === "approved" && <Button onClick={() => setDialog({ kind: "ship_back", ret })} size="sm" variant="outline"><Truck className="size-4" />{H.MARK_IN_TRANSIT}</Button>}
                {["approved", "in_transit"].includes(ret.status) && <Button onClick={() => setDialog({ kind: "receive", ret })} size="sm"><PackageCheck className="size-4" />{H.MARK_RECEIVED}</Button>}
                {ret.creditNoteNumber && <Button onClick={() => creditNote(ret)} size="sm" variant="outline"><FileText className="size-4" />{H.CREDIT_NOTE}</Button>}
                {ret.status === "received" && ret.paymentMethod === "cod" && <span className="self-center text-xs text-amber-700">{H.AWAITING_BANK_REFUND}</span>}
              </div>
            </article>
          ))}
        </div>
      )}

      <PromptDialog
        body={H.REJECT_RETURN_BODY}
        confirmLabel={H.REJECT}
        danger
        key={`reject-${dialog?.ret.id}`}
        label={H.REASON}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) => act(dialog.ret, "reject", { reason }, H.RETURN_REJECTED)}
        open={dialog?.kind === "reject"}
        title={H.REJECT_RETURN}
      />
      <PromptDialog
        body={H.IN_TRANSIT_BODY}
        confirmLabel={H.MARK_IN_TRANSIT}
        key={`ship-${dialog?.ret.id}`}
        label={H.TRACKING_NUMBER}
        multiline={false}
        onCancel={() => setDialog(null)}
        onConfirm={(trackingNumber) => act(dialog.ret, "ship_back", { trackingNumber }, H.RETURN_IN_TRANSIT)}
        open={dialog?.kind === "ship_back"}
        placeholder="DL1234567890"
        title={H.MARK_IN_TRANSIT}
      />
      <ReceiveModal key={`recv-${dialog?.ret.id}`} onCancel={() => setDialog(null)} onConfirm={(d) => act(dialog.ret, "receive", d, H.RETURN_RECEIVED)} open={dialog?.kind === "receive"} ret={dialog?.ret} />
    </div>
  );
}
