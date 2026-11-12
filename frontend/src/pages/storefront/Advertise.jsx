import { useFormik } from "formik";
import { Megaphone } from "lucide-react";

import { Button, Container, FormInput, FormSelect } from "@/components";
import { AD_SLOTS } from "@/data";
import { useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { successToast } from "@/utils/toast";
import { createAdvertiseSchema } from "@/validators";

export function Advertise() {
  useDocumentTitle(EN.ADS.ADVERTISE_TITLE);
  const formik = useFormik({
    initialValues: { company: "", email: "", phone: "", slot: "" },
    onSubmit: (_, { resetForm }) => { successToast(EN.ADS.ADVERTISE_SENT); resetForm(); },
    validationSchema: createAdvertiseSchema(EN.VALIDATION),
  });
  const { errors, handleBlur, handleChange, handleSubmit, isSubmitting, touched, values } = formik;

  return (
    <Container className="pt-8">
      <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <Megaphone aria-hidden className="size-10 text-brand-600" />
          <h1 className="mt-3 text-3xl font-extrabold">{EN.ADS.ADVERTISE_TITLE}</h1>
          <p className="mt-2 max-w-2xl text-muted">{EN.ADS.ADVERTISE_SUBTITLE}</p>
          <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-card">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
                <tr><th className="px-4 py-3">{EN.ADMIN.SLOT}</th><th className="px-4 py-3">{EN.ADS.SIZE}</th><th className="px-4 py-3">{EN.ADMIN.RATE_CARD}</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {AD_SLOTS.map((s) => (
                  <tr key={s.key}><td className="px-4 py-3 font-medium">{s.name}</td><td className="px-4 py-3 text-muted">{s.size}</td><td className="px-4 py-3 tabular">{s.rateLabel}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">{EN.ADS.RATE_CARD_NOTE}</p>
        </div>
        <form className="h-fit rounded-2xl bg-white p-6 shadow-card" noValidate onSubmit={handleSubmit}>
          <h2 className="mb-4 text-lg font-semibold">{EN.ADS.ADVERTISE_FORM_TITLE}</h2>
          <div className="space-y-4">
            <FormInput error={errors.company} label={EN.ADS.COMPANY} name="company" onBlur={handleBlur} onChange={handleChange} touched={touched.company} value={values.company} />
            <FormInput error={errors.email} label={EN.AUTH.EMAIL} name="email" onBlur={handleBlur} onChange={handleChange} touched={touched.email} type="email" value={values.email} />
            <FormInput error={errors.phone} inputMode="numeric" label={EN.AUTH.PHONE} name="phone" onBlur={handleBlur} onChange={handleChange} touched={touched.phone} value={values.phone} />
            <FormSelect error={errors.slot} label={EN.ADMIN.SLOT} name="slot" onBlur={handleBlur} onChange={handleChange} options={AD_SLOTS.map((s) => ({ label: s.name, value: s.key }))} placeholder="—" touched={touched.slot} value={values.slot} />
          </div>
          <Button className="mt-6" fullWidth loading={isSubmitting} size="lg" type="submit">{EN.ADS.ADVERTISE_CTA}</Button>
        </form>
      </div>
    </Container>
  );
}
