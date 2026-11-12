import { Check, ExternalLink, FileText, Landmark, SearchCheck, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";

import { getKycQueue, reviewKycDocument, setTrustedBadge, verifyStoreGstin } from "@/api";
import { Button, EmptyState, ErrorState, PageHeader, PageLoader, Panel, PromptDialog, SearchInput, StoreAvatar, Tabs, Toggle, VerifiedBadges } from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { cn, errorToast, formatDate, formatDateTime, formatNumber, getErrorMessage, infoToast, successToast } from "@/utils";

import { KpiStrip, Pill } from "./opsShared";
import { timeAgo, useActor } from "./opsUtils";

const P = EN.ADMIN_PRO.VERIFICATION;
const KYC_TONE = { not_submitted: "neutral", pending: "warning", rejected: "danger", verified: "success" };
const DOC_TONE = { pending: "warning", rejected: "danger", verified: "success" };
const ORDER = { not_submitted: 3, pending: 0, rejected: 1, verified: 2 };
const TABS = [
  ["all", () => true],
  ["review", (r) => r.pendingDocs > 0],
  ["verified", (r) => r.store.kycStatus === "verified"],
  ["rejected", (r) => r.store.kycStatus === "rejected"],
  ["not_submitted", (r) => r.store.kycStatus === "not_submitted"],
];

export function AdminVerification() {
  useDocumentTitle(P.TITLE);
  const actor = useActor();
  const { data, error, loading, reload, setData } = useAsync(getKycQueue, []);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [rejecting, setRejecting] = useState(null);
  const [busy, setBusy] = useState(null);
  const [checks, setChecks] = useState({});
  const [expanded, setExpanded] = useState({});

  const rows = useMemo(() => {
    if (!data) return [];
    const test = TABS.find(([k]) => k === tab)[1];
    const term = q.trim().toLowerCase();
    return data.filter((r) => test(r) && (!term || r.store.name.toLowerCase().includes(term) || r.store.gstin?.toLowerCase().includes(term)))
      .sort((a, b) => (b.pendingDocs > 0) - (a.pendingDocs > 0) || ORDER[a.store.kycStatus] - ORDER[b.store.kycStatus] || (b.lastUpload ?? "").localeCompare(a.lastUpload ?? ""));
  }, [data, tab, q]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const refresh = async () => setData(await getKycQueue());
  const act = async (key, fn, message, toast = successToast) => {
    setBusy(key);
    try {
      const result = await fn();
      await refresh();
      if (message) toast(typeof message === "function" ? message(result) : message);
      return result;
    } catch (err) {
      errorToast(getErrorMessage(err));
      return null;
    } finally {
      setBusy(null);
    }
  };
  const count = (k) => data.filter(TABS.find(([x]) => x === k)[1]).length;

  return (
    <div className="space-y-6">
      <PageHeader subtitle={P.SUBTITLE} title={P.TITLE} />
      <KpiStrip items={[
        [P.KPI_STORES_REVIEW, formatNumber(count("review")), count("review") ? "warning" : undefined],
        [P.KPI_DOCS_PENDING, formatNumber(data.reduce((t, r) => t + r.pendingDocs, 0))],
        [P.KPI_VERIFIED, formatNumber(count("verified")), "success"],
        [P.KPI_REJECTED, formatNumber(count("rejected")), count("rejected") ? "danger" : undefined],
        [P.KPI_NOT_SUBMITTED, formatNumber(count("not_submitted"))],
        [P.KPI_GST, formatNumber(data.filter((r) => r.store.gstVerified).length)],
      ]} />
      <Panel>
        <Tabs onChange={setTab} tabs={TABS.map(([value]) => ({ count: count(value), label: P.TAB[value], value }))} value={tab} />
        <SearchInput className="mt-4 max-w-sm" onChange={setQ} placeholder={P.SEARCH} value={q} />
      </Panel>

      {rows.length === 0 ? <EmptyState body={P.EMPTY_BODY} icon={ShieldCheck} title={P.EMPTY} /> : rows.map(({ docs, store }) => (
        <Panel key={store.slug}>
          <div className="flex flex-wrap items-start gap-3">
            <StoreAvatar size="size-11 text-sm" store={store} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{store.name}</h2>
                <Pill tone={KYC_TONE[store.kycStatus]}>{P.KYC[store.kycStatus] ?? store.kycStatus}</Pill>
                {store.status !== "approved" && <Pill tone="warning">{P.STORE_STATUS[store.status] ?? store.status}</Pill>}
              </div>
              <p className="mt-0.5 text-xs text-muted"><span className="font-mono">{store.gstin}</span> · {store.city}, {store.state} · {store.businessType ?? "—"}</p>
              <VerifiedBadges className="mt-2" store={store} />
            </div>
            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
              <span className="flex items-center gap-2 text-sm"><Toggle checked={Boolean(store.badges?.includes("trusted"))} disabled={busy === `t-${store.slug}`} label={P.TRUSTED} onChange={(on) => act(`t-${store.slug}`, () => setTrustedBadge(store.slug, on, actor), on ? P.TRUSTED_ON(store.name) : P.TRUSTED_OFF(store.name), infoToast)} />{P.TRUSTED}</span>
              <Button loading={busy === `g-${store.slug}`} onClick={async () => { const res = await act(`g-${store.slug}`, () => verifyStoreGstin(store.slug, actor), (r) => (r.valid ? P.GST_OK : P.GST_FAIL), (m) => (m === P.GST_OK ? successToast(m) : errorToast(m))); if (res) setChecks((c) => ({ ...c, [store.slug]: res })); }} size="sm" variant="outline"><SearchCheck className="size-4" />{P.CHECK_GST}</Button>
              {store.status === "approved" && <Button aria-label={P.VIEW_STORE(store.name)} size="sm" title={P.VIEW_STORE(store.name)} to={ROUTES.STORE(store.slug)} variant="ghost"><ExternalLink className="size-4" /></Button>}
            </div>
          </div>

          {(checks[store.slug] ?? store.gstCheck) && <GstPortalCard result={checks[store.slug] ?? store.gstCheck} />}

          {docs.length > 0 && store.kycStatus === "verified" && !docs.some((d) => d.status === "pending") && !expanded[store.slug] ? (
            <button className="mt-3 text-sm font-semibold text-brand-700 hover:underline" onClick={() => setExpanded((e) => ({ ...e, [store.slug]: true }))} type="button">{P.SHOW_DOCS(docs.length)}</button>
          ) : docs.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-muted">{P.NO_DOCS}</p> : (
            <div className="relative -mx-5 mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead><tr className="border-y border-line bg-slate-50 text-xs uppercase tracking-wide text-muted">
                  {[P.COL_DOC, P.COL_FILE, P.COL_UPLOADED, P.COL_STATUS, P.COL_REVIEW].map((h) => <th className="px-5 py-2 font-semibold" key={h} scope="col">{h}</th>)}
                  <th className="px-5 py-2" scope="col"><span className="sr-only">{EN.ADMIN_PRO.COMMON.ACTIONS}</span></th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {docs.map((d) => (
                    <tr className={cn(d.status === "pending" && "bg-amber-50/40")} key={d.id}>
                      <td className="px-5 py-2.5 font-medium">{P.DOC_TYPE[d.type] ?? d.type}</td>
                      <td className="px-5 py-2.5"><span className="flex items-center gap-1.5"><FileText aria-hidden className="size-4 text-muted" /><span className="max-w-52 truncate font-mono text-xs">{d.fileName}</span></span><span className="text-xs text-muted">{P.SIZE_KB(formatNumber(d.sizeKb))}</span></td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-xs" title={formatDateTime(d.uploadedAt)}>{formatDate(d.uploadedAt)}<span className="block text-muted">{timeAgo(d.uploadedAt)}</span></td>
                      <td className="px-5 py-2.5"><Pill tone={DOC_TONE[d.status]}>{P.DOC_STATUS[d.status] ?? d.status}</Pill></td>
                      <td className="max-w-60 px-5 py-2.5 text-xs text-muted">{d.reviewedBy ? `${d.reviewedBy} · ${formatDate(d.reviewedAt)}` : "—"}{d.note && <span className="block text-red-700">{d.note}</span>}</td>
                      <td className="px-5 py-2.5">
                        <span className="flex justify-end gap-1">
                          {d.status !== "verified" && <Button loading={busy === `v-${d.id}`} onClick={() => act(`v-${d.id}`, () => reviewKycDocument(d.id, "verified", "", actor), (s) => P.DOC_VERIFIED(P.DOC_TYPE[d.type] ?? d.type, P.KYC[s.kycStatus] ?? s.kycStatus))} size="sm"><Check className="size-4" />{P.VERIFY}</Button>}
                          {d.status !== "rejected" && <Button onClick={() => setRejecting({ doc: d, store })} size="sm" variant="outline"><X className="size-4" />{P.REJECT}</Button>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ))}

      {rejecting && (
        <PromptDialog
          body={P.REJECT_BODY(P.DOC_TYPE[rejecting.doc.type] ?? rejecting.doc.type, rejecting.store.name)}
          confirmLabel={P.REJECT}
          danger
          key={rejecting.doc.id}
          label={P.REASON}
          loading={busy === "reject"}
          onCancel={() => setRejecting(null)}
          onConfirm={async (reason) => {
            const ok = await act("reject", () => reviewKycDocument(rejecting.doc.id, "rejected", reason, actor), P.DOC_REJECTED, infoToast);
            if (ok) setRejecting(null);
          }}
          open
          placeholder={P.REASON_PLACEHOLDER}
          title={P.REJECT_TITLE}
        />
      )}
    </div>
  );
}

function GstPortalCard({ result }) {
  return (
    <section aria-label={P.PORTAL_TITLE} className={cn("mt-4 rounded-xl border p-4 text-sm", result.valid ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/50")}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold"><Landmark aria-hidden className="size-4" />{P.PORTAL_TITLE}<span className="rounded bg-white px-1.5 text-[11px] font-medium text-muted ring-1 ring-line">{P.SIMULATED}</span></p>
        <span className="text-xs text-muted">{P.CHECKED_AT(formatDateTime(result.checkedAt))}</span>
      </div>
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["GSTIN", <span className="font-mono" key="g">{result.gstin}</span>],
          [P.PORTAL_STATUS, <Pill key="s" tone={result.valid ? "success" : "danger"}>{result.valid ? P.ACTIVE : P.NOT_FOUND}</Pill>],
          [P.LEGAL_NAME, result.legalName ?? "—"],
          [P.REGISTERED_ON, result.registeredOn ? formatDate(result.registeredOn) : "—"],
          [P.STATE_CHECK, result.stateOk ? P.STATE_MATCH(result.stateCode, result.stateName) : P.STATE_MISMATCH(result.stateCode, result.storeState)],
          [P.FORMAT_CHECK, result.formatOk ? P.FORMAT_OK : P.FORMAT_BAD],
          ["PAN", <span className="font-mono" key="p">{result.pan}</span>],
          [P.TAXPAYER_TYPE, result.taxpayerType],
        ].map(([k, v]) => <div className="flex justify-between gap-3 border-b border-line/60 py-1" key={k}><dt className="text-muted">{k}</dt><dd className="text-right">{v}</dd></div>)}
      </dl>
    </section>
  );
}
