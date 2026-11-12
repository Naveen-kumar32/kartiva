import { useFormik } from "formik";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { requestPasswordReset } from "@/api";
import { Button, FormInput } from "@/components";
import { useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast } from "@/utils/toast";
import { createForgotPasswordSchema } from "@/validators";

const A = EN.AUTH;

export function ForgotPassword() {
  useDocumentTitle(A.FORGOT_TITLE);
  const [sent, setSent] = useState(null); // { demoLink }
  const formik = useFormik({
    initialValues: { email: "" },
    onSubmit: async ({ email }) => {
      try { setSent(await requestPasswordReset(email)); } catch (err) { errorToast(getErrorMessage(err)); }
    },
    validationSchema: createForgotPasswordSchema(EN.VALIDATION),
  });
  const { errors, handleBlur, handleChange, handleSubmit, isSubmitting, touched, values } = formik;

  return (
    <div>
      <h1 className="text-2xl font-bold">{A.FORGOT_TITLE}</h1>
      <p className="mt-1 text-sm text-muted">{A.FORGOT_SUBTITLE}</p>
      {sent ? (
        <div className="mt-6 space-y-4">
          <p className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200" role="status"><MailCheck aria-hidden className="mt-0.5 size-5 shrink-0" />{A.FORGOT_SENT}</p>
          {sent.demoLink && (
            <div className="rounded-xl border border-dashed border-brand-300 bg-brand-50/60 p-3 text-sm">
              <p className="text-brand-900">{A.DEMO_RESET_LINK}</p>
              <Button className="mt-2" size="sm" to={sent.demoLink}>{A.OPEN_RESET_LINK}</Button>
            </div>
          )}
        </div>
      ) : (
        <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
          <FormInput autoComplete="email" error={errors.email} label={A.EMAIL} name="email" onBlur={handleBlur} onChange={handleChange} touched={touched.email} type="email" value={values.email} />
          <Button fullWidth loading={isSubmitting} size="lg" type="submit">{A.FORGOT_SUBMIT}</Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm"><Link className="font-semibold text-brand-700 hover:underline" to={ROUTES.LOGIN}>{A.BACK_TO_SIGN_IN}</Link></p>
    </div>
  );
}
