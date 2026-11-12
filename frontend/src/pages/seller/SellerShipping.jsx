import { useFormik } from "formik";
import { Banknote, MapPin, Pencil, Plus, Store, Trash2, Truck, Zap } from "lucide-react";
import { useState } from "react";

import { deleteShippingMethod, getShippingMethods, saveShippingMethod } from "@/api";
import {
  Badge, Button, ConfirmDialog, ErrorState, FormInput, FormSelect, Modal, PageHeader, PageLoader, Panel, Toggle,
} from "@/components";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { errorToast, formatCurrency, getErrorMessage, successToast } from "@/utils";

const H = EN.SELLER_HUB;
const TYPE_ICON = { express: Zap, local_delivery: MapPin, standard: Truck, store_pickup: Store };
const TYPES = ["standard", "express", "local_delivery", "store_pickup"];
const blank = { codAllowed: true, fee: 49, freeAbove: 499, maxDays: 6, minDays: 3, name: "", pincodes: "", type: "standard" };

function validate(v) {
  const e = {};
  const req = EN.VALIDATION.REQUIRED;
  if (!v.name.trim()) e.name = req;
  if (v.fee === "" || Number(v.fee) < 0) e.fee = H.VALIDATION.POSITIVE;
  if (v.freeAbove !== "" && Number(v.freeAbove) < 0) e.freeAbove = H.VALIDATION.POSITIVE;
  if (v.minDays === "" || Number(v.minDays) < 0) e.minDays = req;
  if (v.maxDays === "" || Number(v.maxDays) < Number(v.minDays)) e.maxDays = H.VALIDATION.MAX_DAYS;
  if (v.pincodes && v.pincodes.split(/[\s,]+/).filter(Boolean).some((p) => !/^[1-9]\d{1,5}$/.test(p))) e.pincodes = H.VALIDATION.PINCODES;
  return e;
}

function MethodForm({ initial, onClose, onSaved, storeSlug }) {
  const formik = useFormik({
    initialValues: { ...initial, freeAbove: initial.freeAbove ?? "", pincodes: (initial.pincodes ?? []).join?.(", ") ?? initial.pincodes ?? "" },
    onSubmit: async (values) => {
      try {
        onSaved(await saveShippingMethod(storeSlug, values));
        successToast(H.METHOD_SAVED);
        onClose();
      } catch (err) {
        errorToast(getErrorMessage(err));
      }
    },
    validate,
  });
  const { errors, handleBlur, handleChange, handleSubmit, isSubmitting, setFieldValue, touched, values } = formik;
  const field = (name, label, props = {}) => <FormInput error={errors[name]} label={label} name={name} onBlur={handleBlur} onChange={handleChange} touched={touched[name]} value={values[name]} {...props} />;
  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit}>
      {field("name", H.METHOD_NAME, { placeholder: H.METHOD_NAME_PLACEHOLDER })}
      <FormSelect label={H.METHOD_TYPE} name="type" onChange={handleChange} options={TYPES.map((t) => ({ label: H.TYPES[t], value: t }))} value={values.type} />
      <div className="grid grid-cols-2 gap-3">
        {field("fee", H.FEE, { inputMode: "numeric" })}
        {field("freeAbove", H.FREE_ABOVE, { hint: H.FREE_ABOVE_HINT, inputMode: "numeric" })}
        {field("minDays", H.MIN_DAYS, { inputMode: "numeric" })}
        {field("maxDays", H.MAX_DAYS, { inputMode: "numeric" })}
      </div>
      {field("pincodes", H.PINCODES, { hint: H.PINCODES_HINT, placeholder: "600, 641001" })}
      <div className="flex items-center gap-3">
        <Toggle checked={values.codAllowed} label={H.COD_ALLOWED} onChange={(v) => setFieldValue("codAllowed", v)} />
        <span className="text-sm">{H.COD_ALLOWED}</span>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={onClose} variant="ghost">{EN.COMMON.CANCEL}</Button>
        <Button loading={isSubmitting} type="submit">{EN.COMMON.SAVE}</Button>
      </div>
    </form>
  );
}

