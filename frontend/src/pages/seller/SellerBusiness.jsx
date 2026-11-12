import { useFormik } from "formik";
import { Building2, CalendarDays, FileCheck2, FileText, Globe2, MapPin, Phone, Plus, ShieldCheck, Upload, UserRound, Users, X } from "lucide-react";
import { useState } from "react";

import { getBusinessProfile, updateBusinessProfile, uploadKycDocument } from "@/api";
import {
  Badge, Button, ErrorState, FormInput, FormSelect, FormTextarea, PageHeader, PageLoader, Panel, VerifiedBadges,
} from "@/components";
import { BUSINESS_TYPES, TURNOVER_BANDS } from "@/constants";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { cn, errorToast, formatDateTime, getErrorMessage, successToast } from "@/utils";
import { createBusinessProfileSchema } from "@/validators";

const P = EN.SELLER_PRO;
const B = P.BUSINESS;
const V = { ...EN.VALIDATION, ...P.VALIDATION };
const EMPLOYEE_BANDS = ["1–10", "11–50", "51–100", "101–500", "500+"];
const REQUIRED_DOCS = ["gst_certificate", "pan_card", "cancelled_cheque"];
const OPTIONAL_DOCS = ["address_proof", "trade_licence", "fssai_bis_licence"];
const MAX_BYTES = 5 * 1024 * 1024;
const DOC_TONE = { not_uploaded: "neutral", pending: "warning", rejected: "danger", verified: "success" };
const KYC_TONE = { not_submitted: "neutral", pending: "warning", rejected: "danger", verified: "success" };
const THIS_YEAR = new Date().getFullYear();
const options = (list) => list.map((v) => ({ label: v, value: v }));

