import { useFormik } from "formik";
import { BellRing, Download, KeyRound, MapPin, Pencil, Plus, ShieldAlert, Star, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { changePassword, deleteAddress, exportMyData, getMyProfile, requestAccountDeletion, saveAddress, saveNotificationPrefs, setDefaultAddress, updateProfile } from "@/api";
import {
  Badge, Button, ConfirmDialog, Container, ErrorState, FormInput, FormSelect, Modal, PageHeader, PageLoader, Panel, PromptDialog, Toggle,
} from "@/components";
import { INDIAN_STATES } from "@/constants";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { setCredentials } from "@/store/slices/authSlice";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast, successToast } from "@/utils/toast";
import { createAddressSchema, createPasswordChangeSchema, createProfileSchema } from "@/validators";

const B = EN.BUYER_HUB.PROFILE;
const C = EN.CHECKOUT;
const localPhone = (phone = "") => String(phone).replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
const EMPTY_ADDRESS = { city: "", fullName: "", gstin: "", isDefault: false, label: "", line1: "", line2: "", phone: "", pincode: "", state: "" };

function useFields(formik) {
  const { errors, handleBlur, handleChange, touched, values } = formik;
  return (name) => ({ error: errors[name], name, onBlur: handleBlur, onChange: handleChange, touched: touched[name], value: values[name] ?? "" });
}

