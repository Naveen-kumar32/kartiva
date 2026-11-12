import { useFormik } from "formik";
import { CheckCircle2, MessageSquareText } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { getMyProfile, sendEnquiry } from "@/api";
import { USER_ROLES } from "@/constants";
import { useAsync, useAuth } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast } from "@/utils/toast";
import { createEnquirySchema } from "@/validators";

import { Badge, Button, FormInput, FormSelect, FormTextarea, Modal, Skeleton } from "../ui";

const B = EN.BUYER_HUB.ENQUIRY;
const UNITS = ["unit", "pcs", "kg", "litre", "set", "box", "jar", "piece"];
const localPhone = (phone = "") => String(phone).replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
const today = () => new Date().toISOString().slice(0, 10);

const titleFor = (mode, product) => {
  if (mode === "test_ride") return B.TITLE_TEST_RIDE;
  if (mode === "on_road") return B.TITLE_ON_ROAD;
  return product ? B.TITLE_PRODUCT : B.TITLE_STORE;
};

function EnquiryForm({ initialQty, mode, onDone, product, store, user }) {
  // The saved profile (city, default address) prefills the form; fall back to the session user.
  const { data: profile, loading } = useAsync(() => getMyProfile(user).catch(() => user), [user.email]);
  if (loading) return <Skeleton className="h-72 w-full" />;
  return <EnquiryFields initialQty={initialQty} mode={mode} onDone={onDone} product={product} store={store} user={profile ?? user} />;
}

function EnquiryFields({ initialQty, mode, onDone, product, store, user }) {
  const city = user.city || user.addresses?.find((a) => a.isDefault)?.city || user.addresses?.[0]?.city || "";
  const message = mode === "test_ride" ? B.MSG_TEST_RIDE(product?.name ?? store.name)
    : mode === "on_road" ? B.MSG_ON_ROAD(product.name, city)
      : product ? B.MSG_PRODUCT(product.name) : B.MSG_STORE(store.name);
  const formik = useFormik({
    initialValues: {
      city, message, name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(), phone: localPhone(user.phone), preferredDate: "",
      quantity: initialQty ?? 1, unit: "unit", wantsTestRide: mode === "test_ride",
    },
    onSubmit: async (values, { setSubmitting }) => {
      try {
        const enquiry = await sendEnquiry(user, { ...values, productId: product?.id ?? null, quantity: Number(values.quantity), storeSlug: store.slug });
        onDone(enquiry);
      } catch (err) {
        errorToast(getErrorMessage(err));
        setSubmitting(false);
      }
    },
    validationSchema: createEnquirySchema({ ...EN.VALIDATION, ...EN.BUYER_HUB.VALIDATION }),
  });
  const { errors, handleBlur, handleChange, handleSubmit, isSubmitting, setFieldValue, touched, values } = formik;
  const bulk = Number(values.quantity) >= 10;
  const field = (name) => ({ error: errors[name], name, onBlur: handleBlur, onChange: handleChange, touched: touched[name], value: values[name] });

  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit}>
      <p className="text-sm text-muted">{product ? B.ABOUT(product.name, store.name) : B.ABOUT_STORE(store.name)}</p>
      <div className="grid grid-cols-[1fr_1fr] gap-3">
        <FormInput {...field("quantity")} inputMode="numeric" label={B.QUANTITY} min={1} type="number" />
        <FormSelect {...field("unit")} label={B.UNIT} options={UNITS.map((u) => ({ label: B.UNITS[u], value: u }))} />
      </div>
      <p className="flex items-center gap-2 text-xs text-muted">
        {B.REQUIREMENT_TYPE}
        <Badge tone={bulk ? "brand" : "neutral"}>{bulk ? B.BULK : B.RETAIL}</Badge>
      </p>
      <FormTextarea {...field("message")} label={B.MESSAGE} rows={3} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormInput {...field("name")} autoComplete="name" label={B.NAME} />
        <FormInput {...field("phone")} autoComplete="tel-national" inputMode="numeric" label={B.PHONE} maxLength={10} />
        <FormInput {...field("city")} autoComplete="address-level2" className="sm:col-span-2" label={B.CITY} />
      </div>
      {product?.enquiryOnly && mode !== "test_ride" && (
        <label className="flex items-center gap-2 text-sm">
          <input checked={values.wantsTestRide} className="size-4 accent-brand-600" onChange={(e) => setFieldValue("wantsTestRide", e.target.checked)} type="checkbox" />
          {B.ALSO_TEST_RIDE}
        </label>
      )}
      {values.wantsTestRide && <FormInput {...field("preferredDate")} label={B.PREFERRED_DATE} min={today()} type="date" />}
      <p className="text-xs text-muted">{B.PRIVACY_NOTE}</p>
      <Button fullWidth loading={isSubmitting} size="lg" type="submit">{mode === "test_ride" ? B.SUBMIT_TEST_RIDE : B.SUBMIT}</Button>
    </form>
  );
}

// IndiaMART-style "Get best price" / "Send enquiry" / "Book a test ride" modal (buyers only).
// mode: "enquiry" | "on_road" | "test_ride". product may be null for store-level enquiries ("Contact supplier").
export function EnquiryModal({ initialQty, mode = "enquiry", onClose, open, product = null, store }) {
  const { user } = useAuth();
  const [sent, setSent] = useState(null);
  return (
    <Modal onClose={onClose} open={open} title={sent ? B.SENT_TITLE : titleFor(mode, product)}>
      <div className="-mx-1 max-h-[70vh] overflow-y-auto px-1">
        {sent ? (
          <div className="text-center">
            <CheckCircle2 aria-hidden className="mx-auto size-12 text-emerald-600" />
            <p className="mt-3 text-sm text-muted">{B.SENT_BODY(store.name, EN.MARKET.RESPONDS_IN(store.responseHours))}</p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <Button to={`${ROUTES.ACCOUNT.MESSAGES}?thread=${sent.threadId}`} variant="outline"><MessageSquareText className="size-4" />{B.OPEN_CHAT}</Button>
              <Button to={ROUTES.ACCOUNT.ENQUIRIES}>{B.MY_ENQUIRIES}</Button>
            </div>
          </div>
        ) : user && <EnquiryForm initialQty={initialQty} mode={mode} onDone={setSent} product={product} store={store} user={user} />}
      </div>
    </Modal>
  );
}

// Button that opens the enquiry modal. Guests go to login (and come back here); sellers/admins are told it's for buyers.
export function EnquiryButton({ children, className, fullWidth, initialQty, mode = "enquiry", product = null, size = "md", store, variant = "outline" }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [openKey, setOpenKey] = useState(0);
  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) { navigate(ROUTES.LOGIN, { state: { from: location.pathname + location.search } }); return; }
    if (user.role !== USER_ROLES.BUYER) { errorToast(B.BUYERS_ONLY); return; }
    setOpenKey((k) => k + 1);
  };
  return (
    <>
      <Button className={className} fullWidth={fullWidth} onClick={onClick} size={size} variant={variant}>{children}</Button>
      {openKey > 0 && <EnquiryModal initialQty={initialQty} key={openKey} mode={mode} onClose={() => setOpenKey(0)} open product={product} store={store} />}
    </>
  );
}
