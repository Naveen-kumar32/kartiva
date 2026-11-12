import { useFormik } from "formik";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { resetPassword } from "@/api";
import { Button, FormInput } from "@/components";
import { useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast, successToast } from "@/utils/toast";
import { createResetPasswordSchema } from "@/validators";

const A = EN.AUTH;

export function ResetPassword() {
  useDocumentTitle(A.RESET_TITLE);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const formik = useFormik({
    initialValues: { confirmPassword: "", password: "" },
    onSubmit: async ({ password }) => {
      try {
        await resetPassword({ password, token: params.get("token") });
        successToast(A.RESET_DONE);
        navigate(ROUTES.LOGIN, { replace: true });
      } catch (err) { errorToast(getErrorMessage(err)); }
    },
    validationSchema: createResetPasswordSchema(EN.VALIDATION),
  });
  const { errors, handleBlur, handleChange, handleSubmit, isSubmitting, touched, values } = formik;
  const field = (name, label) => <FormInput autoComplete="new-password" error={errors[name]} label={label} name={name} onBlur={handleBlur} onChange={handleChange} touched={touched[name]} type="password" value={values[name]} />;

  return (
    <div>
      <h1 className="text-2xl font-bold">{A.RESET_TITLE}</h1>
      <p className="mt-1 text-sm text-muted">{A.RESET_SUBTITLE}</p>
      <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
        {field("password", A.NEW_PASSWORD)}
        {field("confirmPassword", A.CONFIRM_PASSWORD)}
        <Button fullWidth loading={isSubmitting} size="lg" type="submit">{A.RESET_SUBMIT}</Button>
      </form>
      <p className="mt-6 text-center text-sm"><Link className="font-semibold text-brand-700 hover:underline" to={ROUTES.FORGOT_PASSWORD}>{A.FORGOT_SUBMIT}</Link></p>
    </div>
  );
}
