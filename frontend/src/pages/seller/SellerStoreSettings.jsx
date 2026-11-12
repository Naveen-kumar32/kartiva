import { useFormik } from "formik";
import { BadgeCheck, ExternalLink, MapPin, ShieldCheck } from "lucide-react";

import { getSellerStore, updateSellerStore } from "@/api";
import { Button, ErrorState, FormInput, FormTextarea, KeyValue, PageHeader, PageLoader, Panel, StatusBadge } from "@/components";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { errorToast, getErrorMessage, successToast } from "@/utils";

const H = EN.SELLER_HUB;

function validate(v) {
  const e = {};
  if (v.name.trim().length < 3) e.name = EN.VALIDATION.NAME_SHORT;
  if (!v.city.trim()) e.city = EN.VALIDATION.REQUIRED;
  if (v.supportEmail && !/^\S+@\S+\.\S+$/.test(v.supportEmail)) e.supportEmail = EN.VALIDATION.EMAIL_INVALID;
  if (v.supportPhone && !/^(\+91)?[6-9]\d{9}$/.test(v.supportPhone.replace(/\s/g, ""))) e.supportPhone = EN.VALIDATION.PHONE_INVALID;
  if (!v.returnPolicy.trim()) e.returnPolicy = EN.VALIDATION.REQUIRED;
  return e;
}

function StoreForm({ store, storeSlug }) {
  const formik = useFormik({
    initialValues: {
      city: store.city ?? "", color: store.color ?? "#0e7c7b", description: store.description ?? "", name: store.name, returnPolicy: store.returnPolicy ?? "",
      supportEmail: store.supportEmail ?? "", supportPhone: store.supportPhone ?? "", tagline: store.tagline ?? "",
    },
    onSubmit: async (values) => {
      try {
        await updateSellerStore(storeSlug, values);
        successToast(H.STORE_SAVED);
      } catch (err) {
        errorToast(getErrorMessage(err));
      }
    },
    validate,
  });
  const { errors, handleBlur, handleChange, handleSubmit, isSubmitting, touched, values } = formik;
  const field = (name, label, props = {}) => <FormInput error={errors[name]} label={label} name={name} onBlur={handleBlur} onChange={handleChange} touched={touched[name]} value={values[name]} {...props} />;
  const initials = values.name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
      <form className="space-y-6" noValidate onSubmit={handleSubmit}>
        <Panel title={H.STORE_PROFILE}>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("name", H.STORE_NAME)}
            {field("tagline", H.TAGLINE)}
            <FormTextarea className="sm:col-span-2" label={H.ABOUT_STORE} name="description" onChange={handleChange} rows={3} value={values.description} />
            {field("city", EN.CHECKOUT.CITY)}
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="color">{H.BRAND_COLOR}</label>
              <div className="flex items-center gap-3">
                <input className="h-11 w-16 cursor-pointer rounded-lg border border-line bg-white p-1" id="color" name="color" onChange={handleChange} type="color" value={values.color} />
                <span className="font-mono text-sm text-muted">{values.color}</span>
              </div>
            </div>
          </div>
        </Panel>
        <Panel title={H.CUSTOMER_SUPPORT}>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("supportEmail", H.SUPPORT_EMAIL, { type: "email" })}
            {field("supportPhone", H.SUPPORT_PHONE, { inputMode: "tel" })}
            <FormTextarea className="sm:col-span-2" error={errors.returnPolicy} label={EN.STORE.RETURN_POLICY} name="returnPolicy" onBlur={handleBlur} onChange={handleChange} rows={3} touched={touched.returnPolicy} value={values.returnPolicy} />
          </div>
        </Panel>
        <Button loading={isSubmitting} size="lg" type="submit">{H.SAVE_STORE}</Button>
      </form>

      <aside className="space-y-6">
        <Panel title={H.LIVE_PREVIEW}>
          <div className="overflow-hidden rounded-xl ring-1 ring-line">
            <div className="h-20" style={{ background: `linear-gradient(120deg, #0f172a, ${values.color} 60%, ${values.color}cc)` }} />
            <div className="-mt-7 flex items-end gap-3 px-4 pb-4">
              <span aria-hidden className="grid size-14 place-items-center rounded-xl text-lg font-bold text-white ring-4 ring-white" style={{ background: values.color }}>{initials}</span>
              <div className="min-w-0 pb-1">
                <p className="flex items-center gap-1 truncate font-bold">{values.name || H.STORE_NAME}<BadgeCheck aria-hidden className="size-4 text-brand-600" /></p>
                <p className="truncate text-xs text-muted">{values.tagline}</p>
              </div>
            </div>
            <p className="flex items-center gap-1 px-4 pb-4 text-xs text-muted"><MapPin aria-hidden className="size-3" />{values.city}</p>
          </div>
          <Button className="mt-4" fullWidth size="sm" to={ROUTES.STORE(storeSlug)} variant="outline"><ExternalLink className="size-4" />{H.VIEW_STORE}</Button>
        </Panel>
        <Panel title={H.GST_KYC}>
          <KeyValue items={[
            [EN.ADMIN.GSTIN, <span className="font-mono" key="g">{store.gstin}</span>],
            [H.STATE_CODE, `${store.gstStateCode} · ${store.state}`],
            [EN.ADMIN.STATUS, <StatusBadge key="s" status={store.status} />],
            [H.SELLING_SINCE, store.since],
          ]} />
          <p className="mt-3 flex gap-2 text-xs text-muted"><ShieldCheck aria-hidden className="size-4 shrink-0" />{H.KYC_NOTE}</p>
        </Panel>
      </aside>
    </div>
  );
}

export function SellerStoreSettings() {
  useDocumentTitle(EN.SELLER.NAV_STORE);
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => getSellerStore(user.storeSlug), [user.storeSlug]);
  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="space-y-6">
      <PageHeader subtitle={H.STORE_SUBTITLE} title={EN.SELLER.NAV_STORE} />
      <StoreForm store={data} storeSlug={user.storeSlug} />
    </div>
  );
}
