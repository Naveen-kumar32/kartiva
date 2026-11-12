import { useFormik } from "formik";
import { Check, Eye, Minus, ShieldCheck, ShieldOff, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";

import { ADMIN_ROLES, getAdminStaff, inviteAdminStaff, removeAdminStaff, updateAdminStaff } from "@/api";
import {
  Button, ConfirmDialog, DataTable, ErrorState, FormInput, FormSelect, Modal, PageHeader, PageLoader, Panel, Select,
} from "@/components";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { errorToast, formatNumber, getErrorMessage, infoToast, successToast } from "@/utils";
import { createStaffInviteSchema } from "@/validators";

import { IconAction, KpiStrip, Pill, SrHeader } from "./opsShared";
import { timeAgo, useActor } from "./opsUtils";

const P = EN.ADMIN_PRO.STAFF;
const C = EN.ADMIN_PRO.COMMON;
const STATUS_TONE = { active: "success", disabled: "danger", invited: "warning" };
// f = full access, v = view only, - = no access
const MATRIX = {
  catalogue: { catalogue: "f", finance: "-", operations: "v", super_admin: "f", support: "v" },
  content: { catalogue: "f", finance: "-", operations: "f", super_admin: "f", support: "v" },
  finance: { catalogue: "-", finance: "f", operations: "v", super_admin: "f", support: "-" },
  orders: { catalogue: "v", finance: "v", operations: "f", super_admin: "f", support: "v" },
  risk: { catalogue: "-", finance: "v", operations: "f", super_admin: "f", support: "v" },
  sellers: { catalogue: "v", finance: "v", operations: "f", super_admin: "f", support: "v" },
  settings: { catalogue: "-", finance: "-", operations: "-", super_admin: "f", support: "-" },
  support: { catalogue: "v", finance: "v", operations: "f", super_admin: "f", support: "f" },
};
const CELL = { "-": [Minus, "text-slate-300"], f: [Check, "text-emerald-600"], v: [Eye, "text-sky-600"] };

export function AdminStaff() {
  useDocumentTitle(P.TITLE);
  const actor = useActor();
  const { user } = useAuth();
  const { data, error, loading, reload, setData } = useAsync(getAdminStaff, []);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const refresh = async () => setData(await getAdminStaff());
  const patch = async (m, change, message) => {
    try {
      await updateAdminStaff(m.id, change, actor);
      await refresh();
      infoToast(message);
    } catch (err) {
      errorToast(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader actions={<Button onClick={() => setInviting(true)}><UserPlus className="size-4" />{P.INVITE}</Button>} subtitle={P.SUBTITLE} title={P.TITLE} />
      <KpiStrip className="xl:grid-cols-4" items={[
        [P.KPI_ACTIVE, formatNumber(data.filter((m) => m.status === "active").length)],
        [P.KPI_INVITED, formatNumber(data.filter((m) => m.status === "invited").length)],
        [P.KPI_2FA, `${formatNumber(data.filter((m) => m.twoFactor).length)} / ${formatNumber(data.length)}`, data.some((m) => !m.twoFactor && m.status === "active") ? "warning" : "success"],
        [P.KPI_SUPER, formatNumber(data.filter((m) => m.role === "super_admin").length)],
      ]} />
      <Panel title={P.TEAM}>
        <DataTable
          columns={[
            { header: P.COL_NAME, key: "name", render: (m) => <><span className="font-medium">{m.name}</span>{m.email === user?.email && <span className="ml-1.5 text-xs text-muted">{P.YOU}</span>}<span className="block text-xs text-muted">{m.email}</span></> },
            { header: P.COL_ROLE, key: "role", render: (m) => (
              <Select ariaLabel={P.CHANGE_ROLE(m.name)} className="w-44" disabled={m.email === user?.email} onChange={(v) => patch(m, { role: v }, P.ROLE_CHANGED(m.name, P.ROLE[v]))} options={ADMIN_ROLES.map((r) => ({ label: P.ROLE[r], value: r }))} size="sm" value={m.role} />
            ) },
            { header: "2FA", key: "twoFactor", render: (m) => (m.twoFactor ? <Pill tone="success"><ShieldCheck aria-hidden className="size-3.5" />{P.TFA_ON}</Pill> : <Pill tone="warning"><ShieldOff aria-hidden className="size-3.5" />{P.TFA_OFF}</Pill>) },
            { header: C.STATUS, key: "status", render: (m) => <Pill tone={STATUS_TONE[m.status]}>{P.STATUS[m.status] ?? m.status}</Pill> },
            { header: P.COL_LAST_ACTIVE, key: "lastActiveAt", render: (m) => <span className="text-xs text-muted">{m.lastActiveAt ? timeAgo(m.lastActiveAt) : P.NEVER}</span> },
            { header: <SrHeader>{C.ACTIONS}</SrHeader>, key: "actions", render: (m) => m.email !== user?.email && (
              <span className="flex items-center justify-end gap-1">
                {m.status === "disabled"
                  ? <Button onClick={() => patch(m, { status: "active" }, P.ENABLED(m.name))} size="sm" variant="outline">{P.ENABLE}</Button>
                  : <Button onClick={() => patch(m, { status: "disabled" }, P.DISABLED(m.name))} size="sm" variant="ghost">{P.DISABLE}</Button>}
                <IconAction danger icon={Trash2} label={P.REMOVE(m.name)} onClick={() => setRemoving(m)} />
              </span>
            ) },
          ]}
          rows={data}
        />
      </Panel>

      <Panel title={P.MATRIX}>
        <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">{P.MATRIX_NOTE}</p>
        <div className="relative -mx-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-y border-line bg-slate-50 text-xs uppercase tracking-wide text-muted">
              <th className="px-5 py-2.5 text-left font-semibold" scope="col">{P.MODULE}</th>
              {ADMIN_ROLES.map((r) => <th className="px-3 py-2.5 text-center font-semibold" key={r} scope="col">{P.ROLE[r]}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-line">
              {Object.entries(MATRIX).map(([mod, row]) => (
                <tr key={mod}>
                  <th className="px-5 py-2.5 text-left font-medium" scope="row">{P.MODULES[mod]}</th>
                  {ADMIN_ROLES.map((r) => {
                    const [Icon, tone] = CELL[row[r]];
                    return <td className="px-3 py-2.5 text-center" key={r}><Icon aria-label={P.ACCESS[row[r]]} className={`mx-auto size-4 ${tone}`} role="img" /></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
          {Object.entries(CELL).reverse().map(([k, [Icon, tone]]) => <li className="flex items-center gap-1.5" key={k}><Icon aria-hidden className={`size-3.5 ${tone}`} />{P.ACCESS[k]}</li>)}
        </ul>
      </Panel>

      {inviting && <InviteModal actor={actor} onClose={() => setInviting(false)} onSaved={async () => { await refresh(); setInviting(false); }} />}
      <ConfirmDialog
        body={removing ? P.REMOVE_BODY(removing.name) : ""}
        confirmLabel={P.REMOVE_CONFIRM}
        danger
        loading={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await removeAdminStaff(removing.id, user?.email, actor);
            await refresh();
            infoToast(P.REMOVED(removing.name));
            setRemoving(null);
          } catch (err) {
            errorToast(getErrorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
        open={Boolean(removing)}
        title={P.REMOVE_TITLE}
      />
    </div>
  );
}

function InviteModal({ actor, onClose, onSaved }) {
  const formik = useFormik({
    initialValues: { email: "", name: "", role: "support" },
    onSubmit: async (values) => {
      try {
        await inviteAdminStaff(values, actor);
        successToast(P.INVITED(values.email));
        await onSaved();
      } catch (err) {
        errorToast(getErrorMessage(err));
      }
    },
    validationSchema: createStaffInviteSchema(EN.VALIDATION),
  });
  const field = (name) => ({ error: formik.errors[name], name, onBlur: formik.handleBlur, onChange: formik.handleChange, touched: formik.touched[name], value: formik.values[name] });
  return (
    <Modal onClose={onClose} open title={P.INVITE}>
      <form className="space-y-3" noValidate onSubmit={formik.handleSubmit}>
        <FormInput autoComplete="off" label={P.F_NAME} {...field("name")} />
        <FormInput autoComplete="off" label={P.F_EMAIL} type="email" {...field("email")} />
        <FormSelect label={P.COL_ROLE} options={ADMIN_ROLES.map((r) => ({ label: P.ROLE[r], value: r }))} {...field("role")} />
        <p className="text-xs text-muted">{P.INVITE_NOTE}</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} variant="ghost">{C.CANCEL}</Button>
          <Button loading={formik.isSubmitting} type="submit"><UserPlus className="size-4" />{P.SEND_INVITE}</Button>
        </div>
      </form>
    </Modal>
  );
}
