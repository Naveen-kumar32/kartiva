import { useFormik } from "formik";
import { Info, Megaphone } from "lucide-react";

import { getSellerAds, getSellerProducts, requestSellerAd } from "@/api";
import { Button, DataTable, EmptyState, ErrorState, FormSelect, FormInput, MiniStat, PageHeader, PageLoader, Panel, SmartImage, StatusBadge } from "@/components";
import { AD_SLOTS, PRODUCTS } from "@/data";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { errorToast, formatCurrency, formatDate, formatNumber, formatPercent, getErrorMessage, successToast } from "@/utils";

const H = EN.SELLER_HUB;
const MIN_BUDGET = 500;

export function SellerAds() {
  useDocumentTitle(EN.SELLER.NAV_ADS);
  const { user } = useAuth();
  const storeSlug = user.storeSlug;
  const ads = useAsync(() => getSellerAds(storeSlug), [storeSlug]);
  const products = useAsync(() => getSellerProducts(storeSlug), [storeSlug]);
  const slots = AD_SLOTS.filter((s) => s.format === "sponsored_products" && s.isActive !== false);

  const formik = useFormik({
    initialValues: { budget: 2000, days: "14", productId: "", slot: slots[0]?.key ?? "" },
    onSubmit: async (values, { resetForm }) => {
      try {
        await requestSellerAd(storeSlug, { ...values, budget: Number(values.budget), days: Number(values.days), productId: Number(values.productId) });
        ads.setData(await getSellerAds(storeSlug));
        successToast(H.AD_REQUESTED);
        resetForm();
      } catch (err) {
        errorToast(getErrorMessage(err));
      }
    },
    validate: (v) => {
      const e = {};
      if (!v.productId) e.productId = EN.VALIDATION.REQUIRED;
      if (!v.slot) e.slot = EN.VALIDATION.REQUIRED;
      if (!(Number(v.budget) >= MIN_BUDGET)) e.budget = H.VALIDATION.MIN_BUDGET(formatCurrency(MIN_BUDGET));
      return e;
    },
  });
  const { errors, handleBlur, handleChange, handleSubmit, isSubmitting, touched, values } = formik;

  if (ads.loading || products.loading) return <PageLoader />;
  if (ads.error) return <ErrorState message={ads.error} onRetry={ads.reload} />;

  const list = ads.data ?? [];
  const active = (products.data ?? []).filter((p) => p.status === "active");
  const totals = list.reduce((t, a) => ({ clicks: t.clicks + a.clicks, impressions: t.impressions + a.impressions, spend: t.spend + a.spend }), { clicks: 0, impressions: 0, spend: 0 });
  const productName = (id) => PRODUCTS.find((p) => p.id === id)?.name ?? `#${id}`;
  const productThumb = (id) => PRODUCTS.find((p) => p.id === id)?.thumbnail;
  const slotName = (key) => AD_SLOTS.find((s) => s.key === key)?.name ?? key;
  const selectedSlot = slots.find((s) => s.key === values.slot);

  return (
    <div className="space-y-6">
      <PageHeader subtitle={H.ADS_SUBTITLE} title={EN.SELLER.NAV_ADS} />
      <div className="grid gap-3 sm:grid-cols-4">
        <MiniStat label={H.CAMPAIGNS} value={list.length} />
        <MiniStat label={EN.ADMIN.IMPRESSIONS} value={formatNumber(totals.impressions)} />
        <MiniStat label={EN.ADMIN.CLICKS} value={formatNumber(totals.clicks)} />
        <MiniStat label={EN.ADMIN.SPEND} value={formatCurrency(totals.spend)} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel title={H.MY_CAMPAIGNS}>
          {list.length === 0 ? <EmptyState body={H.NO_ADS_BODY} icon={Megaphone} title={H.NO_ADS} /> : (
            <DataTable
              columns={[
                { header: EN.SELLER.PRODUCT, key: "productId", render: (a) => (
                  <span className="flex items-center gap-3">
                    <SmartImage alt="" className="size-10 shrink-0 rounded-md bg-slate-50 object-contain" src={productThumb(a.productId)} />
                    <span className="min-w-0"><span className="line-clamp-1 font-medium">{a.headline ?? productName(a.productId)}</span><span className="text-xs text-muted">{slotName(a.slot)}</span></span>
                  </span>
                ) },
                { header: EN.ADMIN.STATUS, key: "status", render: (a) => <><StatusBadge status={a.status} /><span className="mt-1 block text-xs text-muted">{formatDate(a.startsAt)} – {formatDate(a.endsAt)}</span></> },
                { align: "right", header: EN.ADMIN.IMPRESSIONS, key: "impressions", render: (a) => formatNumber(a.impressions) },
                { align: "right", header: EN.ADMIN.CTR, key: "ctr", render: (a) => (a.impressions ? formatPercent((a.clicks / a.impressions) * 100, 2) : "—") },
                { header: H.BUDGET_USED, key: "spend", render: (a) => {
                  const pct = a.budget ? Math.min(100, (a.spend / a.budget) * 100) : null;
                  return (
                    <span className="block min-w-32">
                      <span className="text-sm tabular">{formatCurrency(a.spend)}{a.budget ? ` / ${formatCurrency(a.budget)}` : ""}</span>
                      {pct != null && <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-[#14a397]" style={{ width: `${pct}%` }} /></span>}
                    </span>
                  );
                } },
              ]}
              rows={list}
            />
          )}
        </Panel>
        <Panel title={H.PROMOTE_PRODUCT}>
          <form className="space-y-4" noValidate onSubmit={handleSubmit}>
            <FormSelect error={errors.productId} label={EN.SELLER.PRODUCT} name="productId" onBlur={handleBlur} onChange={handleChange} options={active.map((p) => ({ label: p.name, value: String(p.id) }))} placeholder={H.CHOOSE_PRODUCT} touched={touched.productId} value={values.productId} />
            <FormSelect error={errors.slot} label={EN.ADMIN.SLOT} name="slot" onBlur={handleBlur} onChange={handleChange} options={slots.map((s) => ({ label: `${s.name} · ${s.rateLabel}`, value: s.key }))} touched={touched.slot} value={values.slot} />
            <div className="grid grid-cols-2 gap-3">
              <FormInput error={errors.budget} hint={H.BUDGET_HINT} inputMode="numeric" label={H.TOTAL_BUDGET} name="budget" onBlur={handleBlur} onChange={handleChange} touched={touched.budget} value={values.budget} />
              <FormSelect label={H.DURATION} name="days" onChange={handleChange} options={[7, 14, 30].map((d) => ({ label: H.DAYS_N(d), value: String(d) }))} value={values.days} />
            </div>
            {selectedSlot && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-muted">{H.EST_CLICKS(Math.floor(Number(values.budget || 0) / (selectedSlot.key.startsWith("listing") ? 5 : 4)))}</p>}
            <Button fullWidth loading={isSubmitting} type="submit"><Megaphone className="size-4" />{H.SEND_FOR_APPROVAL}</Button>
            <p className="flex gap-2 text-xs text-muted"><Info aria-hidden className="size-4 shrink-0" />{H.CPC_NOTE}</p>
          </form>
        </Panel>
      </div>
    </div>
  );
}
