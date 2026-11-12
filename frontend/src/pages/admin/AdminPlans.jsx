import { useFormik } from "formik";
import { Check, Crown, Gift, Pencil, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { cancelSubscription, getPlansOverview, grantPlan, savePlan } from "@/api";
import {
  Button, ConfirmDialog, DataTable, EmptyState, ErrorState, FormInput, FormSelect, FormTextarea, Modal, PageHeader, PageLoader, Panel, SearchInput, ShareBars, Toggle,
} from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { errorToast, formatCompactInr, formatCurrency, formatDate, formatNumber, getErrorMessage, infoToast, successToast } from "@/utils";
import { createGrantPlanSchema, createPlanSchema } from "@/validators";

import { FilterBar, FilterSelect, KpiStrip, Pill, SrHeader } from "./opsShared";
import { useActor } from "./opsUtils";

const P = EN.ADMIN_PRO.PLANS;
const C = EN.ADMIN_PRO.COMMON;
const SUB_TONE = { active: "success", cancelled: "danger", expired: "neutral", replaced: "neutral" };
const MONTHS = [1, 3, 6, 12, 24];

export function AdminPlans() {
  useDocumentTitle(P.TITLE);
  const actor = useActor();
  const { data, error, loading, reload, setData } = useAsync(getPlansOverview, []);
  const [editing, setEditing] = useState(null);
  const [granting, setGranting] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState({ plan: "", status: "active" });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.subscriptions ?? []).filter((s) => (!filters.plan || s.planCode === filters.plan) && (!filters.status || s.status === filters.status) && (!term || s.storeName.toLowerCase().includes(term)));
  }, [data, filters, q]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const refresh = async () => setData(await getPlansOverview());
  const { kpis } = data;

  return (
    <div className="space-y-6">
      <PageHeader actions={<Button onClick={() => setGranting({})}><Gift className="size-4" />{P.GRANT}</Button>} subtitle={P.SUBTITLE} title={P.TITLE} />

      <Panel title={P.STREAMS_TITLE}>
        <div className="grid gap-3 sm:grid-cols-3">
          {data.streams.map((s) => (
            <div className={`rounded-xl border p-4 ${s.key === "memberships" ? "border-violet-200 bg-violet-50/50" : "border-line"}`} key={s.key}>
              <p className="text-xs text-muted">{P.STREAM[s.key]}</p>
              <p className="mt-1 text-xl font-bold tabular">{formatCompactInr(s.value)}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#14a397]" style={{ width: `${s.share}%` }} /></div>
              <p className="mt-1 text-xs text-muted">{P.STREAM_SHARE(s.share)}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">{P.STREAMS_NOTE}</p>
      </Panel>

      <KpiStrip className="xl:grid-cols-4" items={[
        [P.KPI_PAID, formatNumber(kpis.activePaid)],
        [P.KPI_ARR, formatCurrency(kpis.arr), "success"],
        [P.KPI_RENEWALS, formatNumber(kpis.renewalsDue), kpis.renewalsDue ? "warning" : undefined],
        [P.KPI_COLLECTED, formatCurrency(kpis.collected)],
      ]} />

      <div className="grid gap-6 2xl:grid-cols-[2fr_1fr]">
        <div className="grid gap-4 md:grid-cols-3">
          {data.plans.map((plan) => (
            <article className="flex flex-col rounded-2xl bg-white p-5 shadow-card" key={plan.id} style={{ borderTop: `4px solid ${plan.color}` }}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="flex items-center gap-1.5 font-semibold"><Crown aria-hidden className="size-4" style={{ color: plan.color }} />{plan.name}</h2>
                <Pill className="whitespace-nowrap" tone={plan.isActive ? "success" : "neutral"}>{plan.isActive ? P.ACTIVE : P.HIDDEN}</Pill>
              </div>
              <p className="mt-2 text-2xl font-bold tabular">{plan.priceYearly ? formatCurrency(plan.priceYearly) : P.FREE}<span className="text-xs font-normal text-muted">{plan.priceYearly ? P.PER_YEAR : ""}</span></p>
              <p className="mt-1 text-xs text-muted">{P.CREDITS(plan.leadCredits ?? C.UNLIMITED)} · {P.DISCOUNT(plan.commissionDiscount)}</p>
              <ul className="mt-3 flex-1 space-y-1.5 text-sm">
                {plan.features.map((f) => <li className="flex gap-2" key={f}><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-600" />{f}</li>)}
              </ul>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                <span className="flex items-center gap-1 text-xs text-muted"><Users aria-hidden className="size-3.5" />{P.SUBSCRIBERS(data.mix.find((m) => m.code === plan.code)?.count ?? 0)}</span>
                <Button onClick={() => setEditing(plan)} size="sm" variant="outline"><Pencil className="size-4" />{P.EDIT}</Button>
              </div>
            </article>
          ))}
        </div>
        <Panel title={P.MIX}>
          <ShareBars items={data.mix.map((m) => ({ label: `${m.name} (${m.count})`, share: m.share }))} />
        </Panel>
      </div>

      <Panel title={P.SUBSCRIPTIONS}>
        <FilterBar>
          <SearchInput className="w-full sm:w-64" onChange={setQ} placeholder={P.SEARCH} value={q} />
          <FilterSelect label={P.ALL_PLANS} onChange={(v) => setFilters((f) => ({ ...f, plan: v }))} options={data.plans.map((p) => [p.code, p.name])} value={filters.plan} />
          <FilterSelect label={C.ALL_STATUSES} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} options={Object.keys(SUB_TONE).map((s) => [s, P.SUB_STATUS[s]])} value={filters.status} />
        </FilterBar>
        {rows.length === 0 ? <EmptyState body={C.NO_MATCHES_BODY} icon={Crown} title={C.NO_MATCHES} /> : (
          <DataTable
            columns={[
              { header: C.STORE, key: "storeName", render: (s) => <span className="font-medium">{s.storeName}</span> },
              { header: P.COL_PLAN, key: "planName", render: (s) => <>{s.planName}{s.complimentary && <span className="block text-xs text-violet-700">{P.COMPLIMENTARY}</span>}</> },
              { align: "right", header: P.COL_AMOUNT, key: "amount", render: (s) => (s.amount ? formatCurrency(s.amount) : "—") },
              { header: P.COL_STARTS, key: "startsAt", render: (s) => <span className="whitespace-nowrap">{formatDate(s.startsAt)}</span> },
              { header: P.COL_ENDS, key: "endsAt", render: (s) => (s.endsAt ? <span className={s.renewalDue ? "whitespace-nowrap font-semibold text-amber-700" : "whitespace-nowrap"}>{formatDate(s.endsAt)}{s.renewalDue && <span className="block text-xs">{P.RENEWAL_DUE}</span>}</span> : "—") },
              { align: "right", header: P.COL_CREDITS, key: "leadCreditsUsed", render: (s) => `${formatNumber(s.leadCreditsUsed)} / ${s.leadCredits ?? "∞"}` },
              { header: C.STATUS, key: "status", render: (s) => <Pill tone={SUB_TONE[s.status] ?? "neutral"}>{P.SUB_STATUS[s.status] ?? s.status}</Pill> },
              { header: <SrHeader>{C.ACTIONS}</SrHeader>, key: "actions", render: (s) => s.status === "active" && s.planCode !== "free" && (
                <span className="flex justify-end gap-1">
                  <Button onClick={() => setGranting({ planCode: s.planCode, storeSlug: s.storeSlug })} size="sm" variant="ghost">{P.EXTEND}</Button>
                  <Button onClick={() => setCancelling(s)} size="sm" variant="outline">{P.CANCEL_SUB}</Button>
                </span>
              ) },
            ]}
            rows={rows}
          />
        )}
      </Panel>

      {editing && <PlanModal key={editing.id} onClose={() => setEditing(null)} onSaved={async () => { await refresh(); setEditing(null); }} actor={actor} plan={editing} />}
      {granting && <GrantModal actor={actor} initial={granting} onClose={() => setGranting(null)} onSaved={async () => { await refresh(); setGranting(null); }} plans={data.plans.filter((p) => p.code !== "free")} stores={data.stores} />}
      <ConfirmDialog
        body={cancelling ? P.CANCEL_BODY(cancelling.storeName, cancelling.planName) : ""}
        confirmLabel={P.CANCEL_SUB}
        danger
        loading={busy}
        onCancel={() => setCancelling(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await cancelSubscription(cancelling.id, actor);
            await refresh();
            infoToast(P.CANCELLED(cancelling.storeName));
            setCancelling(null);
          } catch (err) {
            errorToast(getErrorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
        open={Boolean(cancelling)}
        title={P.CANCEL_TITLE}
      />
    </div>
  );
}

function PlanModal({ actor, onClose, onSaved, plan }) {
  const formik = useFormik({
    initialValues: { commissionDiscount: plan.commissionDiscount, features: plan.features.join("\n"), isActive: plan.isActive, leadCredits: plan.leadCredits ?? "", name: plan.name, priceYearly: plan.priceYearly },
    onSubmit: async (values) => {
      try {
        await savePlan({ ...values, features: values.features.split("\n"), id: plan.id }, actor);
        successToast(P.SAVED(values.name));
        await onSaved();
      } catch (err) {
        errorToast(getErrorMessage(err));
      }
    },
    validationSchema: createPlanSchema(EN.VALIDATION, P.VALIDATION),
  });
  const field = (name) => ({ error: formik.errors[name], name, onBlur: formik.handleBlur, onChange: formik.handleChange, touched: formik.touched[name], value: formik.values[name] });
  return (
    <Modal onClose={onClose} open title={P.EDIT_TITLE(plan.name)}>
      <form className="space-y-3" noValidate onSubmit={formik.handleSubmit}>
        <FormInput label={P.F_NAME} {...field("name")} />
        <div className="grid grid-cols-2 gap-3">
          <FormInput disabled={plan.code === "free"} inputMode="numeric" label={P.F_PRICE} {...field("priceYearly")} />
          <FormInput inputMode="numeric" label={P.F_DISCOUNT} {...field("commissionDiscount")} />
        </div>
        <FormInput hint={P.F_CREDITS_HINT} inputMode="numeric" label={P.F_CREDITS} {...field("leadCredits")} />
        <FormTextarea label={P.F_FEATURES} rows={5} {...field("features")} />
        <label className="flex items-center gap-3 text-sm">
          <Toggle checked={formik.values.isActive} disabled={plan.code === "free"} label={P.F_ACTIVE} onChange={(v) => formik.setFieldValue("isActive", v)} />{P.F_ACTIVE}
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} variant="ghost">{C.CANCEL}</Button>
          <Button loading={formik.isSubmitting} type="submit">{C.SAVE}</Button>
        </div>
      </form>
    </Modal>
  );
}

function GrantModal({ actor, initial, onClose, onSaved, plans, stores }) {
  const formik = useFormik({
    initialValues: { months: 12, planCode: initial.planCode ?? plans[0]?.code ?? "", storeSlug: initial.storeSlug ?? "" },
    onSubmit: async (values) => {
      try {
        await grantPlan({ ...values, months: Number(values.months) }, actor);
        successToast(P.GRANTED(stores.find((s) => s.slug === values.storeSlug)?.name, plans.find((p) => p.code === values.planCode)?.name));
        await onSaved();
      } catch (err) {
        errorToast(getErrorMessage(err));
      }
    },
    validationSchema: createGrantPlanSchema(EN.VALIDATION),
  });
  const field = (name) => ({ error: formik.errors[name], name, onBlur: formik.handleBlur, onChange: formik.handleChange, touched: formik.touched[name], value: formik.values[name] });
  return (
    <Modal onClose={onClose} open title={initial.storeSlug ? P.EXTEND_TITLE : P.GRANT}>
      <p className="mb-3 text-sm text-muted">{P.GRANT_BODY}</p>
      <form className="space-y-3" noValidate onSubmit={formik.handleSubmit}>
        <FormSelect label={C.STORE} options={stores.map((s) => ({ label: `${s.name} · ${s.plan}`, value: s.slug }))} placeholder={EN.COMMON.SELECT} {...field("storeSlug")} />
        <FormSelect label={P.COL_PLAN} options={plans.map((p) => ({ label: p.name, value: p.code }))} {...field("planCode")} />
        <FormSelect label={P.F_MONTHS} options={MONTHS.map((m) => ({ label: P.MONTHS(m), value: m }))} {...field("months")} />
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} variant="ghost">{C.CANCEL}</Button>
          <Button loading={formik.isSubmitting} type="submit"><Gift className="size-4" />{P.GRANT_CONFIRM}</Button>
        </div>
      </form>
    </Modal>
  );
}
