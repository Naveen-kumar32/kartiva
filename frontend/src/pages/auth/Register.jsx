import { useFormik } from "formik";
import { ShoppingBag, Store } from "lucide-react";
import { useDispatch } from "react-redux";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { register } from "@/api";
import { Button, FormInput, FormSelect } from "@/components";
import { BUSINESS_TYPES, INDIAN_STATES, TURNOVER_BANDS } from "@/constants";
import { CATEGORIES } from "@/data";
import { useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { setCredentials } from "@/store/slices/authSlice";
import { cn } from "@/utils/cn";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast, successToast } from "@/utils/toast";
import { createRegisterSchema } from "@/validators";

const A = EN.AUTH;
const toOptions = (list) => list.map((x) => ({ label: x, value: x }));
const STATE_OPTIONS = INDIAN_STATES.map((s) => ({ label: s.name, value: s.name }));
const EMPTY = {
  accountType: "buyer", annualTurnover: "", businessName: "", businessType: "", category: "", city: "", confirmPassword: "", email: "", firstName: "",
  gstin: "", lastName: "", pan: "", password: "", phone: "", state: "", terms: false, yearEstablished: "",
};

export function Register() {
  const [params] = useSearchParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const formik = useFormik({
    initialValues: { ...EMPTY, accountType: params.get("type") === "seller" ? "seller" : "buyer" },
    onSubmit: async (values) => {
      try {
        const response = await register(values);
        dispatch(setCredentials(response));
        const isSeller = response.user.role === "seller";
        successToast(isSeller ? A.SELLER_REGISTERED : A.REGISTERED);
        navigate(isSeller ? ROUTES.SELLER.DASHBOARD : ROUTES.HOME, { replace: true });
      } catch (err) {
        errorToast(getErrorMessage(err));
      }
    },
    validationSchema: createRegisterSchema(EN.VALIDATION),
  });
  const { errors, handleBlur, handleChange, handleSubmit, isSubmitting, setFieldValue, touched, values } = formik;
  const isSeller = values.accountType === "seller";
  useDocumentTitle(isSeller ? A.REGISTER_SELLER_TITLE : A.CREATE_ACCOUNT);

  const field = (name, label, props = {}) => (
    <FormInput error={errors[name]} label={label} name={name} onBlur={handleBlur} onChange={handleChange} touched={touched[name]} value={values[name]} {...props} />
  );
  const select = (name, label, options, props = {}) => (
    <FormSelect error={errors[name]} label={label} name={name} onBlur={handleBlur} onChange={handleChange} options={options} placeholder={EN.COMMON.SELECT} touched={touched[name]} value={values[name]} {...props} />
  );
  const typeCard = (type, Icon, title, hint) => (
    <button
      aria-pressed={values.accountType === type}
      className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition", values.accountType === type ? "border-brand-600 bg-brand-50 ring-2 ring-brand-600/20" : "border-line bg-white hover:border-brand-300")}
      onClick={() => setFieldValue("accountType", type)}
      type="button"
    >
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", values.accountType === type ? "text-brand-700" : "text-muted")} />
      <span><span className="block text-sm font-semibold">{title}</span><span className="block text-xs text-muted">{hint}</span></span>
    </button>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold">{isSeller ? A.REGISTER_SELLER_TITLE : A.REGISTER_TITLE}</h1>
      <p className="mt-1 text-sm text-muted">{isSeller ? A.REGISTER_SELLER_SUBTITLE : A.REGISTER_SUBTITLE}</p>

      <p className="mb-2 mt-6 text-sm font-medium">{A.ACCOUNT_TYPE}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {typeCard("buyer", ShoppingBag, A.BUYER_ACCOUNT, A.BUYER_ACCOUNT_HINT)}
        {typeCard("seller", Store, A.SELLER_ACCOUNT, A.SELLER_ACCOUNT_HINT)}
      </div>

      {isSeller && (
        <ol className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-3 text-xs text-muted sm:grid-cols-2">
          {A.SELLER_STEPS.map((step, i) => (
            <li className="flex items-center gap-2" key={step}><span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white">{i + 1}</span>{step}</li>
          ))}
        </ol>
      )}

      <form className="mt-6 grid gap-4 sm:grid-cols-2" noValidate onSubmit={handleSubmit}>
        {field("firstName", A.FIRST_NAME, { autoComplete: "given-name" })}
        {field("lastName", A.LAST_NAME, { autoComplete: "family-name" })}
        {field("email", A.EMAIL, { autoComplete: "email", className: "sm:col-span-2", type: "email" })}
        {field("phone", A.PHONE, { autoComplete: "tel-national", className: "sm:col-span-2", inputMode: "numeric", maxLength: 10 })}

        {isSeller && (
          <>
            <p className="mt-2 text-sm font-semibold text-brand-800 sm:col-span-2">{A.BUSINESS_DETAILS}</p>
            {field("businessName", A.BUSINESS_NAME, { autoComplete: "organization", className: "sm:col-span-2" })}
            {select("businessType", A.BUSINESS_TYPE, toOptions(BUSINESS_TYPES))}
            {select("category", A.MAIN_CATEGORY, toOptions(CATEGORIES.filter((c) => !c.parentId && c.isActive !== false).map((c) => c.name)))}
            {field("gstin", A.GSTIN, { autoCapitalize: "characters", maxLength: 15, onChange: (e) => setFieldValue("gstin", e.target.value.toUpperCase()) })}
            {field("pan", A.PAN, { autoCapitalize: "characters", maxLength: 10, onChange: (e) => setFieldValue("pan", e.target.value.toUpperCase()) })}
            {field("city", A.CITY, { autoComplete: "address-level2" })}
            {select("state", A.STATE, STATE_OPTIONS)}
            {field("yearEstablished", A.YEAR_ESTABLISHED, { inputMode: "numeric", maxLength: 4 })}
            {select("annualTurnover", A.ANNUAL_TURNOVER, toOptions(TURNOVER_BANDS))}
          </>
        )}

        {field("password", A.PASSWORD, { autoComplete: "new-password", type: "password" })}
        {field("confirmPassword", A.CONFIRM_PASSWORD, { autoComplete: "new-password", type: "password" })}

        {isSeller && (
          <div className="sm:col-span-2">
            <label className="flex items-start gap-2 text-sm">
              <input checked={values.terms} className="mt-0.5 size-4 accent-brand-600" name="terms" onBlur={handleBlur} onChange={handleChange} type="checkbox" />
              {A.SELLER_TERMS}
            </label>
            {touched.terms && errors.terms && <p className="mt-1 text-xs text-red-600" role="alert">{errors.terms}</p>}
          </div>
        )}
        <Button className="sm:col-span-2" fullWidth loading={isSubmitting} size="lg" type="submit">{isSeller ? A.REGISTER_SELLER_TITLE : A.CREATE_ACCOUNT}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">{A.HAVE_ACCOUNT} <Link className="font-semibold text-brand-700 hover:underline" to={ROUTES.LOGIN}>{A.SIGN_IN}</Link></p>
    </div>
  );
}