function ProfileForm({ actor, onSaved, store }) {
  const [cert, setCert] = useState("");
  const formik = useFormik({
    initialValues: {
      annualTurnover: store.annualTurnover ?? "", businessType: store.businessType ?? "", certifications: store.certifications ?? [], contactPerson: store.contactPerson ?? "",
      description: store.description ?? "", employees: store.employees ?? "", mainMarkets: (store.mainMarkets ?? []).join(", "), phone: store.phone ?? "", yearEstablished: store.yearEstablished ?? "",
    },
    onSubmit: async (values) => {
      try {
        onSaved(await updateBusinessProfile(store.slug, values, actor));
        successToast(B.SAVED);
      } catch (err) {
        errorToast(getErrorMessage(err));
      }
    },
    validationSchema: createBusinessProfileSchema(V),
  });
  const { errors, handleBlur, handleChange, handleSubmit, isSubmitting, setFieldValue, touched, values } = formik;
  const field = (name) => ({ error: errors[name], name, onBlur: handleBlur, onChange: handleChange, touched: touched[name], value: values[name] });
  const addCert = () => {
    const c = cert.trim();
    if (c && !values.certifications.includes(c) && values.certifications.length < 12) setFieldValue("certifications", [...values.certifications, c]);
    setCert("");
  };
  const preview = { ...store, ...values, mainMarkets: values.mainMarkets.split(",").map((m) => m.trim()).filter(Boolean) };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <Panel title={B.COMPANY_PROFILE}>
        <form className="grid gap-4 sm:grid-cols-2" noValidate onSubmit={handleSubmit}>
          <FormSelect label={EN.MARKET.BUSINESS_TYPE} options={options(BUSINESS_TYPES)} placeholder={EN.COMMON.SELECT} {...field("businessType")} />
          <FormInput inputMode="numeric" label={B.YEAR} {...field("yearEstablished")} />
          <FormSelect label={B.EMPLOYEES} options={options(EMPLOYEE_BANDS)} placeholder={EN.COMMON.SELECT} {...field("employees")} />
          <FormSelect label={B.TURNOVER} options={options(TURNOVER_BANDS)} placeholder={EN.COMMON.SELECT} {...field("annualTurnover")} />
          <FormInput className="sm:col-span-2" hint={B.MARKETS_HINT} label={B.MARKETS} {...field("mainMarkets")} />
          <FormInput label={B.CONTACT_PERSON} {...field("contactPerson")} />
          <FormInput inputMode="tel" label={B.PHONE} {...field("phone")} />
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-sm font-medium">{B.CERTIFICATIONS}</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {values.certifications.map((c) => (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200" key={c}>
                  <FileCheck2 aria-hidden className="size-3.5" />{c}
                  <button aria-label={B.REMOVE_CERT(c)} className="rounded-full hover:bg-emerald-100" onClick={() => setFieldValue("certifications", values.certifications.filter((x) => x !== c))} type="button"><X className="size-3" /></button>
                </span>
              ))}
              {values.certifications.length === 0 && <span className="text-xs text-muted">{B.NO_CERTS}</span>}
            </div>
            <div className="flex gap-2">
              <input aria-label={B.ADD_CERT} className="h-10 flex-1 rounded-lg border border-line px-3 text-sm" maxLength={60} onChange={(e) => setCert(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCert(); } }} placeholder={B.CERT_PLACEHOLDER} value={cert} />
              <Button disabled={!cert.trim()} onClick={addCert} variant="subtle"><Plus className="size-4" />{B.ADD_CERT}</Button>
            </div>
          </div>
          <FormTextarea className="sm:col-span-2" label={B.ABOUT} placeholder={B.ABOUT_PLACEHOLDER} rows={4} {...field("description")} />
          <div className="sm:col-span-2"><Button loading={isSubmitting} type="submit">{B.SAVE}</Button></div>
        </form>
      </Panel>

      <aside className="space-y-4 xl:sticky xl:top-20 xl:h-fit">
        <Panel title={B.PREVIEW}>
          <div className="overflow-hidden rounded-xl ring-1 ring-line">
            <div className="h-16" style={{ background: store.banner }} />
            <div className="-mt-7 px-4 pb-4">
              <span className="grid size-14 place-items-center rounded-xl border-4 border-white text-lg font-bold text-white" style={{ background: store.color }}>{store.initials}</span>
              <p className="mt-2 font-bold">{store.name}</p>
              <p className="text-xs text-muted">{preview.businessType || "—"} · {store.city}, {store.state}</p>
              <VerifiedBadges className="mt-2" store={store} />
              <ul className="mt-3 space-y-1.5 text-xs text-ink/80">
                <li className="flex items-center gap-2"><CalendarDays aria-hidden className="size-3.5 text-muted" />{preview.yearEstablished ? EN.MARKET.YEARS_IN_BUSINESS(THIS_YEAR - Number(preview.yearEstablished)) : "—"}</li>
                <li className="flex items-center gap-2"><Users aria-hidden className="size-3.5 text-muted" />{B.EMPLOYEES_N(preview.employees || "—")}</li>
                <li className="flex items-center gap-2"><Building2 aria-hidden className="size-3.5 text-muted" />{B.TURNOVER_N(preview.annualTurnover || "—")}</li>
                <li className="flex items-center gap-2"><Globe2 aria-hidden className="size-3.5 text-muted" />{preview.mainMarkets.join(", ") || "—"}</li>
                <li className="flex items-center gap-2"><UserRound aria-hidden className="size-3.5 text-muted" />{preview.contactPerson || "—"}</li>
                <li className="flex items-center gap-2"><Phone aria-hidden className="size-3.5 text-muted" />{preview.phone || "—"}</li>
              </ul>
              {preview.certifications.length > 0 && <p className="mt-3 text-xs"><b>{B.CERTIFICATIONS}:</b> {preview.certifications.join(" · ")}</p>}
              {preview.description && <p className="mt-3 line-clamp-4 text-xs text-muted">{preview.description}</p>}
            </div>
          </div>
        </Panel>
      </aside>
    </div>
  );
}

