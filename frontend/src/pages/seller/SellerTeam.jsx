import { useFormik } from "formik";
import { Check, Minus, RotateCw, Trash2, UserPlus, UserRoundCheck, UserRoundX } from "lucide-react";
import { useState } from "react";

import { getSellerTeam, inviteTeamMember, removeTeamMember, updateTeamMember } from "@/api";
import {
  Badge, Button, ConfirmDialog, DataTable, ErrorState, FormInput, FormSelect, Modal, PageHeader, PageLoader, Panel, Select,
} from "@/components";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { errorToast, formatDateTime, getErrorMessage, successToast } from "@/utils";
import { createTeamInviteSchema } from "@/validators";

const T = EN.SELLER_PRO.TEAM;
const ROLES = ["manager", "catalogue", "orders", "accounts"];
const AREAS = ["products", "inventory", "orders", "returns", "leads", "earnings", "ads", "settings"];
// Read-only permission matrix (what each role can do in Seller Hub)
const MATRIX = {
  accounts: ["earnings", "orders"],
  catalogue: ["products", "inventory", "ads"],
  manager: ["products", "inventory", "orders", "returns", "leads", "earnings", "ads"],
  orders: ["orders", "returns", "inventory", "leads"],
  owner: AREAS,
};
const STATUS_TONE = { active: "success", disabled: "neutral", invited: "warning" };