export function SellerShipping() {
  useDocumentTitle(EN.SELLER.NAV_SHIPPING);
  const { user } = useAuth();
  const storeSlug = user.storeSlug;
  const { data, error, loading, reload, setData } = useAsync(() => getShippingMethods(storeSlug), [storeSlug]);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const methods = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader actions={<Button onClick={() => setEditing(blank)} size="sm"><Plus className="size-4" />{H.ADD_METHOD}</Button>} subtitle={H.SHIPPING_SUBTITLE} title={EN.SELLER.NAV_SHIPPING} />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          {methods.map((m) => {
            const Icon = TYPE_ICON[m.type] ?? Truck;
            return (
              <article className="flex flex-col rounded-2xl bg-white p-5 shadow-card" key={m.id}>
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon aria-hidden className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold">{m.name}</h2>
                    <p className="text-xs text-muted">{H.TYPES[m.type]}</p>
                  </div>
                  {m.codAllowed ? <Badge tone="success"><Banknote className="size-3" />COD</Badge> : <Badge>{EN.PRODUCT.COD_UNAVAILABLE}</Badge>}
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-muted">{H.FEE}</dt><dd className="font-semibold">{m.fee === 0 ? EN.CART.FREE : formatCurrency(m.fee)}</dd></div>
                  <div><dt className="text-xs text-muted">{H.FREE_ABOVE}</dt><dd className="font-semibold">{m.freeAbove != null ? formatCurrency(m.freeAbove) : "—"}</dd></div>
                  <div><dt className="text-xs text-muted">{H.ETA}</dt><dd className="font-semibold">{EN.COMMON.DAYS(m.minDays, m.maxDays)}</dd></div>
                  <div><dt className="text-xs text-muted">{H.COVERAGE}</dt><dd className="font-semibold">{m.pincodes?.length ? H.PINCODE_COUNT(m.pincodes.length) : H.ALL_INDIA}</dd></div>
                </dl>
                {m.pincodes?.length > 0 && <p className="mt-2 truncate font-mono text-xs text-muted">{m.pincodes.join(", ")}</p>}
                <div className="mt-auto flex gap-2 pt-4">
                  <Button onClick={() => setEditing(m)} size="sm" variant="outline"><Pencil className="size-4" />{H.EDIT}</Button>
                  <Button onClick={() => setToDelete(m)} size="sm" variant="ghost"><Trash2 className="size-4" />{H.DELETE}</Button>
                </div>
              </article>
            );
          })}
        </div>
        <Panel title={H.BUYER_PREVIEW}>
          <p className="mb-3 text-sm text-muted">{H.BUYER_PREVIEW_HINT}</p>
          <div className="space-y-2">
            {methods.map((m, i) => (
              <div className={`flex gap-3 rounded-lg border-2 p-3 text-sm ${i === 0 ? "border-brand-600 bg-brand-50" : "border-line"}`} key={m.id}>
                <span aria-hidden className={`mt-1 size-3.5 shrink-0 rounded-full border-2 ${i === 0 ? "border-brand-600 bg-brand-600 ring-2 ring-inset ring-white" : "border-slate-300"}`} />
                <span className="flex-1">
                  <span className="flex justify-between gap-2 font-semibold"><span>{m.name}</span><span className={m.fee === 0 ? "text-emerald-700" : "tabular"}>{m.fee === 0 ? EN.CART.FREE : formatCurrency(m.fee)}</span></span>
                  <span className="block text-xs text-muted">{EN.COMMON.DAYS(m.minDays, m.maxDays)}{m.codAllowed ? " · COD" : ""}{m.freeAbove != null ? ` · ${EN.PRODUCT.FREE_ABOVE(formatCurrency(m.freeAbove))}` : ""}</span>
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Modal onClose={() => setEditing(null)} open={Boolean(editing)} title={editing?.id ? H.EDIT_METHOD : H.ADD_METHOD}>
        {editing && <MethodForm initial={editing} key={editing.id ?? "new"} onClose={() => setEditing(null)} onSaved={(list) => setData([...list])} storeSlug={storeSlug} />}
      </Modal>
      <ConfirmDialog
        body={H.DELETE_METHOD_BODY}
        confirmLabel={H.DELETE}
        danger
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          try {
            setData([...(await deleteShippingMethod(storeSlug, toDelete.id))]);
            successToast(H.METHOD_DELETED);
          } catch (err) {
            errorToast(getErrorMessage(err));
          }
          setToDelete(null);
        }}
        open={Boolean(toDelete)}
        title={H.DELETE_TITLE(toDelete?.name ?? "")}
      />
    </div>
  );
}
