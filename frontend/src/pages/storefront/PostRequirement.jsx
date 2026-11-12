import { useFormik } from "formik";
import { ClipboardList, FileSpreadsheet, Handshake, MapPin, Paperclip, Users } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { getRecentRfqs, getRfqCategories, postRfq, RFQ_UNIT_OPTIONS } from "@/api";
import { Button, Container, FormInput, FormSelect, FormTextarea } from "@/components";
import { USER_ROLES } from "@/constants";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { formatDate, formatNumber } from "@/utils/format";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast, successToast } from "@/utils/toast";
import { createRfqSchema } from "@/validators";

const R = EN.BUYER_HUB.RFQ;
const STEP_ICONS = [ClipboardList, Users, Handshake];
const plusDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const DRAFT_KEY = "kartiva.rfqDraft";
const readDraft = () => { try { return JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) ?? "null"); } catch { return null; } };
const writeDraft = (v) => { try { window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(v)); } catch { /* storage blocked */ } };
const clearDraft = () => { try { window.sessionStorage.removeItem(DRAFT_KEY); } catch { /* storage blocked */ } };

// JustDial / IndiaMART "Tell us what you need": a buy request goes to every approved supplier in the category.
export function PostRequirement() {
  useDocumentTitle(R.TITLE);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: categories } = useAsync(getRfqCategories, []);
  const { data: recent } = useAsync(() => getRecentRfqs(6), []);

  const formik = useFormik({
    initialValues: readDraft() ?? {
      categorySlug: "", deliveryCity: user?.city ?? "", details: "", quantity: "", requiredBy: plusDays(14), targetPrice: "", title: "", unit: "pcs",
    },
    onSubmit: async (values, { setSubmitting }) => {
      // Guests keep their draft and come back here after signing in.
      if (!user) { writeDraft(values); navigate(ROUTES.LOGIN, { state: { from: location.pathname } }); return; }
      if (user.role !== USER_ROLES.BUYER) { errorToast(R.BUYERS_ONLY); setSubmitting(false); return; }
      try {
        const rfq = await postRfq(user, { ...values, quantity: Number(values.quantity) });
        clearDraft();
        successToast(R.POSTED(rfq.notifiedSuppliers));
        navigate(`${ROUTES.ACCOUNT.ENQUIRIES}?tab=rfqs`);
      } catch (err) {
        errorToast(getErrorMessage(err));
        setSubmitting(false);
      }
    },
    validationSchema: createRfqSchema({ ...EN.VALIDATION, ...EN.BUYER_HUB.VALIDATION }),
  });
  const { errors, handleBlur, handleChange, handleSubmit, isSubmitting, touched, values } = formik;
  const field = (name) => ({ error: errors[name], name, onBlur: handleBlur, onChange: handleChange, touched: touched[name], value: values[name] });
  const categoryOptions = (categories ?? []).map((c) => ({ group: c.parent, label: c.name, value: c.slug }));

  return (
    <>
      <section className="bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 text-white">
        <Container className="py-10 sm:py-14">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent-400">{R.EYEBROW}</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-extrabold sm:text-4xl">{R.TITLE}</h1>
          <p className="mt-3 max-w-2xl text-white/80">{R.SUBTITLE}</p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {R.STEPS.map((step, i) => {
              const Icon = STEP_ICONS[i];
              return (
                <li className="flex items-start gap-3 rounded-xl bg-white/10 p-4" key={step.title}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-500 text-ink"><Icon aria-hidden className="size-5" /></span>
                  <span><span className="block font-semibold">{i + 1}. {step.title}</span><span className="block text-sm text-white/75">{step.body}</span></span>
                </li>
              );
            })}
          </ol>
        </Container>
      </section>

      <Container className="grid gap-6 pt-8 lg:grid-cols-[1.5fr_1fr]">
        <form className="rounded-2xl bg-white p-5 shadow-card sm:p-6" noValidate onSubmit={handleSubmit}>
          <h2 className="text-lg font-bold">{R.FORM_TITLE}</h2>
          <p className="mb-5 text-sm text-muted">{R.FORM_HINT}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput {...field("title")} className="sm:col-span-2" label={R.WHAT} placeholder={R.WHAT_PLACEHOLDER} />
            <FormSelect {...field("categorySlug")} className="sm:col-span-2" label={R.CATEGORY} options={categoryOptions} placeholder={EN.COMMON.SELECT} />
            <div className="grid grid-cols-[1fr_1fr] gap-3">
              <FormInput {...field("quantity")} inputMode="numeric" label={R.QUANTITY} min={1} type="number" />
              <FormSelect {...field("unit")} label={R.UNIT} options={RFQ_UNIT_OPTIONS.map((u) => ({ label: R.UNITS[u], value: u }))} />
            </div>
            <FormInput {...field("targetPrice")} hint={R.TARGET_PRICE_HINT} inputMode="numeric" label={R.TARGET_PRICE} min={1} type="number" />
            <FormInput {...field("deliveryCity")} autoComplete="address-level2" label={R.DELIVERY_CITY} />
            <FormInput {...field("requiredBy")} label={R.REQUIRED_BY} min={plusDays(1)} type="date" />
            <FormTextarea {...field("details")} className="sm:col-span-2" label={R.DETAILS} placeholder={R.DETAILS_PLACEHOLDER} rows={4} />
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted"><Paperclip aria-hidden className="size-4" />{R.ATTACH_NOTE}</p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">{user ? R.PRIVACY : R.LOGIN_NOTE}</p>
            <Button loading={isSubmitting} size="lg" type="submit" variant="accent">{user ? R.SUBMIT : R.SUBMIT_GUEST}</Button>
          </div>
        </form>

        <aside className="space-y-4">
          <section className="rounded-2xl bg-white p-5 shadow-card">
            <h2 className="flex items-center gap-2 font-semibold"><FileSpreadsheet aria-hidden className="size-5 text-brand-600" />{R.RECENT}</h2>
            <ul className="mt-3 divide-y divide-line">
              {(recent ?? []).map((r) => (
                <li className="py-3" key={r.id}>
                  <p className="line-clamp-1 text-sm font-medium">{r.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span>{formatNumber(r.quantity)} {R.UNITS[r.unit] ?? r.unit}</span>
                    <span className="flex items-center gap-0.5"><MapPin aria-hidden className="size-3" />{r.buyerFirstName}, {r.city}</span>
                    <span>{formatDate(r.createdAt, { day: "numeric", month: "short" })}</span>
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-brand-700">{R.QUOTES(r.quoteCount)}</p>
                </li>
              ))}
              {recent?.length === 0 && <li className="py-3 text-sm text-muted">{R.NO_RECENT}</li>}
            </ul>
          </section>
          <section className="rounded-2xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-100">
            <p className="font-semibold">{R.WHY_TITLE}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">{R.WHY.map((w) => <li key={w}>{w}</li>)}</ul>
          </section>
        </aside>
      </Container>
    </>
  );
}