function DetailsForm({ onSaved, profile }) {
  const formik = useFormik({
    initialValues: { businessName: profile.businessName ?? "", city: profile.city ?? "", firstName: profile.firstName ?? "", gstin: profile.gstin ?? "", lastName: profile.lastName ?? "", phone: localPhone(profile.phone) },
    onSubmit: async (values, { setSubmitting }) => {
      try { onSaved(await updateProfile(profile, values)); successToast(B.SAVED); } catch (err) { errorToast(getErrorMessage(err)); } finally { setSubmitting(false); }
    },
    validationSchema: createProfileSchema(EN.VALIDATION),
  });
  const field = useFields(formik);
  return (
    <form noValidate onSubmit={formik.handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormInput {...field("firstName")} autoComplete="given-name" label={B.FIRST_NAME} />
        <FormInput {...field("lastName")} autoComplete="family-name" label={B.LAST_NAME} />
        <FormInput disabled hint={B.EMAIL_HINT} label={B.EMAIL} name="email" readOnly value={profile.email} />
        <FormInput {...field("phone")} autoComplete="tel-national" inputMode="numeric" label={C.PHONE} maxLength={10} />
        <FormInput {...field("city")} autoComplete="address-level2" label={C.CITY} />
      </div>
      <h3 className="mt-6 text-sm font-semibold">{B.BUSINESS_TITLE}</h3>
      <p className="mb-3 text-xs text-muted">{B.BUSINESS_HINT}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormInput {...field("businessName")} autoComplete="organization" label={B.BUSINESS_NAME} />
        <FormInput {...field("gstin")} label={B.GSTIN} maxLength={15} onChange={(e) => formik.setFieldValue("gstin", e.target.value.toUpperCase())} />
      </div>
      <div className="mt-5 flex justify-end"><Button loading={formik.isSubmitting} type="submit">{EN.COMMON.SAVE}</Button></div>
    </form>
  );
}

function AddressForm({ address, onDone, user }) {
  const formik = useFormik({
    initialValues: { ...EMPTY_ADDRESS, ...address, phone: localPhone(address?.phone) },
    onSubmit: async (values, { setSubmitting }) => {
      try { onDone(await saveAddress(user, values)); successToast(B.ADDRESS_SAVED); } catch (err) { errorToast(getErrorMessage(err)); setSubmitting(false); }
    },
    validationSchema: createAddressSchema(EN.VALIDATION),
  });
  const field = useFields(formik);
  return (
    <form noValidate onSubmit={formik.handleSubmit}>
      <div className="-mx-1 max-h-[65vh] overflow-y-auto px-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormInput {...field("label")} label={B.ADDRESS_LABEL} placeholder={B.ADDRESS_LABEL_PLACEHOLDER} />
          <FormInput {...field("fullName")} autoComplete="name" label={C.FULL_NAME} />
          <FormInput {...field("phone")} autoComplete="tel-national" inputMode="numeric" label={C.PHONE} maxLength={10} />
          <FormInput {...field("pincode")} autoComplete="postal-code" inputMode="numeric" label={C.PINCODE} maxLength={6} />
          <FormInput {...field("line1")} autoComplete="address-line1" className="sm:col-span-2" label={C.ADDRESS_LINE1} />
          <FormInput {...field("line2")} autoComplete="address-line2" className="sm:col-span-2" label={C.ADDRESS_LINE2} />
          <FormInput {...field("city")} autoComplete="address-level2" label={C.CITY} />
          <FormSelect {...field("state")} label={C.STATE} options={INDIAN_STATES.map((s) => ({ label: s.name, value: s.name }))} placeholder="—" />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input checked={Boolean(formik.values.isDefault)} className="size-4 accent-brand-600" onChange={(e) => formik.setFieldValue("isDefault", e.target.checked)} type="checkbox" />
          {B.MAKE_DEFAULT}
        </label>
      </div>
      <div className="mt-5 flex justify-end"><Button loading={formik.isSubmitting} type="submit">{B.SAVE_ADDRESS}</Button></div>
    </form>
  );
}

function PasswordForm({ user }) {
  const formik = useFormik({
    initialValues: { confirmPassword: "", currentPassword: "", newPassword: "" },
    onSubmit: async (values, { resetForm, setSubmitting }) => {
      try { await changePassword(user, values); successToast(B.PASSWORD_CHANGED); resetForm(); } catch (err) { errorToast(getErrorMessage(err)); setSubmitting(false); }
    },
    validationSchema: createPasswordChangeSchema(EN.VALIDATION),
  });
  const field = useFields(formik);
  return (
    <form className="space-y-3" noValidate onSubmit={formik.handleSubmit}>
      <FormInput {...field("currentPassword")} autoComplete="current-password" label={B.CURRENT_PASSWORD} type="password" />
      <FormInput {...field("newPassword")} autoComplete="new-password" label={B.NEW_PASSWORD} type="password" />
      <FormInput {...field("confirmPassword")} autoComplete="new-password" label={B.CONFIRM_PASSWORD} type="password" />
      <Button loading={formik.isSubmitting} type="submit" variant="outline"><KeyRound className="size-4" />{B.CHANGE_PASSWORD}</Button>
    </form>
  );
}

export function Profile() {
  useDocumentTitle(B.TITLE);
  const { user } = useAuth();
  const dispatch = useDispatch();
  const accessToken = useSelector((s) => s.auth.accessToken);
  const { data: profile, error, loading, reload, setData } = useAsync(() => getMyProfile(user), [user?.email]);
  const [editing, setEditing] = useState(null); // address object (new = {})
  const [removing, setRemoving] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading) return <PageLoader />;
  if (error) return <Container className="pt-6"><ErrorState message={error} onRetry={reload} /></Container>;

  // Keep the signed-in user (header, checkout prefill) in sync — the access token stays as is.
  const apply = (updated) => { setData(updated); dispatch(setCredentials({ access: accessToken, user: updated })); };
  const act = async (fn, msg) => {
    setBusy(true);
    try { apply(await fn()); if (msg) successToast(msg); } catch (err) { errorToast(getErrorMessage(err)); } finally { setBusy(false); }
  };
  const download = async () => {
    try {
      const payload = await exportMyData(user);
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { download: `kartiva-my-data-${new Date().toISOString().slice(0, 10)}.json`, href: url });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      successToast(B.DOWNLOADED);
    } catch (err) {
      errorToast(getErrorMessage(err));
    }
  };
  const requestDelete = async (reason) => {
    setBusy(true);
    try { const t = await requestAccountDeletion(user, reason); setDeleteOpen(false); successToast(B.DELETE_REQUESTED(t.number)); } catch (err) { errorToast(getErrorMessage(err)); } finally { setBusy(false); }
  };
  const addresses = profile.addresses ?? [];

  return (
    <Container className="max-w-5xl space-y-6 pt-6">
      <PageHeader subtitle={B.SUBTITLE} title={B.TITLE} />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title={<span className="flex items-center gap-2"><UserRound aria-hidden className="size-5 text-brand-600" />{B.DETAILS}</span>}>
          <DetailsForm onSaved={apply} profile={profile} />
        </Panel>
        <div className="space-y-6">
          <Panel title={<span className="flex items-center gap-2"><BellRing aria-hidden className="size-5 text-brand-600" />{EN.ACCOUNT_HUB.PREFS_TITLE}</span>}>
            <p className="mb-3 text-sm text-muted">{EN.ACCOUNT_HUB.PREFS_HINT}</p>
            <ul className="divide-y divide-line">
              {["email", "sms", "whatsapp"].map((k) => {
                const prefs = { email: true, sms: true, whatsapp: false, ...profile.notificationPrefs };
                return (
                  <li className="flex items-center justify-between gap-3 py-2.5" key={k}>
                    <span><span className="block text-sm font-medium">{EN.ACCOUNT_HUB.PREFS[k]}</span><span className="block text-xs text-muted">{EN.ACCOUNT_HUB.PREFS_DESC[k]}</span></span>
                    <Toggle checked={prefs[k]} label={EN.ACCOUNT_HUB.PREFS[k]} onChange={(v) => act(() => saveNotificationPrefs(user, { ...prefs, [k]: v }), EN.ACCOUNT_HUB.PREFS_SAVED)} />
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel title={<span className="flex items-center gap-2"><KeyRound aria-hidden className="size-5 text-brand-600" />{B.PASSWORD_TITLE}</span>}>
            <PasswordForm user={user} />
          </Panel>
          <Panel title={<span className="flex items-center gap-2"><ShieldAlert aria-hidden className="size-5 text-brand-600" />{B.PRIVACY_TITLE}</span>}>
            <p className="text-sm text-muted">{B.PRIVACY_BODY}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={download} size="sm" variant="outline"><Download className="size-4" />{B.DOWNLOAD_DATA}</Button>
              <Button onClick={() => setDeleteOpen(true)} size="sm" variant="ghost"><Trash2 className="size-4 text-red-600" />{B.DELETE_ACCOUNT}</Button>
            </div>
          </Panel>
        </div>
      </div>

      <Panel action={<Button onClick={() => setEditing({})} size="sm"><Plus className="size-4" />{B.ADD_ADDRESS}</Button>} title={<span className="flex items-center gap-2"><MapPin aria-hidden className="size-5 text-brand-600" />{B.SAVED_ADDRESSES}</span>}>
        {!addresses.length && <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{B.NO_ADDRESSES}</p>}
        <ul className="grid gap-3 md:grid-cols-2">
          {addresses.map((a) => (
            <li className="rounded-xl border border-line p-4" key={a.id}>
              <p className="flex flex-wrap items-center gap-2 font-semibold">{a.label || B.ADDRESS}{a.isDefault && <Badge tone="brand">{B.DEFAULT}</Badge>}</p>
              <p className="mt-1 text-sm">{a.fullName} · {a.phone}</p>
              <p className="text-sm text-muted">{[a.line1, a.line2, `${a.city} ${a.pincode}`, a.state].filter(Boolean).join(", ")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => setEditing(a)} size="sm" variant="outline"><Pencil className="size-3.5" />{B.EDIT}</Button>
                {!a.isDefault && <Button disabled={busy} onClick={() => act(() => setDefaultAddress(user, a.id), B.DEFAULT_SET)} size="sm" variant="ghost"><Star className="size-3.5" />{B.SET_DEFAULT}</Button>}
                <Button onClick={() => setRemoving(a)} size="sm" variant="ghost"><Trash2 className="size-3.5" />{B.DELETE}</Button>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Modal onClose={() => setEditing(null)} open={Boolean(editing)} title={editing?.id ? B.EDIT_ADDRESS : B.ADD_ADDRESS}>
        {editing && <AddressForm address={editing} key={editing.id ?? "new"} onDone={(u) => { apply(u); setEditing(null); }} user={user} />}
      </Modal>
      <ConfirmDialog
        body={B.DELETE_ADDRESS_BODY}
        confirmLabel={B.DELETE}
        danger
        loading={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => { await act(() => deleteAddress(user, removing.id), B.ADDRESS_DELETED); setRemoving(null); }}
        open={Boolean(removing)}
        title={B.DELETE_ADDRESS_TITLE}
      />
      {deleteOpen && (
        <PromptDialog
          body={B.DELETE_BODY}
          confirmLabel={B.DELETE_CONFIRM}
          danger
          label={B.DELETE_REASON}
          loading={busy}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={requestDelete}
          open
          required={false}
          title={B.DELETE_ACCOUNT}
        />
      )}
    </Container>
  );
}
