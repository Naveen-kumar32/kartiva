import { useFormik } from "formik";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { login } from "@/api";
import { Button, FormInput } from "@/components";
import { USER_ROLES } from "@/constants";
import { DEMO_USERS, STORES } from "@/data";
import { useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { setCredentials } from "@/store/slices/authSlice";
import { getDashboardRouteForRole, safeNextPath } from "@/utils/authRedirect";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast, successToast } from "@/utils/toast";
import { createLoginSchema } from "@/validators";

const STORE_NAME = Object.fromEntries(STORES.map((st) => [st.slug, st.name]));
const MAIN_SELLERS = 5; // the rest sit behind "+N more sellers" to keep the panel tidy
const sellerCount = DEMO_USERS.filter((u) => u.role === USER_ROLES.SELLER).length;
const DEMO_GROUPS = [[EN.AUTH.DEMO_BUYERS, USER_ROLES.BUYER], [EN.AUTH.DEMO_SELLERS, USER_ROLES.SELLER], [EN.AUTH.DEMO_ADMIN, USER_ROLES.ADMIN]];
const ROLE_LABEL = { [USER_ROLES.ADMIN]: EN.AUTH.ROLE_ADMIN, [USER_ROLES.BUYER]: EN.AUTH.ROLE_BUYER, [USER_ROLES.SELLER]: EN.AUTH.ROLE_SELLER };

export function Login() {
  const [params] = useSearchParams();
  const asSeller = params.get("as") === "seller";
  const [allSellers, setAllSellers] = useState(false);
  useDocumentTitle(asSeller ? EN.AUTH.SELLER_LOGIN_TITLE : EN.AUTH.SIGN_IN);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const formik = useFormik({
    initialValues: { email: "", password: "" },
    onSubmit: async (values) => {
      try {
        const response = await login(values);
        dispatch(setCredentials(response));
        successToast(EN.AUTH.WELCOME(response.user.firstName));
        const next = response.user.role === USER_ROLES.BUYER ? safeNextPath(location.state?.from) : null;
        navigate(next ?? getDashboardRouteForRole(response.user.role), { replace: true });
      } catch (err) {
        errorToast(getErrorMessage(err));
      }
    },
    validationSchema: createLoginSchema(EN.VALIDATION),
  });
  const {
    errors: { email: errorEmail, password: errorPassword },
    handleBlur, handleChange, handleSubmit, isSubmitting, setValues,
    touched: { email: touchedEmail, password: touchedPassword },
    values: { email, password },
  } = formik;

  return (
    <div>
      <h1 className="text-2xl font-bold">{asSeller ? EN.AUTH.SELLER_LOGIN_TITLE : EN.AUTH.LOGIN_TITLE}</h1>
      <p className="mt-1 text-sm text-muted">{asSeller ? EN.AUTH.SELLER_LOGIN_SUBTITLE : EN.AUTH.LOGIN_SUBTITLE}</p>

      <div className="mt-6 rounded-xl border border-dashed border-brand-300 bg-brand-50/60 p-3">
        <p className="mb-2 text-xs font-semibold text-brand-800">{EN.AUTH.DEMO_ACCOUNTS}</p>
        {DEMO_GROUPS.filter(([, role]) => !asSeller || role === USER_ROLES.SELLER).map(([title, role]) => (
          <div className="mt-2 first:mt-0" key={role}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</p>
            <div className="flex flex-wrap gap-1.5">
              {DEMO_USERS.filter((u) => u.role === role).slice(0, role === USER_ROLES.SELLER && !allSellers && !asSeller ? MAIN_SELLERS : undefined).map((u) => (
                <button aria-label={`${ROLE_LABEL[u.role]} · ${u.firstName}`} className="rounded-lg bg-white px-2.5 py-1.5 text-left text-xs font-medium shadow-sm ring-1 ring-brand-200 hover:ring-brand-500" key={u.email} onClick={() => setValues({ email: u.email, password: u.password })} title={u.email} type="button">
                  {u.firstName}{u.storeSlug || u.businessName ? <span className="text-muted"> · {STORE_NAME[u.storeSlug] ?? u.businessName}</span> : null}
                </button>
              ))}
              {role === USER_ROLES.SELLER && !asSeller && sellerCount > MAIN_SELLERS && (
                <button className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:underline" onClick={() => setAllSellers((v) => !v)} type="button">
                  {allSellers ? EN.AUTH.FEWER_SELLERS : EN.AUTH.MORE_SELLERS(sellerCount - MAIN_SELLERS)}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
        <FormInput autoComplete="email" error={errorEmail} label={EN.AUTH.EMAIL} name="email" onBlur={handleBlur} onChange={handleChange} touched={touchedEmail} type="email" value={email} />
        <FormInput autoComplete="current-password" error={errorPassword} label={EN.AUTH.PASSWORD} name="password" onBlur={handleBlur} onChange={handleChange} touched={touchedPassword} type="password" value={password} />
        <div className="text-right"><Link className="text-sm font-medium text-brand-700 hover:underline" to={ROUTES.FORGOT_PASSWORD}>{EN.AUTH.FORGOT_PASSWORD}</Link></div>
        <Button fullWidth loading={isSubmitting} size="lg" type="submit">{EN.AUTH.SIGN_IN}</Button>
      </form>
      {asSeller ? (
        <div className="mt-6 space-y-2 text-center text-sm text-muted">
          <p>{EN.AUTH.NEW_SELLER} <Link className="font-semibold text-brand-700 hover:underline" to={ROUTES.REGISTER_SELLER}>{EN.AUTH.REGISTER_SELLER_TITLE}</Link></p>
          <p><Link className="font-semibold text-brand-700 hover:underline" to={ROUTES.LOGIN}>{EN.AUTH.CUSTOMER_SIGN_IN}</Link></p>
        </div>
      ) : (
        <p className="mt-6 text-center text-sm text-muted">{EN.AUTH.NEW_HERE} <Link className="font-semibold text-brand-700 hover:underline" to={ROUTES.REGISTER}>{EN.AUTH.CREATE_ACCOUNT}</Link></p>
      )}
    </div>
  );
}