function DocRow({ busy, doc, onUpload, required, type }) {
  const status = doc?.status ?? "not_uploaded";
  return (
    <li className="flex flex-wrap items-center gap-3 py-3.5">
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", status === "verified" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}><FileText aria-hidden className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">{B.DOC[type]}{required && <span className="text-xs font-normal text-red-600">{B.REQUIRED}</span>}</p>
        {doc ? <p className="truncate text-xs text-muted">{doc.fileName} · {B.SIZE_KB(doc.sizeKb)} · {B.UPLOADED(formatDateTime(doc.uploadedAt))}</p> : <p className="text-xs text-muted">{B.DOC_HINT[type]}</p>}
        {status === "rejected" && doc?.note && <p className="mt-1 text-xs text-red-700">{B.REJECTED_NOTE(doc.note)}</p>}
      </div>
      <Badge tone={DOC_TONE[status]}>{B.DOC_STATUS[status]}</Badge>
      <label className={cn("inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold hover:border-brand-500 hover:text-brand-700 focus-within:ring-2 focus-within:ring-brand-500/30", busy && "pointer-events-none opacity-60")}>
        <Upload aria-hidden className="size-4" />{doc ? B.REUPLOAD : B.UPLOAD}
        <input accept=".pdf,.jpg,.jpeg,.png" aria-label={`${doc ? B.REUPLOAD : B.UPLOAD} ${B.DOC[type]}`} className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onUpload(type, f); }} type="file" />
      </label>
    </li>
  );
}

export function SellerBusiness() {
  useDocumentTitle(EN.SELLER.NAV_BUSINESS);
  const { user } = useAuth();
  const storeSlug = user.storeSlug;
  const actor = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
  const { data, error, loading, reload, setData } = useAsync(() => getBusinessProfile(storeSlug), [storeSlug]);
  const [uploading, setUploading] = useState(null);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const { documents, store } = data;

  const upload = async (type, file) => {
    const ext = file.name.toLowerCase().split(".").pop();
    if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) return errorToast(B.FILE_TYPE);
    if (file.size > MAX_BYTES) return errorToast(B.FILE_SIZE);
    setUploading(type);
    try {
      await uploadKycDocument(storeSlug, type, { name: file.name, size: file.size, type: file.type }, actor);
      setData(await getBusinessProfile(storeSlug));
      successToast(B.UPLOAD_DONE);
    } catch (err) {
      errorToast(getErrorMessage(err));
    } finally {
      setUploading(null);
    }
    return null;
  };

  const verified = REQUIRED_DOCS.filter((t) => documents[t]?.status === "verified").length;
  const uploaded = REQUIRED_DOCS.filter((t) => documents[t]).length;
  const progress = Math.round(((uploaded + verified) / (REQUIRED_DOCS.length * 2)) * 100);
  const kyc = store.kycStatus ?? "not_submitted";

  return (
    <div className="space-y-6">
      <PageHeader subtitle={B.SUBTITLE} title={EN.SELLER.NAV_BUSINESS} />
      <ProfileForm actor={actor} key={store.slug} onSaved={(s) => setData({ ...data, store: s })} store={store} />

      <Panel action={<Badge tone={KYC_TONE[kyc]}><ShieldCheck aria-hidden className="size-3.5" />{B.KYC_STATUS[kyc]}</Badge>} title={B.KYC_TITLE}>
        <p className="-mt-2 text-sm text-muted">{B.KYC_BODY}</p>
        <div className="mt-4 rounded-xl bg-slate-50 p-4">
          <div className="mb-1.5 flex justify-between text-sm"><span>{B.KYC_PROGRESS(verified, REQUIRED_DOCS.length)}</span><b className="tabular">{progress}%</b></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#14a397] transition-all" style={{ width: `${progress}%` }} /></div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><MapPin aria-hidden className="size-3.5" />{B.GSTIN(store.gstin ?? "—")} · {store.gstVerified ? B.GST_VERIFIED : B.GST_NOT_VERIFIED}</p>
        </div>
        <h3 className="mt-5 text-sm font-semibold">{B.REQUIRED_DOCS}</h3>
        <ul className="divide-y divide-line">{REQUIRED_DOCS.map((t) => <DocRow busy={uploading === t} doc={documents[t]} key={t} onUpload={upload} required type={t} />)}</ul>
        <h3 className="mt-5 text-sm font-semibold">{B.OPTIONAL_DOCS}</h3>
        <ul className="divide-y divide-line">{OPTIONAL_DOCS.map((t) => <DocRow busy={uploading === t} doc={documents[t]} key={t} onUpload={upload} type={t} />)}</ul>
        <p className="mt-3 text-xs text-muted">{B.FILE_RULES}</p>
      </Panel>
    </div>
  );
}
