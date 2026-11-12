import { RotateCcw } from "lucide-react";
import { useState } from "react";

import { getPlatformSettings, resetDemoData, savePlatformSettings } from "@/api";
import { Button, ConfirmDialog, FormInput, PageHeader, PageLoader, Panel, Toggle } from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast, successToast } from "@/utils/toast";

const A = EN.ADMIN;
const T = EN.ADMIN_TOOLS;
const NUMBER_FIELDS = ["codFee", "codMaxOrderValue", "commissionGstRate", "defaultCommissionRate", "defaultReturnWindowDays", "lowStockThreshold", "orderPaymentTimeoutMinutes", "tcsRate", "tdsRate"];

export function AdminSettings() {
  useDocumentTitle(A.PLATFORM_SETTINGS);
  const { data, loading } = useAsync(getPlatformSettings, []);
  if (loading) return <PageLoader />;
  return <SettingsForm initial={data} />;
}

function SettingsForm({ initial }) {
  const [form, setForm] = useState({ ...initial, gstRateChoices: initial.gstRateChoices.join(", ") });
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const field = (key, label, props = {}) => <FormInput label={label} name={key} onChange={set(key)} value={form[key]} {...props} />;

  const save = async (e) => {
    e.preventDefault();
    const slabs = String(form.gstRateChoices).split(/[\s,]+/).filter(Boolean).map(Number);
    if (slabs.some((n) => Number.isNaN(n) || n < 0 || n > 100)) return errorToast(T.SLABS_INVALID);
    setSaving(true);
    try {
      const patch = { ...form, gstRateChoices: slabs };
      NUMBER_FIELDS.forEach((k) => { patch[k] = Number(patch[k]); });
      await savePlatformSettings(patch);
      successToast(T.SETTINGS_SAVED);
    } catch (err) { errorToast(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form className="max-w-4xl space-y-6" onSubmit={save}>
      <PageHeader actions={<Button loading={saving} type="submit">{A.SAVE_SETTINGS}</Button>} subtitle={A.SAMPLE_NOTE} title={A.PLATFORM_SETTINGS} />
      <Panel title={A.SETTINGS_COMPANY}>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("legalName", A.FIELD_LEGAL_NAME, { className: "sm:col-span-2" })}
          {field("gstin", A.FIELD_GSTIN)}
          {field("supportPhone", A.FIELD_SUPPORT_PHONE)}
          {field("supportEmail", A.FIELD_SUPPORT_EMAIL, { type: "email" })}
          {field("address", A.FIELD_ADDRESS, { className: "sm:col-span-2" })}
        </div>
      </Panel>
      <Panel title={T.CATALOGUE_RULES}>
        <SwitchRow checked={form.productModerationEnabled} description={T.MODERATION_HINT} label={T.MODERATION} onChange={(v) => setForm((f) => ({ ...f, productModerationEnabled: v }))} />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {field("defaultReturnWindowDays", A.FIELD_RETURN_WINDOW, { type: "number" })}
          {field("lowStockThreshold", T.LOW_STOCK_THRESHOLD, { type: "number" })}
          {field("orderPaymentTimeoutMinutes", T.PAYMENT_TIMEOUT, { type: "number" })}
        </div>
      </Panel>
      <Panel title={A.SETTINGS_COMMISSION}>
        <div className="grid gap-4 sm:grid-cols-3">
          {field("defaultCommissionRate", A.FIELD_COMMISSION, { hint: T.COMMISSION_HINT, type: "number" })}
          {field("commissionGstRate", A.FIELD_COMMISSION_GST, { type: "number" })}
          {field("gstRateChoices", A.FIELD_GST_SLABS, { hint: T.SLABS_HINT })}
          {field("tcsRate", A.FIELD_TCS, { step: "0.01", type: "number" })}
          {field("tdsRate", A.FIELD_TDS, { step: "0.01", type: "number" })}
        </div>
      </Panel>
      <Panel title={A.SETTINGS_COD}>
        <SwitchRow checked={form.codEnabled} description={T.COD_HINT} label={A.ENABLE_COD} onChange={(v) => setForm((f) => ({ ...f, codEnabled: v }))} />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {field("codMaxOrderValue", A.FIELD_COD_MAX, { type: "number" })}
          {field("codFee", A.FIELD_CODE_FEE, { type: "number" })}
        </div>
      </Panel>
      <Panel className="border border-red-200" title={T.DANGER_ZONE}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-xl text-sm text-muted">{A.RESET_DEMO_BODY}</p>
          <Button onClick={() => setConfirmReset(true)} variant="danger"><RotateCcw className="size-4" />{A.RESET_DEMO}</Button>
        </div>
      </Panel>
      <ConfirmDialog body={A.RESET_DEMO_BODY} confirmLabel={A.RESET_DEMO} danger onCancel={() => setConfirmReset(false)} onConfirm={resetDemoData} open={confirmReset} title={`${A.RESET_DEMO}?`} />
    </form>
  );
}

function SwitchRow({ checked, description, label, onChange }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted">{description}</p></div>
      <Toggle checked={Boolean(checked)} label={label} onChange={onChange} />
    </div>
  );
}