function InviteModal({ actor, onClose, onDone, open, storeSlug }) {
  const formik = useFormik({
    initialValues: { email: "", name: "", role: "catalogue" },
    onSubmit: async (values, { resetForm }) => {
      try {
        await inviteTeamMember(storeSlug, values, actor);
        successToast(T.INVITED(values.email.trim()));
        resetForm();
        onDone();
      } catch (err) {
        errorToast(getErrorMessage(err));
      }
    },
    validationSchema: createTeamInviteSchema(EN.VALIDATION),
  });
  const { errors, handleBlur, handleChange, handleSubmit, isSubmitting, touched, values } = formik;
  const field = (name) => ({ error: errors[name], name, onBlur: handleBlur, onChange: handleChange, touched: touched[name], value: values[name] });
  return (
    <Modal onClose={onClose} open={open} title={T.INVITE_TITLE}>
      <form className="space-y-4" noValidate onSubmit={handleSubmit}>
        <FormInput autoComplete="off" label={T.NAME} {...field("name")} />
        <FormInput autoComplete="off" label={T.EMAIL} type="email" {...field("email")} />
        <FormSelect label={T.ROLE} options={ROLES.map((r) => ({ label: T.ROLES[r], value: r }))} {...field("role")} />
        <p className="text-xs text-muted">{T.ROLE_HINT[values.role]}</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">{EN.COMMON.CANCEL}</Button>
          <Button loading={isSubmitting} type="submit"><UserPlus className="size-4" />{T.SEND_INVITE}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function SellerTeam() {
  useDocumentTitle(EN.SELLER.NAV_TEAM);
  const { user } = useAuth();
  const storeSlug = user.storeSlug;
  const actor = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
  const { data, error, loading, reload, setData } = useAsync(() => getSellerTeam(storeSlug), [storeSlug]);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => setData(await getSellerTeam(storeSlug));
  const act = async (fn, message) => {
    try {
      await fn();
      await refresh();
      successToast(message);
    } catch (err) {
      errorToast(getErrorMessage(err));
    }
  };

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-6">
      <PageHeader actions={<Button onClick={() => setInviting(true)} size="sm"><UserPlus className="size-4" />{T.INVITE}</Button>} subtitle={T.SUBTITLE} title={EN.SELLER.NAV_TEAM} />
      <Panel title={T.MEMBERS(data.length)}>
        <DataTable
          columns={[
            { header: T.MEMBER, key: "name", render: (m) => (
              <span className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">{m.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0"><span className="block font-medium">{m.name}{m.email === user.email && <span className="ml-1 text-xs text-muted">{T.YOU}</span>}</span><span className="block truncate text-xs text-muted">{m.email}</span></span>
              </span>
            ) },
            { header: T.ROLE, key: "role", render: (m) => (m.role === "owner" ? <Badge tone="accent">{T.ROLES.owner}</Badge> : (
              <Select ariaLabel={T.CHANGE_ROLE(m.name)} className="w-40" onChange={(v) => act(() => updateTeamMember(storeSlug, m.id, { role: v }, actor), T.ROLE_CHANGED)} options={ROLES.map((r) => ({ label: T.ROLES[r], value: r }))} size="sm" value={m.role} />
            )) },
            { header: EN.TABLE.STATUS, key: "status", render: (m) => <Badge tone={STATUS_TONE[m.status]}>{T.STATUS[m.status]}</Badge> },
            { header: T.LAST_ACTIVE, key: "lastActiveAt", render: (m) => (m.lastActiveAt ? formatDateTime(m.lastActiveAt) : m.invitedAt ? T.INVITED_ON(formatDateTime(m.invitedAt)) : "—") },
            { header: "", key: "actions", render: (m) => m.role !== "owner" && (
              <span className="flex justify-end gap-1">
                {m.status === "invited" && <Button onClick={() => act(() => updateTeamMember(storeSlug, m.id, { resend: true }, actor), T.RESENT)} size="sm" variant="ghost"><RotateCw className="size-4" />{T.RESEND}</Button>}
                {m.status === "active" && <Button onClick={() => act(() => updateTeamMember(storeSlug, m.id, { status: "disabled" }, actor), T.DISABLED)} size="sm" variant="ghost"><UserRoundX className="size-4" />{T.DISABLE}</Button>}
                {m.status === "disabled" && <Button onClick={() => act(() => updateTeamMember(storeSlug, m.id, { status: "active" }, actor), T.ENABLED)} size="sm" variant="ghost"><UserRoundCheck className="size-4" />{T.ENABLE}</Button>}
                <button aria-label={T.REMOVE(m.name)} className="grid size-8 place-items-center rounded-lg text-red-600 hover:bg-red-50" onClick={() => setRemoving(m)} type="button"><Trash2 className="size-4" /></button>
              </span>
            ) },
          ]}
          rows={data}
        />
      </Panel>

      <Panel title={T.PERMISSIONS}>
        <p className="-mt-2 mb-4 text-sm text-muted">{T.PERMISSIONS_BODY}</p>
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-y border-line bg-slate-50 text-xs uppercase tracking-wide text-muted"><th className="px-5 py-2.5 text-left" scope="col">{T.ROLE}</th>{AREAS.map((a) => <th className="px-2 py-2.5 text-center font-semibold" key={a} scope="col">{T.AREAS[a]}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {["owner", ...ROLES].map((r) => (
                <tr key={r}>
                  <th className="px-5 py-2.5 text-left font-medium" scope="row">{T.ROLES[r]}</th>
                  {AREAS.map((a) => (
                    <td className="px-2 py-2.5 text-center" key={a}>
                      {MATRIX[r].includes(a) ? <Check aria-label={T.ALLOWED} className="mx-auto size-4 text-emerald-600" /> : <Minus aria-label={T.NOT_ALLOWED} className="mx-auto size-4 text-slate-300" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <InviteModal actor={actor} onClose={() => setInviting(false)} onDone={async () => { setInviting(false); await refresh(); }} open={inviting} storeSlug={storeSlug} />
      <ConfirmDialog
        body={T.REMOVE_BODY}
        confirmLabel={T.REMOVE_CONFIRM}
        danger
        loading={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => { setBusy(true); await act(() => removeTeamMember(storeSlug, removing.id, actor), T.REMOVED); setBusy(false); setRemoving(null); }}
        open={Boolean(removing)}
        title={T.REMOVE(removing?.name ?? "")}
      />
    </div>
  );
}
