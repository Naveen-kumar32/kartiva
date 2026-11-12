import { useFormik } from "formik";
import { ShieldAlert } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { createTicket } from "@/api";
import { Breadcrumbs, Button, Container, FormInput, FormSelect, FormTextarea } from "@/components";
import { useAuth, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast, successToast } from "@/utils/toast";
import { createReportSchema } from "@/validators";

const R = EN.SITE.REPORT;
const TYPES = ["violation", "ip", "dispute"];
const PRIORITY = { dispute: "high", ip: "high", violation: "medium" };

// Report IP infringement / a policy violation / file a trade dispute → creates a support ticket for Trust & Safety.
export function Report() {
  const [params] = useSearchParams();
  const initialType = TYPES.includes(params.get("type")) ? params.get("type") : "violation";
  const { user } = useAuth();
  const navigate = useNavigate();
  const formik = useFormik({
    initialValues: { description: "", link: "", type: initialType },
    onSubmit: async (values) => {
      if (!user) { navigate(ROUTES.LOGIN, { state: { from: `${ROUTES.REPORT}?type=${values.type}` } }); return; }
      try {
        const ticket = await createTicket(user, {
          category: values.type, message: `${values.link ? `Reference: ${values.link}\n\n` : ""}${values.description}`, priority: PRIORITY[values.type],
          subject: `${R.TITLES[values.type]}${values.link ? ` — ${values.link.slice(0, 60)}` : ""}`,
        });
        successToast(R.SUBMITTED(ticket.number));
        navigate(ROUTES.ACCOUNT.SUPPORT);
      } catch (err) {
        errorToast(getErrorMessage(err));
      }
    },
    validationSchema: createReportSchema(EN.VALIDATION),
  });
  const { errors, handleBlur, handleChange, handleSubmit, isSubmitting, touched, values } = formik;
  useDocumentTitle(R.TITLES[values.type]);

  return (
    <Container className="max-w-3xl pt-4 sm:pt-6">
      <Breadcrumbs items={[{ label: EN.COMMON.HOME, to: ROUTES.HOME }, { label: EN.SITE.GROUPS.help, to: ROUTES.PAGE("faq") }, { label: R.TITLES[values.type] }]} />
      <div className="rounded-2xl bg-white p-5 shadow-card sm:p-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldAlert aria-hidden className="size-6 text-red-600" />{R.TITLES[values.type]}</h1>
        <p className="mt-2 text-muted">{R.BODY}</p>
        {!user && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">{R.LOGIN_NEEDED}</p>}
        <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
          <FormSelect label={R.TYPE} name="type" onChange={handleChange} options={TYPES.map((t) => ({ label: R.TYPES[t], value: t }))} value={values.type} />
          <FormInput error={errors.link} label={R.LINK} name="link" onBlur={handleBlur} onChange={handleChange} touched={touched.link} value={values.link} />
          <FormTextarea error={errors.description} label={R.DESCRIPTION} name="description" onBlur={handleBlur} onChange={handleChange} rows={6} touched={touched.description} value={values.description} />
          <p className="-mt-2 text-xs text-muted">{R.DESCRIPTION_HINT}</p>
          <Button loading={isSubmitting} type="submit">{R.SUBMIT}</Button>
        </form>
      </div>
    </Container>
  );
}
