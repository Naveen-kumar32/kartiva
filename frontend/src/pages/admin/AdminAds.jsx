import { useFormik } from "formik";
import { Check, ImagePlus, Pause, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { deleteAd, getAdManager, saveAd, setAdStatus, setSlotActive, updateSlotRate } from "@/api";
import {
  AdCreative, Badge, Button, ConfirmDialog, DataTable, FormInput, FormSelect, Modal, PageHeader, PageLoader, Panel, ProductCard, PromptDialog, Select, StatCard, StatusBadge, Tabs, Toggle,
} from "@/components";
import { PRODUCTS, STORES } from "@/data";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { getStore, summarizeProduct } from "@/utils/catalog";
import { compressImage } from "@/utils/image";
import { formatCompactInr, formatCurrency, formatNumber, formatPercent } from "@/utils/format";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast, successToast } from "@/utils/toast";
import { createAdSchema } from "@/validators";

const A = EN.ADMIN;
const T = EN.ADMIN_TOOLS;
const PRICING = { cpc: "CPC", cpm: "CPM", fixed: T.PRICING_FIXED, free: T.PRICING_HOUSE };
const TYPE_TONE = { external: "info", house: "brand", seller: "accent" };
const THEMES = [
  ["Kartiva teal", "linear-gradient(115deg,#0b3f3f 0%,#0e7c7b 55%,#14a397 100%)"],
  ["Midnight blue", "linear-gradient(115deg,#0f172a 0%,#1e3a8a 60%,#2563eb 100%)"],
  ["Saffron", "linear-gradient(115deg,#431407 0%,#c2410c 60%,#fb923c 100%)"],
  ["Rose", "linear-gradient(115deg,#500724 0%,#be185d 60%,#f472b6 100%)"],
  ["Violet", "linear-gradient(115deg,#2e1065 0%,#6d28d9 60%,#a78bfa 100%)"],
  ["Forest", "linear-gradient(115deg,#052e16 0%,#166534 60%,#22c55e 100%)"],
  ["Coffee", "linear-gradient(100deg,#451a03,#92400e 60%,#d97706)"],
];
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const productLabel = (id) => PRODUCTS.find((p) => p.id === Number(id))?.name;

