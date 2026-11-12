import { Ban, CheckCheck, EyeOff, RotateCcw, ShieldAlert, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { dismissRiskFlag, getRiskFlags, restoreRiskFlags, setStoreStatus, updateBuyer } from "@/api";
import { Button, EmptyState, ErrorState, PageHeader, PageLoader, Panel, PromptDialog, Tabs } from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { cn, errorToast, formatCurrency, formatDateTime, getErrorMessage, infoToast } from "@/utils";

import { SeverityChip } from "./opsShared";
import { useActor } from "./opsUtils";

const P = EN.ADMIN_PRO.RISK;
const LEVELS = ["high", "medium", "low"];
const TYPES = ["buyer_returns", "cod_high_value", "cod_blocked", "seller_quality", "kyc_selling", "spam_enquiry", "duplicate_phone"];
const LINK = { buyer: ROUTES.ADMIN.BUYERS, enquiry: ROUTES.ADMIN.LEADS, order: ROUTES.ADMIN.ORDERS, phone: ROUTES.ADMIN.BUYERS, store: ROUTES.ADMIN.SELLERS };

function reasonText(f) {
  const r = f.reason;
  switch (f.type) {
    case "buyer_returns": return P.R_BUYER(r.cancelled, r.returns, r.undelivered, r.subs);
    case "cod_high_value": return P.R_COD(formatCurrency(r.amount), r.buyer, P.SUB_STATUS[r.status] ?? r.status);
    case "cod_blocked": return P.R_COD_BLOCKED;
    case "seller_quality": return P.R_SELLER(r.cancelled, r.subs, r.rate.toFixed(1), r.returns);
    case "kyc_selling": return P.R_KYC(P.KYC[r.kycStatus] ?? r.kycStatus, r.orders);
    case "spam_enquiry": return P.R_SPAM(r.store, r.message);
    case "duplicate_phone": return P.R_PHONE(r.accounts.join(", "));
    default: return "";
  }
}

export function AdminRisk() {
  useDocumentTitle(P.TITLE);
  const actor = useActor();
  const { data, error, loading, reload, setData } = useAsync(getRiskFlags, []);
  const [level, setLevel] = useState("all");
  const [type, setType] = useState("");
  const [busy, setBusy] = useState(null);
  const [suspending, setSuspending] = useState(null);

  const flags = useMemo(() => (data?.flags ?? []).filter((f) => (level === "all" || f.severity === level) && (!type || f.type === type)), [data, level, type]);
  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const refresh = async () => setData(await getRiskFlags());
  const act = async (key, fn, message) => {
    setBusy(key);
    try {
      await fn();
      await refresh();
      infoToast(message);
      return true;
    } catch (err) {
      errorToast(getErrorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  };
  const byLevel = (l) => data.flags.filter((f) => f.severity === l).length;
  const score = Math.min(100, byLevel("high") * 8 + byLevel("medium") * 3 + byLevel("low"));

  return (
    <div className="space-y-6">
      <PageHeader actions={data.dismissedCount > 0 && <Button onClick={() => act("restore", () => restoreRiskFlags(actor), P.RESTORED)} size="sm" variant="outline"><RotateCcw className="size-4" />{P.RESTORE(data.dismissedCount)}</Button>} subtitle={P.SUBTITLE} title={P.TITLE} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-card">
          <p className="text-xs text-muted">{P.SCORE}</p>
          <p className={cn("mt-0.5 text-2xl font-bold tabular", score >= 50 ? "text-red-600" : score >= 20 ? "text-amber-700" : "text-emerald-700")}>{score}<span className="text-sm font-normal text-muted"> / 100</span></p>
          <p className="text-xs text-muted">{score >= 50 ? P.SCORE_HIGH : score >= 20 ? P.SCORE_MED : P.SCORE_LOW}</p>
        </div>
        {LEVELS.map((l) => (
          <button className={cn("rounded-xl bg-white p-4 text-left shadow-card transition hover:shadow-raised", level === l && "ring-2 ring-brand-500")} key={l} onClick={() => setLevel(level === l ? "all" : l)} type="button">
            <SeverityChip level={l} />
            <p className="mt-2 text-2xl font-bold tabular">{byLevel(l)}</p>
            <p className="text-xs text-muted">{P.OPEN_FLAGS}</p>
          </button>
        ))}
      </div>

      <Panel>
        <Tabs onChange={setType} tabs={[{ count: data.flags.length, label: P.ALL_TYPES, value: "" }, ...TYPES.map((t) => ({ count: data.flags.filter((f) => f.type === t).length, label: P.TYPE[t], value: t }))]} value={type} />
        <p className="mt-3 text-xs text-muted">{P.CHECKED(formatDateTime(data.checkedAt))}{level !== "all" && <> · <button className="font-semibold text-brand-700 hover:underline" onClick={() => setLevel("all")} type="button">{P.SHOW_ALL_LEVELS}</button></>}</p>
        <div className="mt-4">
          {flags.length === 0 ? <EmptyState body={P.EMPTY_BODY} icon={ShieldCheck} title={P.EMPTY} /> : (
            <ul className="divide-y divide-line">
              {flags.map((f) => (
                <li className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center" key={f.key}>
                  <div className="flex min-w-0 flex-1 gap-3">
                    <SeverityChip level={f.severity} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{P.TYPE[f.type]} · <Link className="text-brand-700 hover:underline" to={LINK[f.entity.kind]}>{f.entity.name}</Link>{f.entity.email && f.entity.kind !== "buyer" ? <span className="font-normal text-muted"> · {f.entity.email}</span> : null}</p>
                      <p className="mt-0.5 text-sm text-muted">{reasonText(f)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {f.isBuyer && (f.codBlocked
                      ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCheck aria-hidden className="size-4" />{P.COD_ALREADY}</span>
                      : <Button loading={busy === `cod-${f.key}`} onClick={() => act(`cod-${f.key}`, () => updateBuyer(f.entity.email, { codBlocked: true }, actor), P.COD_BLOCKED_TOAST)} size="sm" variant="outline"><Ban className="size-4" />{P.BLOCK_COD}</Button>)}
                    {f.entity.kind === "store" && f.entity.status === "approved" && <Button onClick={() => setSuspending(f)} size="sm" variant="outline"><ShieldAlert className="size-4" />{P.SUSPEND}</Button>}
                    <Button loading={busy === `d-${f.key}`} onClick={() => act(`d-${f.key}`, () => dismissRiskFlag(f.key, actor), P.DISMISSED)} size="sm" variant="ghost"><EyeOff className="size-4" />{P.DISMISS}</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      {suspending && (
        <PromptDialog
          body={P.SUSPEND_BODY(suspending.entity.name)}
          confirmLabel={P.SUSPEND}
          danger
          key={suspending.key}
          label={P.REASON}
          loading={busy === "suspend"}
          onCancel={() => setSuspending(null)}
          onConfirm={async (reason) => { if (await act("suspend", () => setStoreStatus(suspending.entity.slug, "suspended", reason, actor), P.SUSPENDED(suspending.entity.name))) setSuspending(null); }}
          open
          title={P.SUSPEND}
        />
      )}
    </div>
  );
}
