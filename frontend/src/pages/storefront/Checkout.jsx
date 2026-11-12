import { useFormik } from "formik";
import { Banknote, Check, CreditCard, Lock, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { Navigate, useNavigate } from "react-router-dom";

import { isCodBlocked, placeOrder } from "@/api";
import { Button, Container, FormInput, FormSelect, Modal, SmartImage, StoreAvatar } from "@/components";
import { INDIAN_STATES, PAYMENT_METHODS, stateCodeOf } from "@/constants";
import { DEMO_ADDRESS, PLATFORM } from "@/data";
import { useAuth, useCartView, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { clearCart } from "@/store/slices/cartSlice";
import { isServiceable, shippingFee } from "@/utils/catalog";
import { cn } from "@/utils/cn";
import { formatCurrency } from "@/utils/format";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { splitGst } from "@/utils/gst";
import { errorToast, infoToast } from "@/utils/toast";
import { createAddressSchema } from "@/validators";

const C = EN.CHECKOUT;
const canServe = (method, pincode) => method.type === "store_pickup" || isServiceable(method, pincode);
const STEPS = [C.STEP_ADDRESS, C.STEP_DELIVERY, C.STEP_PAYMENT, C.STEP_REVIEW];
const ADDRESS_FIELDS = ["city", "fullName", "line1", "line2", "phone", "pincode", "state"];
const pickAddress = (a) => Object.fromEntries(ADDRESS_FIELDS.map((k) => [k, a[k] ?? ""]));

export function Checkout() {
  useDocumentTitle(C.TITLE);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState({});
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS.ONLINE);
  const [gatewayOpen, setGatewayOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  // One key per checkout visit: a retry or double submit can never create two orders.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const view = useCartView(choices);
  const savedAddresses = user?.addresses ?? [];
  const defaultSaved = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0];

  const formik = useFormik({
    initialValues: defaultSaved
      ? { ...pickAddress(defaultSaved), gstin: user?.gstin ?? "" }
      : { ...DEMO_ADDRESS, fullName: user ? `${user.firstName} ${user.lastName ?? ""}`.trim() : DEMO_ADDRESS.fullName, gstin: user?.gstin ?? "" },
    // After the address is known, switch any seller whose current method can't reach this PIN code
    // to their cheapest serviceable method.
    onSubmit: ({ pincode }) => {
      const next = { ...choices };
      view.groups.forEach((g) => {
        if (canServe(g.method, pincode)) return;
        const ok = g.store.shippingMethods.filter((m) => canServe(m, pincode)).sort((a, b) => shippingFee(a, g.subtotal) - shippingFee(b, g.subtotal));
        if (ok[0]) next[g.store.slug] = ok[0].id;
      });
      setChoices(next);
      setStep(1);
    },
    validationSchema: createAddressSchema(EN.VALIDATION),
  });
  const {
    errors, handleBlur, handleChange, handleSubmit, touched, values,
  } = formik;

  const buyerStateCode = stateCodeOf(values.state);
  const codReason = useMemo(() => {
    if (!PLATFORM.codEnabled) return C.COD_REASON_DISABLED;
    if (user && isCodBlocked(user.email)) return C.COD_REASON_BLOCKED;
    if (view.grandTotal > PLATFORM.codMaxOrderValue) return C.COD_REASON_LIMIT(formatCurrency(PLATFORM.codMaxOrderValue));
    if (view.groups.some((g) => !g.method.codAllowed)) return C.COD_REASON_METHOD;
    return null;
  }, [view, user]);

  const taxes = useMemo(() => view.groups.map((g) => {
    const interstate = g.store.gstStateCode !== buyerStateCode;
    return g.items.reduce((acc, it) => {
      const s = splitGst(it.lineTotal, it.product.gstRate, interstate);
      return { interstate, tax: acc.tax + s.tax, taxable: acc.taxable + s.taxable };
    }, { interstate, tax: 0, taxable: 0 });
  }), [view, buyerStateCode]);

  const undeliverable = view.groups.find((g) => !canServe(g.method, values.pincode));

  if (view.groups.length === 0 && !placing) return <Navigate replace to={ROUTES.CART} />;
  // If a delivery change made COD ineligible, fall back to online payment.
  const effectiveMethod = codReason ? PAYMENT_METHODS.ONLINE : paymentMethod;

  const finish = async () => {
    if (placing) return; // double-click guard (the API is idempotent too)
    setPlacing(true);
    try {
      const order = await placeOrder({
        address: { city: values.city, fullName: values.fullName, line1: values.line1, line2: values.line2, phone: values.phone, pincode: values.pincode, state: values.state },
        gstin: values.gstin, idempotencyKey, lines: view.groups.flatMap((g) => g.items.map(({ quantity, variantId }) => ({ quantity, variantId }))),
        paymentMethod: effectiveMethod, shippingChoices: Object.fromEntries(view.groups.map((g) => [g.store.slug, g.method.id])),
      });
      dispatch(clearCart());
      navigate(ROUTES.ORDER_SUCCESS(order.number), { replace: true });
    } catch (err) {
      errorToast(getErrorMessage(err));
      setPlacing(false);
    }
  };

  const onPlace = () => (effectiveMethod === PAYMENT_METHODS.ONLINE ? setGatewayOpen(true) : finish());

  return (
    <Container className="pt-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{C.TITLE}</h1>
        <span className="flex items-center gap-1.5 text-sm text-muted"><Lock aria-hidden className="size-4" />{C.NO_ADS_NOTE}</span>
      </div>

      <ol className="mb-6 grid grid-cols-4 gap-2" aria-label={C.STEPS_LABEL}>
        {STEPS.map((label, i) => (
          <li className="flex flex-col gap-1.5" key={label}>
            <span className={cn("h-1.5 rounded-full", i <= step ? "bg-brand-600" : "bg-slate-200")} />
            <span className={cn("flex items-center gap-1 text-xs font-medium sm:text-sm", i === step ? "text-ink" : "text-muted")} aria-current={i === step ? "step" : undefined}>
              {i < step && <Check aria-hidden className="size-3.5 text-brand-600" />}{label}
            </span>
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-2xl bg-white p-5 shadow-card sm:p-6">
          {step === 0 && (
            <form noValidate onSubmit={handleSubmit}>
              <h2 className="mb-4 text-lg font-semibold">{C.ADDRESS}</h2>
              {savedAddresses.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-sm font-medium">{EN.BUYER_HUB.PROFILE.SAVED_ADDRESSES}</p>
                  <div className="flex flex-wrap gap-2">
                    {savedAddresses.map((a) => (
                      <button className={cn("rounded-lg border px-3 py-2 text-left text-xs", values.line1 === a.line1 && values.pincode === a.pincode ? "border-brand-500 bg-brand-50" : "border-line hover:border-brand-300")} key={a.id} onClick={() => formik.setValues({ ...values, ...pickAddress(a) })} type="button">
                        <span className="block font-semibold">{a.label || a.fullName}</span>
                        <span className="block text-muted">{a.city} · {a.pincode}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <FormInput autoComplete="name" error={errors.fullName} label={C.FULL_NAME} name="fullName" onBlur={handleBlur} onChange={handleChange} touched={touched.fullName} value={values.fullName} />
                <FormInput autoComplete="tel-national" error={errors.phone} inputMode="numeric" label={C.PHONE} name="phone" onBlur={handleBlur} onChange={handleChange} touched={touched.phone} value={values.phone} />
                <FormInput autoComplete="address-line1" className="sm:col-span-2" error={errors.line1} label={C.ADDRESS_LINE1} name="line1" onBlur={handleBlur} onChange={handleChange} touched={touched.line1} value={values.line1} />
                <FormInput autoComplete="address-line2" className="sm:col-span-2" error={errors.line2} label={C.ADDRESS_LINE2} name="line2" onBlur={handleBlur} onChange={handleChange} touched={touched.line2} value={values.line2} />
                <FormInput autoComplete="address-level2" error={errors.city} label={C.CITY} name="city" onBlur={handleBlur} onChange={handleChange} touched={touched.city} value={values.city} />
                <FormInput autoComplete="postal-code" error={errors.pincode} inputMode="numeric" label={C.PINCODE} maxLength={6} name="pincode" onBlur={handleBlur} onChange={handleChange} touched={touched.pincode} value={values.pincode} />
                <FormSelect error={errors.state} label={C.STATE} name="state" onBlur={handleBlur} onChange={handleChange} options={INDIAN_STATES.map((s) => ({ label: s.name, value: s.name }))} placeholder="—" touched={touched.state} value={values.state} />
                <FormInput error={errors.gstin} label={C.BUYER_GSTIN} name="gstin" onBlur={handleBlur} onChange={(e) => formik.setFieldValue("gstin", e.target.value.toUpperCase())} touched={touched.gstin} value={values.gstin} />
              </div>
              <div className="mt-6 flex justify-end"><Button size="lg" type="submit">{C.CONTINUE}</Button></div>
            </form>
          )}

          {step === 1 && (
            <div>
              <h2 className="text-lg font-semibold">{C.DELIVERY_METHOD}</h2>
              <p className="mb-4 text-sm text-muted">{C.DELIVERY_STEP_HINT}</p>
              <div className="space-y-5">
                {view.groups.map((g, gi) => (
                  <fieldset className="rounded-xl border border-line p-4" key={g.store.slug}>
                    <legend className="flex items-center gap-2 px-1 text-sm font-semibold"><StoreAvatar size="size-6 text-[10px]" store={g.store} />{C.SHIPMENT(gi + 1, g.store.name)}</legend>
                    <div className="mb-3 flex gap-2 overflow-x-auto">
                      {g.items.map((it) => <SmartImage alt={it.product.name} className="size-12 shrink-0 rounded-md bg-slate-50 object-contain p-1" key={it.variantId} src={it.product.thumbnail} />)}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {g.store.shippingMethods.map((m) => {
                        const ok = canServe(m, values.pincode);
                        const fee = shippingFee(m, g.subtotal);
                        const active = g.method.id === m.id;
                        return (
                          <label className={cn("flex cursor-pointer gap-3 rounded-lg border-2 p-3 text-sm", active ? "border-brand-600 bg-brand-50" : "border-line", !ok && "cursor-not-allowed opacity-50")} key={m.id}>
                            <input checked={active} className="mt-0.5 accent-brand-600" disabled={!ok} name={`ship-${g.store.slug}`} onChange={() => setChoices((c) => ({ ...c, [g.store.slug]: m.id }))} type="radio" />
                            <span className="flex-1">
                              <span className="flex items-center justify-between gap-2 font-semibold"><span className="flex items-center gap-1.5"><Truck aria-hidden className="size-4 text-muted" />{m.name}</span><span className={fee === 0 ? "text-emerald-700" : "tabular"}>{fee === 0 ? EN.CART.FREE : formatCurrency(fee)}</span></span>
                              <span className="mt-0.5 block text-xs text-muted">{EN.COMMON.DAYS(m.minDays, m.maxDays)}{m.codAllowed ? " · COD" : ` · ${EN.PRODUCT.COD_UNAVAILABLE}`}{!ok ? ` · ${EN.PRODUCT.DELIVERY_NOT_SERVICEABLE}` : ""}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
              {undeliverable && <p className="mt-4 text-sm text-red-600" role="alert">{C.UNDELIVERABLE(undeliverable.store.name)}</p>}
              <StepNav nextDisabled={Boolean(undeliverable)} onBack={() => setStep(0)} onNext={() => setStep(2)} />
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="mb-4 text-lg font-semibold">{C.PAYMENT}</h2>
              <div className="space-y-3">
                <PaymentOption active={paymentMethod === PAYMENT_METHODS.ONLINE} hint={C.ONLINE_HINT} icon={CreditCard} label={C.ONLINE} onSelect={() => setPaymentMethod(PAYMENT_METHODS.ONLINE)} />
                <PaymentOption active={paymentMethod === PAYMENT_METHODS.COD} disabledReason={codReason} hint={C.COD_HINT} icon={Banknote} label={C.COD} onSelect={() => setPaymentMethod(PAYMENT_METHODS.COD)} />
              </div>
              <StepNav onBack={() => setStep(1)} onNext={() => setStep(3)} />
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="mb-4 text-lg font-semibold">{C.REVIEW}</h2>
              <div className="mb-4 rounded-xl bg-slate-50 p-4 text-sm">
                <p className="font-semibold">{values.fullName} · {values.phone}</p>
                <p className="text-muted">{values.line1}, {values.line2 && `${values.line2}, `}{values.city}, {values.state} {values.pincode}</p>
                <p className="mt-1 text-muted">{effectiveMethod === PAYMENT_METHODS.COD ? C.COD : C.ONLINE}{values.gstin && ` · GSTIN ${values.gstin}`}</p>
              </div>
              <h3 className="mb-2 text-sm font-semibold">{C.GST_BREAKDOWN}</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-2">{C.SHIPMENT_COL}</th><th className="py-2 text-right">{C.TAXABLE_VALUE}</th><th className="py-2 text-right">GST</th><th className="py-2 text-right">{EN.CART.DELIVERY}</th><th className="py-2 text-right">{EN.TABLE.TOTAL}</th></tr></thead>
                  <tbody>
                    {view.groups.map((g, i) => (
                      <tr className="border-b border-line" key={g.store.slug}>
                        <td className="py-2.5">{g.store.name}<span className="block text-xs text-muted">{taxes[i].interstate ? C.IGST : C.CGST_SGST} · {g.store.state}</span></td>
                        <td className="py-2.5 text-right tabular">{formatCurrency(taxes[i].taxable, { decimals: true })}</td>
                        <td className="py-2.5 text-right tabular">{formatCurrency(taxes[i].tax, { decimals: true })}</td>
                        <td className="py-2.5 text-right tabular">{g.fee === 0 ? EN.CART.FREE : formatCurrency(g.fee)}</td>
                        <td className="py-2.5 text-right font-semibold tabular">{formatCurrency(g.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-6 flex flex-wrap justify-between gap-3">
                <Button onClick={() => setStep(2)} variant="ghost">{C.BACK}</Button>
                <Button loading={placing} onClick={onPlace} size="lg" variant="accent">
                  {effectiveMethod === PAYMENT_METHODS.ONLINE ? C.PAY(formatCurrency(view.grandTotal)) : C.PLACE_ORDER}
                </Button>
              </div>
            </div>
          )}
        </div>

        <aside className="h-fit rounded-2xl bg-white p-5 shadow-card lg:sticky lg:top-36">
          <h2 className="font-bold">{EN.CART.SUMMARY}</h2>
          <ul className="mt-3 max-h-64 space-y-3 overflow-y-auto">
            {view.groups.flatMap((g) => g.items).map((it) => (
              <li className="flex gap-3 text-sm" key={it.variantId}>
                <SmartImage alt="" className="size-12 shrink-0 rounded-md bg-slate-50 object-contain p-1" src={it.product.thumbnail} />
                <span className="min-w-0 flex-1"><span className="line-clamp-1">{it.product.name}</span><span className="text-xs text-muted">× {it.quantity}</span></span>
                <span className="tabular">{formatCurrency(it.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted">{EN.CART.ITEMS_SUBTOTAL(view.itemCount)}</dt><dd className="tabular">{formatCurrency(view.itemsSubtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">{EN.CART.DELIVERY}</dt><dd className="tabular">{view.shippingTotal === 0 ? EN.CART.FREE : formatCurrency(view.shippingTotal)}</dd></div>
            <div className="flex justify-between text-xs"><dt className="text-muted">{C.INCLUDED_TAX}</dt><dd className="tabular text-muted">{formatCurrency(taxes.reduce((s, t) => s + t.tax, 0), { decimals: true })}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>{EN.CART.GRAND_TOTAL}</dt><dd className="tabular">{formatCurrency(view.grandTotal)}</dd></div>
          </dl>
        </aside>
      </div>

      <Modal onClose={() => { setGatewayOpen(false); infoToast(C.PAYMENT_CANCELLED); }} open={gatewayOpen} title={EN.ORDER.MOCK_GATEWAY_TITLE}>
        <p className="text-sm text-muted">{EN.ORDER.MOCK_GATEWAY_BODY}</p>
        <p className="my-4 text-center text-3xl font-bold tabular">{formatCurrency(view.grandTotal)}</p>
        <div className="grid gap-2">
          <Button loading={placing} onClick={() => { setGatewayOpen(false); finish(); }} size="lg">{EN.ORDER.MOCK_GATEWAY_SUCCESS}</Button>
          <Button onClick={() => { setGatewayOpen(false); errorToast(C.PAYMENT_FAILED); }} variant="outline">{EN.ORDER.MOCK_GATEWAY_FAIL}</Button>
        </div>
      </Modal>
    </Container>
  );
}

function StepNav({ nextDisabled, onBack, onNext }) {
  return (
    <div className="mt-6 flex justify-between">
      <Button onClick={onBack} variant="ghost">{C.BACK}</Button>
      <Button disabled={nextDisabled} onClick={onNext} size="lg">{C.CONTINUE}</Button>
    </div>
  );
}

function PaymentOption({ active, disabledReason, hint, icon: Icon, label, onSelect }) {
  const disabled = Boolean(disabledReason);
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4", active && !disabled ? "border-brand-600 bg-brand-50" : "border-line", disabled && "cursor-not-allowed opacity-60")}>
      <input checked={active && !disabled} className="mt-1 accent-brand-600" disabled={disabled} name="payment" onChange={onSelect} type="radio" />
      <Icon aria-hidden className="mt-0.5 size-5 text-brand-700" />
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-muted">{disabled ? C.COD_UNAVAILABLE(disabledReason) : hint}</span>
      </span>
    </label>
  );
}