export function AdminAds() {
  useDocumentTitle(A.AD_MANAGER);
  const { data, loading, reload } = useAsync(getAdManager, []);
  const [tab, setTab] = useState("ads");
  const [slotFilter, setSlotFilter] = useState("");
  const [editing, setEditing] = useState(null); // null | {} (new) | ad
  const [rateSlot, setRateSlot] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const ads = useMemo(() => (data?.ads ?? []).filter((a) => a.status !== "pending_approval" && a.status !== "rejected" && (!slotFilter || a.slot === slotFilter)), [data, slotFilter]);
  if (loading) return <PageLoader />;
  const { slots } = data;
  const requests = data.ads.filter((a) => a.status === "pending_approval");
  const slotName = (key) => slots.find((s) => s.key === key)?.name ?? key;
  const totals = data.ads.reduce((t, a) => ({ clicks: t.clicks + a.clicks, impressions: t.impressions + a.impressions, spend: t.spend + a.spend }), { clicks: 0, impressions: 0, spend: 0 });

  const act = async (fn, msg) => {
    try { await fn(); reload(); if (msg) successToast(msg); } catch (err) { errorToast(getErrorMessage(err)); }
  };

  return (
    <div className="space-y-6">
      <PageHeader actions={<Button onClick={() => setEditing({})}><Plus className="size-4" />{T.NEW_AD}</Button>} subtitle={T.ADS_SUBTITLE} title={A.AD_MANAGER} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={T.AD_REVENUE} tone="accent" value={formatCompactInr(totals.spend)} />
        <StatCard label={A.ACTIVE_ADS} value={data.ads.filter((a) => a.status === "active").length} />
        <StatCard label={A.IMPRESSIONS} tone="info" value={formatNumber(totals.impressions)} />
        <StatCard label={A.CTR} value={formatPercent((totals.clicks / Math.max(1, totals.impressions)) * 100, 2)} />
      </div>
      <Panel>
        <Tabs className="mb-4" onChange={setTab} tabs={[
          { count: ads.length, label: A.ALL_ADS, value: "ads" },
          { count: requests.length, label: T.SELLER_REQUESTS, value: "requests" },
          { count: slots.length, label: A.AD_SLOTS, value: "slots" },
        ]} value={tab} />

        {tab === "ads" && (
          <>
            <div className="mb-4 w-72 max-w-full"><Select ariaLabel={A.SLOT} onChange={setSlotFilter} options={slots.map((s) => ({ label: s.name, value: s.key }))} placeholder={T.ALL_SLOTS} size="sm" value={slotFilter} /></div>
            <DataTable
              columns={[
                { header: A.ADVERTISER, key: "advertiser", render: (a) => <><b>{a.advertiser}</b><span className="block max-w-64 truncate text-xs text-muted">{a.headline ?? productLabel(a.productId)}</span></> },
                { header: A.TYPE, key: "advertiserType", render: (a) => <Badge tone={TYPE_TONE[a.advertiserType]}>{a.advertiserType}</Badge> },
                { header: A.SLOT, key: "slot", render: (a) => slotName(a.slot) },
                { header: T.SCHEDULE, key: "startsAt", render: (a) => <span className="whitespace-nowrap text-xs">{a.startsAt} → {a.endsAt}</span> },
                { header: A.PRICING, key: "pricing", render: (a) => (a.pricing === "free" ? PRICING.free : `${PRICING[a.pricing]} ${formatCurrency(a.rate)}`) },
                { align: "right", header: A.IMPRESSIONS, key: "impressions", render: (a) => formatNumber(a.impressions) },
                { align: "right", header: A.CTR, key: "ctr", render: (a) => (a.impressions ? formatPercent((a.clicks / a.impressions) * 100, 2) : "—") },
                { align: "right", header: A.SPEND, key: "spend", render: (a) => formatCurrency(a.spend) },
                { header: A.STATUS, key: "status", render: (a) => <StatusBadge status={a.status} /> },
                { header: "", key: "actions", render: (a) => (
                  <span className="flex gap-1">
                    <Button aria-label={T.EDIT} onClick={() => setEditing(a)} size="sm" variant="ghost"><Pencil className="size-4" /></Button>
                    {a.status !== "scheduled" && (
                      <Button aria-label={a.status === "active" ? A.PAUSE : A.RESUME} onClick={() => act(() => setAdStatus(a.id, a.status === "active" ? "paused" : "active"), a.status === "active" ? A.PAUSED_TOAST : A.RESUMED_TOAST)} size="sm" variant="ghost">
                        {a.status === "active" ? <Pause className="size-4" /> : <Play className="size-4" />}
                      </Button>
                    )}
                    <Button aria-label={T.DELETE_AD} onClick={() => setDeleting(a)} size="sm" variant="ghost"><Trash2 className="size-4 text-red-600" /></Button>
                  </span>
                ) },
              ]}
              rows={ads}
            />
          </>
        )}

        {tab === "requests" && (
          requests.length === 0 ? <p className="py-10 text-center text-sm text-muted">{T.NO_REQUESTS}</p> : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {requests.map((a) => {
                const product = PRODUCTS.find((p) => p.id === a.productId);
                return (
                  <div className="rounded-xl border border-line p-4" key={a.id}>
                    <p className="font-semibold">{a.advertiser}</p>
                    <p className="text-xs text-muted">{slotName(a.slot)} · {T.BUDGET} {formatCurrency(a.budget)} · {a.startsAt} → {a.endsAt}</p>
                    {product && <div className="mt-3 max-w-48"><ProductCard product={{ ...product, store: getStore(product.storeSlug), summary: summarizeProduct(product) }} sponsored /></div>}
                    <div className="mt-4 flex gap-2">
                      <Button onClick={() => act(() => setAdStatus(a.id, "active"), T.REQUEST_APPROVED)} size="sm"><Check className="size-4" />{A.APPROVE}</Button>
                      <Button onClick={() => act(() => setAdStatus(a.id, "rejected"), T.REQUEST_REJECTED)} size="sm" variant="outline"><X className="size-4" />{A.REJECT}</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {tab === "slots" && (
          <DataTable
            columns={[
              { header: A.SLOT, key: "name", render: (s) => <><b>{s.name}</b><span className="block font-mono text-xs text-muted">{s.key}</span></> },
              { header: A.FORMAT, key: "format" },
              { header: A.SIZE, key: "size" },
              { align: "right", header: T.LIVE, key: "live", render: (s) => `${data.ads.filter((a) => a.slot === s.key && a.status === "active").length} / ${s.maxItems}` },
              { header: A.RATE_CARD, key: "rateLabel", render: (s) => <button className="text-left font-medium text-brand-700 hover:underline" onClick={() => setRateSlot(s)} type="button">{s.rateLabel}</button> },
              { header: T.ENABLED, key: "isActive", render: (s) => <Toggle checked={s.isActive !== false} label={`${T.ENABLED}: ${s.name}`} onChange={(v) => act(() => setSlotActive(s.key, v), v ? T.SLOT_ENABLED : T.SLOT_DISABLED)} /> },
            ]}
            rowKey="key"
            rows={slots}
          />
        )}
      </Panel>

      {editing && <AdEditor ad={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} slots={slots} />}
      <ConfirmDialog
        body={deleting && T.DELETE_AD_BODY(deleting.advertiser)}
        confirmLabel={T.DELETE_AD}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => act(() => deleteAd(deleting.id), T.AD_DELETED).then(() => setDeleting(null))}
        open={Boolean(deleting)}
        title={T.DELETE_AD}
      />
      <PromptDialog
        body={rateSlot?.name}
        confirmLabel={EN.COMMON.SAVE}
        key={rateSlot?.key ?? "none"}
        label={A.RATE_CARD}
        multiline={false}
        onCancel={() => setRateSlot(null)}
        onConfirm={(v) => act(() => updateSlotRate(rateSlot.key, v), T.RATE_SAVED).then(() => setRateSlot(null))}
        open={Boolean(rateSlot)}
        placeholder="₹20,000 / week"
        title={T.EDIT_RATE}
      />
    </div>
  );
}

function AdEditor({ ad, onClose, onSaved, slots }) {
  const isNew = !ad.id;
  const formik = useFormik({
    initialValues: {
      advertiser: ad.advertiser ?? "Kartiva", advertiserType: ad.advertiserType ?? "house", budget: ad.budget ?? "", cta: ad.cta ?? "Shop now", endsAt: ad.endsAt ?? plusDays(14),
      eyebrow: ad.eyebrow ?? "", headline: ad.headline ?? "", imageUrl: ad.imageUrl ?? "", link: ad.link ?? "/", pricing: ad.pricing ?? "free", priority: ad.priority ?? 0, productId: ad.productId ?? "",
      rate: ad.rate ?? 0, slot: ad.slot ?? "home_hero_carousel", startsAt: ad.startsAt ?? today(), status: ad.status, storeSlug: ad.storeSlug ?? "", subtext: ad.subtext ?? "", theme: ad.theme ?? THEMES[0][1],
    },
    onSubmit: async (values) => {
      try {
        const advertiser = values.advertiserType === "seller" ? STORES.find((s) => s.slug === values.storeSlug)?.name : values.advertiserType === "house" ? "Kartiva" : values.advertiser;
        await saveAd({ ...ad, ...values, advertiser, budget: values.budget === "" ? undefined : Number(values.budget), productId: values.productId || undefined, storeSlug: values.advertiserType === "seller" ? values.storeSlug : undefined });
        successToast(isNew ? T.AD_CREATED : T.AD_SAVED);
        onSaved();
      } catch (err) { errorToast(getErrorMessage(err)); }
    },
    validationSchema: createAdSchema(EN.VALIDATION),
  });
  const { errors, handleBlur, handleChange, handleSubmit, isSubmitting, setFieldValue, touched, values } = formik;
  const slot = slots.find((s) => s.key === values.slot);
  const sponsored = slot?.format === "sponsored_products";
  const products = PRODUCTS.filter((p) => p.status === "active" && !p.deletedAt && (values.advertiserType !== "seller" || !values.storeSlug || p.storeSlug === values.storeSlug));
  const previewProduct = PRODUCTS.find((p) => p.id === Number(values.productId));
  const onImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    try { setFieldValue("imageUrl", await compressImage(file)); } catch { errorToast(T.AD_IMAGE_BAD); }
  };
  const f = (name, label, props = {}) => <FormInput error={errors[name]} label={label} name={name} onBlur={handleBlur} onChange={handleChange} touched={touched[name]} value={values[name]} {...props} />;

  return (
    <Modal onClose={onClose} open title={isNew ? T.NEW_AD : T.EDIT_AD}>
      <form className="max-h-[70vh] space-y-4 overflow-y-auto pr-1" noValidate onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormSelect label={A.SLOT} name="slot" onChange={handleChange} options={slots.map((s) => ({ label: `${s.name} (${s.format})`, value: s.key }))} value={values.slot} />
          <FormSelect label={A.TYPE} name="advertiserType" onChange={(e) => { setFieldValue("advertiserType", e.target.value); if (e.target.value === "house") setFieldValue("pricing", "free"); else if (values.pricing === "free") setFieldValue("pricing", "fixed"); }} options={[{ label: T.TYPE_HOUSE, value: "house" }, { label: T.TYPE_SELLER, value: "seller" }, { label: T.TYPE_EXTERNAL, value: "external" }]} value={values.advertiserType} />
          {values.advertiserType === "seller" && <FormSelect error={errors.storeSlug} label={A.STORE} name="storeSlug" onChange={handleChange} options={STORES.map((s) => ({ label: s.name, value: s.slug }))} placeholder="—" touched={touched.storeSlug} value={values.storeSlug} />}
          {values.advertiserType === "external" && f("advertiser", T.BRAND_NAME)}
        </div>

        <FormSelect label={sponsored ? T.PRODUCT_REQUIRED : T.PRODUCT_IMAGE} name="productId" onChange={handleChange} options={products.slice(0, 200).map((p) => ({ label: `${p.name} — ${getStore(p.storeSlug)?.name}`, value: p.id }))} placeholder={sponsored ? "—" : T.NO_IMAGE} value={values.productId} />

        {!sponsored && (
          <div className="grid gap-3 sm:grid-cols-2">
            {f("eyebrow", T.EYEBROW)}
            {f("cta", T.CTA)}
            {f("headline", T.HEADLINE, { className: "sm:col-span-2" })}
            {f("subtext", T.SUBTEXT, { className: "sm:col-span-2" })}
            <div className="sm:col-span-2">
              <p className="mb-1 text-sm font-medium">{T.AD_IMAGE}</p>
              <div className="flex flex-wrap items-center gap-3">
                {values.imageUrl && <img alt="" className="size-16 rounded-lg border border-line object-contain" src={values.imageUrl} />}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-slate-50">
                  <ImagePlus className="size-4" />{T.AD_IMAGE_UPLOAD}
                  <input accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onImage} type="file" />
                </label>
                {values.imageUrl && <Button onClick={() => setFieldValue("imageUrl", "")} size="sm" variant="ghost">{T.AD_IMAGE_REMOVE}</Button>}
              </div>
              <p className="mt-1 text-xs text-muted">{T.AD_IMAGE_HINT}</p>
            </div>
            {f("link", T.LINK, { hint: T.LINK_HINT })}
            <FormSelect label={T.THEME} name="theme" onChange={handleChange} options={THEMES.map(([label, value]) => ({ label, value }))} value={values.theme} />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          {values.advertiserType !== "house" && <FormSelect label={A.PRICING} name="pricing" onChange={handleChange} options={[{ label: T.PRICING_FIXED, value: "fixed" }, { label: "CPM", value: "cpm" }, { label: "CPC", value: "cpc" }]} value={values.pricing} />}
          {values.advertiserType !== "house" && f("rate", T.RATE, { inputMode: "decimal", type: "number" })}
          {values.advertiserType !== "house" && f("budget", T.BUDGET, { type: "number" })}
          {f("startsAt", T.STARTS, { type: "date" })}
          {f("endsAt", T.ENDS, { type: "date" })}
          {f("priority", T.PRIORITY, { type: "number" })}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">{T.PREVIEW}</p>
          {sponsored
            ? previewProduct && <div className="max-w-48"><ProductCard product={{ ...previewProduct, store: getStore(previewProduct.storeSlug), summary: summarizeProduct(previewProduct) }} sponsored /></div>
            : <div className="pointer-events-none"><AdCreative ad={{ ...values, advertiserType: values.advertiserType, imageUrl: values.imageUrl || undefined, link: "#", product: previewProduct }} layout="wide" /></div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button onClick={onClose} variant="ghost">{EN.COMMON.CANCEL}</Button>
          <Button loading={isSubmitting} type="submit">{isNew ? T.CREATE_AD : EN.COMMON.SAVE}</Button>
        </div>
      </form>
    </Modal>
  );
}

