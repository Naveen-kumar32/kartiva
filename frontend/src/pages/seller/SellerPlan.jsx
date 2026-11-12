import { Check, CreditCard, Crown, FileText, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";

import { changeSellerPlan, getSellerPlan } from "@/api";
import {
  Badge, Button, DataTable, ErrorState, Modal, PageHeader, PageLoader, Panel, VerifiedBadges,
} from "@/components";
import { PLATFORM } from "@/data";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { cn, errorToast, formatCurrency, formatDate, getErrorMessage, successToast } from "@/utils";

const M = EN.SELLER_PRO.PLAN;
const GST_RATE = 18;
const SUB_TONE = { active: "success", expired: "neutral", replaced: "neutral" };

function ChangePlanModal({ current, onClose, onDone, plan, storeSlug, actor }) {
  const [step, setStep] = useState("confirm");
  const [busy, setBusy] = useState(false);
  const price = plan?.priceYearly ?? 0;
  const gst = Math.round(price * GST_RATE) / 100;
  const confirm = async (paymentRef) => {
    setBusy(true);
    try {
      await changeSellerPlan(storeSlug, plan.code, { paymentRef }, actor);
      successToast(M.CHANGED(plan.name));
      onDone();
    } catch (err) {
      errorToast(getErrorMessage(err));
      setBusy(false);
    }
  };
  return (
    <Modal onClose={busy ? undefined : onClose} open={Boolean(plan)} title={step === "pay" ? M.PAY_TITLE : M.CONFIRM_TITLE(plan?.name ?? "")}>
      {plan && step === "confirm" && (
        <div className="space-y-4 text-sm">
          <p className="text-muted">{price ? M.CONFIRM_BODY(current?.name ?? "", plan.name) : M.DOWNGRADE_BODY(plan.name)}</p>
          {price > 0 && (
            <dl className="divide-y divide-line rounded-xl ring-1 ring-line">
              <div className="flex justify-between px-4 py-2"><dt>{M.PLAN_FEE}</dt><dd className="tabular">{formatCurrency(price)}</dd></div>
              <div className="flex justify-between px-4 py-2"><dt>{M.GST(GST_RATE)}</dt><dd className="tabular">{formatCurrency(gst, { decimals: true })}</dd></div>
              <div className="flex justify-between px-4 py-2 font-bold"><dt>{M.PAYABLE}</dt><dd className="tabular">{formatCurrency(price + gst, { decimals: true })}</dd></div>
            </dl>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={onClose} variant="ghost">{EN.COMMON.CANCEL}</Button>
            {price > 0 ? <Button onClick={() => setStep("pay")}><CreditCard className="size-4" />{M.PROCEED_PAY}</Button> : <Button loading={busy} onClick={() => confirm(null)} variant="danger">{M.CONFIRM_DOWNGRADE}</Button>}
          </div>
        </div>
      )}
      {plan && step === "pay" && (
        <div className="space-y-4 text-sm">
          <div className="rounded-xl bg-[#0b1f3a] p-4 text-white">
            <p className="text-xs uppercase tracking-wide text-white/70">{M.GATEWAY}</p>
            <p className="mt-1 text-2xl font-bold tabular">{formatCurrency(price + gst, { decimals: true })}</p>
            <p className="text-xs text-white/70">{M.PAYING_FOR(plan.name)}</p>
          </div>
          <p className="text-muted">{EN.ORDER.MOCK_GATEWAY_BODY}</p>
          <div className="flex justify-end gap-2">
            <Button disabled={busy} onClick={() => setStep("confirm")} variant="ghost">{EN.CHECKOUT.BACK}</Button>
            <Button loading={busy} onClick={() => confirm(`pay_${Date.now().toString(36).toUpperCase()}`)}><ShieldCheck className="size-4" />{M.SIMULATE_PAYMENT}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function SellerPlan() {
  useDocumentTitle(EN.SELLER.NAV_PLAN);
  const { user } = useAuth();
  const storeSlug = user.storeSlug;
  const actor = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
  const { data, error, loading, reload, setData } = useAsync(() => getSellerPlan(storeSlug), [storeSlug]);
  const [choosing, setChoosing] = useState(null);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const { credits, history, plans, store, subscription } = data;
  const current = plans.find((p) => p.code === (store.plan ?? "free")) ?? data.plans[0];
  const rank = (p) => p.priceYearly;
  const pct = credits.total ? Math.min(100, (credits.used / credits.total) * 100) : 0;

  const invoice = async (sub) => {
    const { downloadMembershipInvoice } = await import("@/utils/documents");
    downloadMembershipInvoice({ plan: plans.find((p) => p.code === sub.planCode) ?? { leadCredits: null, name: sub.planCode }, platform: PLATFORM, store, subscription: sub });
  };

  return (
    <div className="space-y-6">
      <PageHeader subtitle={M.SUBTITLE} title={EN.SELLER.NAV_PLAN} />

      <section className="overflow-hidden rounded-2xl bg-white shadow-card">
        <div className="flex flex-wrap items-center gap-5 p-5" style={{ background: `linear-gradient(120deg, ${current?.color ?? "#64748b"}14, transparent 70%)` }}>
          <span className="grid size-14 place-items-center rounded-2xl text-white" style={{ background: current?.color }}><Crown aria-hidden className="size-7" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{M.CURRENT}</p>
            <p className="text-xl font-bold">{current?.name}</p>
            <p className="text-sm text-muted">{subscription?.endsAt ? M.RENEWS(formatDate(subscription.endsAt)) : M.NO_EXPIRY}{subscription?.startsAt ? ` · ${M.SINCE(formatDate(subscription.startsAt))}` : ""}</p>
            <VerifiedBadges className="mt-2" store={store} />
          </div>
          <div className="w-full sm:w-64">
            <div className="mb-1 flex justify-between text-sm"><span>{M.CREDITS}</span><b className="tabular">{credits.total == null ? M.UNLIMITED : `${credits.used} / ${credits.total}`}</b></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full rounded-full", pct >= 100 ? "bg-red-500" : "bg-[#14a397]")} style={{ width: `${credits.total == null ? 100 : pct}%` }} /></div>
            <p className="mt-1 text-xs text-muted">{credits.total == null ? M.UNLIMITED_NOTE : M.CREDITS_LEFT(credits.left)}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => {
          const isCurrent = p.code === current?.code;
          const upgrade = rank(p) > rank(current ?? p);
          return (
            <article className={cn("relative flex flex-col rounded-2xl bg-white p-5 shadow-card", isCurrent && "ring-2 ring-brand-500")} key={p.code}>
              {p.code === "gold" && !isCurrent && <span className="absolute -top-2.5 right-4 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-ink"><Sparkles aria-hidden className="size-3" />{M.POPULAR}</span>}
              <p className="flex items-center gap-2 font-bold" style={{ color: p.color }}><Crown aria-hidden className="size-5" />{p.name}</p>
              <p className="mt-3 text-3xl font-bold tabular">{p.priceYearly ? formatCurrency(p.priceYearly) : M.FREE}<span className="text-sm font-medium text-muted">{p.priceYearly ? M.PER_YEAR : ""}</span></p>
              <p className="text-xs text-muted">{p.priceYearly ? M.PLUS_GST(GST_RATE) : M.FOREVER}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {p.features.map((f) => <li className="flex gap-2" key={f}><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-600" />{f}</li>)}
              </ul>
              <div className="mt-5">
                {isCurrent ? <Badge tone="brand">{M.YOUR_PLAN}</Badge> : (
                  <Button fullWidth onClick={() => setChoosing(p)} variant={upgrade ? "primary" : "outline"}>{upgrade ? M.UPGRADE : p.priceYearly ? M.SWITCH : M.DOWNGRADE}</Button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <Panel title={M.BILLING}>
        <DataTable
          columns={[
            { header: M.INVOICE, key: "invoiceNumber", render: (s) => <span className="font-mono text-xs">{s.invoiceNumber ?? "—"}</span> },
            { header: M.PLAN, key: "planCode", render: (s) => plans.find((p) => p.code === s.planCode)?.name ?? s.planCode },
            { header: M.PERIOD, key: "startsAt", render: (s) => `${formatDate(s.startsAt)} – ${s.endsAt ? formatDate(s.endsAt) : "—"}` },
            { header: EN.TABLE.STATUS, key: "status", render: (s) => <Badge tone={SUB_TONE[s.status] ?? "neutral"}>{M.SUB_STATUS[s.status] ?? s.status}</Badge> },
            { align: "right", header: M.AMOUNT_INCL_GST, key: "amount", render: (s) => formatCurrency(s.total ?? s.amount * (1 + GST_RATE / 100), { decimals: true }) },
            { header: "", key: "doc", render: (s) => (s.invoiceNumber && s.amount > 0 ? <Button onClick={() => invoice(s)} size="sm" variant="ghost"><FileText className="size-4" />{M.INVOICE_PDF}</Button> : null) },
          ]}
          empty={M.NO_BILLING}
          rows={history}
        />
      </Panel>

      <ChangePlanModal actor={actor} current={current} key={choosing?.code ?? "none"} onClose={() => setChoosing(null)} onDone={async () => { setChoosing(null); setData(await getSellerPlan(storeSlug)); }} plan={choosing} storeSlug={storeSlug} />
    </div>
  );
}
