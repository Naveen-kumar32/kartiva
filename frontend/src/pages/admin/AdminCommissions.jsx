import { useFormik } from "formik";
import { Calculator, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { deleteCommissionRule, getCommissionRules, saveCommissionRule } from "@/api";
import {
  Button, ConfirmDialog, ErrorState, FormInput, FormSelect, KeyValue, Modal, PageHeader, PageLoader, Panel, Select, Toggle,
} from "@/components";
import { CATEGORIES, PLATFORM, STORES } from "@/data";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { errorToast, formatCurrency, getErrorMessage, successToast } from "@/utils";
import { resolveCommissionRate } from "@/utils/orderMath";
import { createCommissionRuleSchema } from "@/validators";

import { IconAction } from "./opsShared";

const O = EN.ADMIN_OPS;
const categoryName = (slug) => CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;
const storeName = (slug) => STORES.find((s) => s.slug === slug)?.name ?? slug;

export function AdminCommissions() {
  useDocumentTitle(O.COMMISSIONS_TITLE);
  const { data: rules, error, loading, reload, setData } = useAsync(getCommissionRules, []);
  const [editing, setEditing] = useState(null); // { scope, rule? }
  const [toDelete, setToDelete] = useState(null);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const save = async (rule, message) => {
    try {
      setData([...(await saveCommissionRule(rule))]);
      successToast(message);
      return true;
    } catch (err) {
      errorToast(getErrorMessage(err));
      return false;
    }
  };
  const global = rules.find((r) => r.scope === "global");
  const byScope = (scope) => rules.filter((r) => r.scope === scope);

  return (
    <div className="space-y-6">
      <PageHeader subtitle={O.COMMISSIONS_SUBTITLE} title={O.COMMISSIONS_TITLE} />
      <ol className="grid gap-3 text-sm sm:grid-cols-3">
        {O.RESOLUTION_STEPS.map((step, i) => (
          <li className="flex gap-3 rounded-xl bg-white p-4 shadow-card" key={step.title}>
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">{i + 1}</span>
            <span><b className="block">{step.title}</b><span className="text-muted">{step.body}</span></span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">{O.NEW_ORDERS_ONLY}</p>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Panel title={O.GLOBAL_DEFAULT}>
            <GlobalRateForm key={global?.rate} onSave={(rate) => save({ ...global, rate }, O.GLOBAL_SAVED(rate))} rate={global?.rate ?? 10} />
          </Panel>
          {[["category", O.CATEGORY_OVERRIDES, categoryName], ["store", O.STORE_OVERRIDES, storeName]].map(([scope, title, nameOf]) => (
            <Panel action={<Button onClick={() => setEditing({ scope })} size="sm" variant="outline"><Plus className="size-4" />{O.ADD_OVERRIDE}</Button>} key={scope} title={title}>
              {byScope(scope).length === 0 ? <p className="text-sm text-muted">{O.NO_OVERRIDES}</p> : (
                <ul className="divide-y divide-line">
                  {byScope(scope).map((r) => (
                    <li className="flex items-center gap-3 py-2.5 text-sm" key={r.id}>
                      <span className="min-w-0 flex-1 font-medium">{nameOf(r.categorySlug ?? r.storeSlug)}</span>
                      <span className="w-16 text-right text-base font-bold tabular">{r.rate}%</span>
                      <Toggle checked={r.isActive !== false} label={O.RULE_ACTIVE(nameOf(r.categorySlug ?? r.storeSlug))} onChange={(v) => save({ ...r, isActive: v }, v ? O.RULE_ENABLED : O.RULE_DISABLED)} />
                      <IconAction icon={Pencil} label={O.EDIT_ITEM(nameOf(r.categorySlug ?? r.storeSlug))} onClick={() => setEditing({ rule: r, scope })} />
                      <IconAction danger icon={Trash2} label={O.DELETE_ITEM(nameOf(r.categorySlug ?? r.storeSlug))} onClick={() => setToDelete(r)} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ))}
        </div>
        <PayoutCalculator rules={rules} />
      </div>

      {editing && (
        <RuleForm
          key={editing.rule?.id ?? editing.scope}
          onClose={() => setEditing(null)}
          onSave={async (rule, label) => { if (await save(rule, O.OVERRIDE_SAVED(label, rule.rate))) setEditing(null); }}
          rule={editing.rule}
          rules={rules}
          scope={editing.scope}
        />
      )}
      <ConfirmDialog
        body={toDelete ? O.DELETE_RULE_BODY(categoryName(toDelete.categorySlug ?? "") || storeName(toDelete.storeSlug ?? "")) : ""}
        confirmLabel={O.DELETE}
        danger
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          try {
            setData([...(await deleteCommissionRule(toDelete.id))]);
            successToast(O.RULE_DELETED);
          } catch (err) {
            errorToast(getErrorMessage(err));
          }
          setToDelete(null);
        }}
        open={Boolean(toDelete)}
        title={O.DELETE_RULE}
      />
    </div>
  );
}

function GlobalRateForm({ onSave, rate }) {
  const [value, setValue] = useState(String(rate));
  const n = Number(value);
  const invalid = value === "" || Number.isNaN(n) || n < 0 || n > 100;
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (!invalid) onSave(n); }}>
      <FormInput className="w-40" error={O.VALIDATION.RATE_RANGE} hint={O.GLOBAL_HINT} inputMode="decimal" label={O.RATE_PERCENT} max={100} min={0} name="globalRate" onChange={(e) => setValue(e.target.value)} step="0.5" touched={invalid} type="number" value={value} />
      <Button disabled={invalid || n === rate} type="submit">{EN.COMMON.SAVE}</Button>
    </form>
  );
}

function RuleForm({ onClose, onSave, rule, rules, scope }) {
  const taken = new Set(rules.filter((r) => r.scope === scope && r.id !== rule?.id).map((r) => r.categorySlug ?? r.storeSlug));
  const options = scope === "category"
    ? CATEGORIES.filter((c) => !taken.has(c.slug)).map((c) => ({ group: c.parentId ? CATEGORIES.find((r) => r.id === c.parentId)?.name : CATEGORIES.find((r) => r.id === c.id)?.name, label: c.parentId ? c.name : `${c.name} (all)`, value: c.slug }))
    : STORES.filter((s) => !taken.has(s.slug)).map((s) => ({ label: s.name, value: s.slug }));
  const formik = useFormik({
    initialValues: { rate: rule?.rate ?? "", target: rule?.categorySlug ?? rule?.storeSlug ?? "" },
    onSubmit: ({ rate, target }) => {
      const label = scope === "category" ? categoryName(target) : storeName(target);
      return onSave({ ...rule, categorySlug: scope === "category" ? target : undefined, isActive: rule?.isActive ?? true, rate: Number(rate), scope, storeSlug: scope === "store" ? target : undefined }, label);
    },
    validationSchema: createCommissionRuleSchema({ ...EN.VALIDATION, ...O.VALIDATION }),
  });
  const { errors, handleBlur, handleChange, handleSubmit, isSubmitting, touched, values } = formik;
  return (
    <Modal onClose={onClose} open title={rule ? O.EDIT_OVERRIDE : scope === "category" ? O.NEW_CATEGORY_OVERRIDE : O.NEW_STORE_OVERRIDE}>
      <form className="space-y-4" noValidate onSubmit={handleSubmit}>
        <FormSelect disabled={Boolean(rule)} error={errors.target} label={scope === "category" ? O.COL_CATEGORY : O.COL_STORE} name="target" onBlur={handleBlur} onChange={handleChange} options={options} placeholder="—" touched={touched.target} value={values.target} />
        <FormInput error={errors.rate} inputMode="decimal" label={O.RATE_PERCENT} name="rate" onBlur={handleBlur} onChange={handleChange} step="0.5" touched={touched.rate} type="number" value={values.rate} />
        {scope === "category" && <p className="text-xs text-muted">{O.CATEGORY_RULE_HINT}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">{EN.COMMON.CANCEL}</Button>
          <Button loading={isSubmitting} type="submit">{EN.COMMON.SAVE}</Button>
        </div>
      </form>
    </Modal>
  );
}

function PayoutCalculator({ rules }) {
  const leaves = CATEGORIES.filter((c) => c.parentId);
  const [price, setPrice] = useState("1000");
  const [categorySlug, setCategorySlug] = useState(leaves[0]?.slug ?? "");
  const [storeSlug, setStoreSlug] = useState((STORES.find((s) => !s.isPlatformOwned) ?? STORES[0])?.slug ?? "");
  const [method, setMethod] = useState("online");

  const amount = Math.max(0, Number(price) || 0);
  const category = CATEGORIES.find((c) => c.slug === categorySlug);
  const gstRate = category?.defaultGstRate ?? 18;
  const rate = resolveCommissionRate(rules, { categorySlug, storeSlug }, CATEGORIES);
  const commission = (amount * rate) / 100;
  const commissionGst = (commission * PLATFORM.commissionGstRate) / 100;
  const taxable = (amount * 100) / (100 + gstRate);
  const tcs = (taxable * PLATFORM.tcsRate) / 100;
  const tds = (amount * PLATFORM.tdsRate) / 100;
  const deductions = commission + commissionGst + tcs + tds;
  const money = (n) => formatCurrency(n, { decimals: true });

  return (
    <Panel className="h-fit xl:sticky xl:top-24" title={<span className="flex items-center gap-2"><Calculator aria-hidden className="size-5 text-brand-600" />{O.CALCULATOR}</span>}>
      <div className="space-y-3">
        <FormInput inputMode="numeric" label={O.ITEM_PRICE} min={0} name="calcPrice" onChange={(e) => setPrice(e.target.value)} type="number" value={price} />
        <div className="text-sm font-medium"><p className="mb-1.5">{O.COL_CATEGORY}</p>
          <Select ariaLabel={O.COL_CATEGORY} onChange={setCategorySlug} options={leaves.map((c) => ({ group: CATEGORIES.find((r) => r.id === c.parentId)?.name, label: c.name, value: c.slug }))} value={categorySlug} />
        </div>
        <div className="text-sm font-medium"><p className="mb-1.5">{O.COL_STORE}</p>
          <Select ariaLabel={O.COL_STORE} onChange={setStoreSlug} options={STORES.map((s) => ({ label: s.name, value: s.slug }))} value={storeSlug} />
        </div>
        <fieldset className="flex gap-2 text-sm">
          <legend className="mb-1.5 font-medium">{O.COL_PAYMENT}</legend>
          {[["online", O.ONLINE], ["cod", "COD"]].map(([v, l]) => (
            <label className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 py-2 ${method === v ? "border-brand-600 bg-brand-50" : "border-line"}`} key={v}>
              <input checked={method === v} className="sr-only" name="calcMethod" onChange={() => setMethod(v)} type="radio" />{l}
            </label>
          ))}
        </fieldset>
      </div>
      <div className="mt-5 rounded-xl bg-slate-50 p-3">
        <KeyValue items={[
          [O.RESOLVED_RATE, <b key="r">{rate}%</b>],
          [O.COL_COMMISSION, `− ${money(commission)}`],
          [O.GST_ON_COMMISSION(PLATFORM.commissionGstRate), `− ${money(commissionGst)}`],
          [O.TCS_LINE(PLATFORM.tcsRate, gstRate), `− ${money(tcs)}`],
          [O.TDS_LINE(PLATFORM.tdsRate), `− ${money(tds)}`],
          [O.SELLER_NET, <b className="text-emerald-700" key="n">{money(amount - deductions)}</b>],
          [O.PLATFORM_EARNS, money(commission + commissionGst)],
        ]} />
      </div>
      <p className="mt-3 text-xs text-muted">{method === "cod" ? O.COD_CALC_NOTE(money(deductions)) : O.ONLINE_CALC_NOTE}</p>
    </Panel>
  );
}
