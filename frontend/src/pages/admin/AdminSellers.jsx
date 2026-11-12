import { Check, ExternalLink, Eye, Store as StoreIcon, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { decideSellerApplication, getAdminStores, getSellerApplications, getStoreLedger, setStoreStatus, toggleStoreFeatured } from "@/api";
import {
  Badge, Button, DataTable, Drawer, EmptyState, ErrorState, KeyValue, MiniStat, PageHeader, PageLoader, Panel, PromptDialog, SearchInput, StatusBadge, StoreAvatar, Tabs, Toggle, VerifiedBadges,
} from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { errorToast, formatCurrency, formatDate, formatDateTime, getErrorMessage, infoToast, successToast } from "@/utils";

import { DrawerSection, Money, Pill, SrHeader } from "./opsShared";
import { useActor } from "./opsUtils";

const O = EN.ADMIN_OPS;
const SX = EN.ADMIN_PRO.SELLERS;
const KYC_TONE = { not_submitted: "neutral", pending: "warning", rejected: "danger", verified: "success" };
const PLAN_TONE = { free: "neutral", gold: "accent", platinum: "info" };
const load = async () => {
  const [applications, stores] = await Promise.all([getSellerApplications(), getAdminStores()]);
  return { applications, stores };
};

export function AdminSellers() {
  useDocumentTitle(O.SELLERS_TITLE);
  const { data, error, loading, reload, setData } = useAsync(load, []);
  const [tab, setTab] = useState("applications");
  const [q, setQ] = useState("");
  const [prompt, setPrompt] = useState(null); // { kind: "reject" | "suspend", target }
  const [busy, setBusy] = useState(null);
  const [viewSlug, setViewSlug] = useState(null);
  const actor = useActor();

  const term = q.trim().toLowerCase();
  const stores = useMemo(() => (data?.stores ?? []).filter((s) => (tab === "suspended" ? s.status === "suspended" : s.status === "approved")
    && (!term || s.name.toLowerCase().includes(term) || s.city?.toLowerCase().includes(term) || s.gstin.toLowerCase().includes(term))), [data, tab, term]);
  const applications = useMemo(() => (data?.applications ?? []).filter((a) => !term || [a.business, a.owner, a.email, a.gstin].some((x) => x?.toLowerCase().includes(term)))
    .sort((a, b) => (a.status === "pending") === (b.status === "pending") ? b.submittedAt.localeCompare(a.submittedAt) : a.status === "pending" ? -1 : 1), [data, term]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const refresh = async () => setData(await load());
  const run = async (key, fn, message, toast = successToast) => {
    setBusy(key);
    try {
      await fn();
      await refresh();
      toast(message);
    } catch (err) {
      errorToast(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const pendingCount = data.applications.filter((a) => a.status === "pending").length;
  const viewed = data.stores.find((s) => s.slug === viewSlug);

  return (
    <div className="space-y-6">
      <PageHeader subtitle={O.SELLERS_SUBTITLE} title={O.SELLERS_TITLE} />
      <Panel>
        <Tabs
          onChange={setTab}
          tabs={[
            { count: pendingCount, label: O.TAB_APPLICATIONS, value: "applications" },
            { count: data.stores.filter((s) => s.status === "approved").length, label: O.TAB_ACTIVE_STORES, value: "active" },
            { count: data.stores.filter((s) => s.status === "suspended").length, label: O.TAB_SUSPENDED, value: "suspended" },
          ]}
          value={tab}
        />
        <SearchInput className="my-4 max-w-sm" onChange={setQ} placeholder={O.SEARCH_SELLERS} value={q} />

        {tab === "applications" && (applications.length === 0 ? <EmptyState icon={StoreIcon} title={O.NO_RESULTS} /> : (
          <DataTable
            columns={[
              { header: O.COL_BUSINESS, key: "business", render: (r) => (
                <span className="block min-w-48">
                  <span className="flex flex-wrap items-center gap-1.5"><b>{r.business}</b>{r.selfRegistered && <Badge tone="brand">{SX.SELF_REGISTERED}</Badge>}</span>
                  <span className="block text-xs text-muted">{r.owner} · {r.city}</span>
                  {(r.email || r.phone) && <span className="block text-xs text-muted">{[r.email, r.phone].filter(Boolean).join(" · ")}</span>}
                </span>
              ) },
              { header: "GSTIN", key: "gstin", render: (r) => <span className="font-mono text-xs">{r.gstin}</span> },
              { header: O.COL_CATEGORY, key: "category", render: (r) => <>{r.category}{r.businessType && <span className="block text-xs text-muted">{r.businessType}</span>}</> },
              { header: SX.COL_KYC, key: "kyc", render: (r) => {
                const store = r.storeSlug && data.stores.find((x) => x.slug === r.storeSlug);
                if (!store) return <span className="text-xs text-muted">—</span>;
                return <span className="flex flex-col items-start gap-1"><Pill tone={KYC_TONE[store.kycStatus]}>{SX.KYC[store.kycStatus] ?? store.kycStatus}</Pill><Link className="text-xs font-semibold text-brand-700 hover:underline" to={ROUTES.ADMIN.VERIFICATION}>{SX.REVIEW_KYC}</Link>{store.status !== "pending" && <Link className="text-xs text-brand-700 hover:underline" to={ROUTES.STORE(store.slug)}>{SX.STORE_LINK}</Link>}</span>;
              } },
              { header: O.COL_SUBMITTED, key: "submittedAt", render: (r) => formatDateTime(r.submittedAt) },
              { header: O.COL_STATUS, key: "status", render: (r) => <><StatusBadge status={r.status} />{r.decisionReason && <span className="mt-1 block max-w-48 text-xs text-muted">{r.decisionReason}</span>}</> },
              { header: <SrHeader>{O.COL_ACTIONS}</SrHeader>, key: "actions", render: (r) => r.status === "pending" && (
                <span className="flex justify-end gap-2">
                  <Button loading={busy === `app-${r.id}`} onClick={() => run(`app-${r.id}`, () => decideSellerApplication(r.id, "approve", undefined, actor), O.APPLICATION_APPROVED(r.business))} size="sm"><Check className="size-4" />{O.APPROVE}</Button>
                  <Button onClick={() => setPrompt({ kind: "reject", target: r })} size="sm" variant="outline"><X className="size-4" />{O.REJECT}</Button>
                </span>
              ) },
            ]}
            rows={applications}
          />
        ))}

        {tab !== "applications" && (stores.length === 0 ? <EmptyState icon={StoreIcon} title={O.NO_RESULTS} /> : (
          <DataTable
            columns={[
              { header: O.COL_STORE, key: "name", render: (s) => (
                <button className="flex items-center gap-3 text-left" onClick={() => setViewSlug(s.slug)} type="button">
                  <StoreAvatar size="size-9 text-xs" store={s} />
                  <span><span className="font-medium hover:text-brand-700">{s.name}</span><span className="block text-xs text-muted">{s.city}, {s.state}</span></span>
                </button>
              ) },
              { header: SX.COL_TRUST, key: "trust", render: (s) => (
                <span className="flex min-w-40 flex-col items-start gap-1">
                  {((s.plan ?? "free") === "free" || s.kycStatus !== "verified") && <span className="flex flex-wrap gap-1">{(s.plan ?? "free") === "free" && <Pill tone={PLAN_TONE.free}>{SX.PLAN.free}</Pill>}{s.kycStatus !== "verified" && <Pill tone={KYC_TONE[s.kycStatus]}>{SX.KYC[s.kycStatus] ?? s.kycStatus}</Pill>}</span>}
                  <VerifiedBadges compact store={s} />
                </span>
              ) },
              { align: "right", header: SX.COL_RESPONSE, key: "responseRate", render: (s) => (s.responseRate != null ? <span className="whitespace-nowrap">{s.responseRate}%<span className="block text-xs text-muted">{SX.WITHIN(s.responseHours)}</span></span> : "—") },
              { align: "right", header: O.COL_PRODUCTS, key: "products" },
              { align: "right", header: O.COL_ORDERS, key: "orders" },
              { align: "right", header: O.COL_GMV, key: "gmv", render: (s) => formatCurrency(s.gmv) },
              { header: O.COL_COMMISSION, key: "commissionOverride", render: (s) => <Link className="text-brand-700 hover:underline" to={ROUTES.ADMIN.COMMISSIONS}>{s.commissionOverride != null ? `${s.commissionOverride}%` : O.DEFAULT_RULE}</Link> },
              { align: "right", header: O.COL_BALANCE, key: "balance", render: (s) => <Money value={s.balance} /> },
              { header: O.COL_FEATURED, key: "isFeatured", render: (s) => <Toggle checked={Boolean(s.isFeatured)} label={O.FEATURE(s.name)} onChange={() => run(`f-${s.slug}`, () => toggleStoreFeatured(s.slug), s.isFeatured ? O.STORE_UNFEATURED(s.name) : O.STORE_FEATURED(s.name), infoToast)} /> },
              { header: <SrHeader>{O.COL_ACTIONS}</SrHeader>, key: "actions", render: (s) => (
                <span className="flex justify-end gap-1">
                  {s.status === "approved"
                    ? <Button onClick={() => setPrompt({ kind: "suspend", target: s })} size="sm" variant="outline">{O.SUSPEND}</Button>
                    : <Button loading={busy === `r-${s.slug}`} onClick={() => run(`r-${s.slug}`, () => setStoreStatus(s.slug, "approved", undefined, actor), O.STORE_REACTIVATED(s.name))} size="sm">{O.REACTIVATE}</Button>}
                  <Button aria-label={O.VIEW_ITEM(s.name)} onClick={() => setViewSlug(s.slug)} size="sm" variant="ghost"><Eye className="size-4" /></Button>
                </span>
              ) },
            ]}
            rowKey="slug"
            rows={stores}
          />
        ))}
      </Panel>

      <Drawer onClose={() => setViewSlug(null)} open={Boolean(viewed)} side="right" size="lg" title={viewed?.name ?? ""}>
        {viewed && <StoreDetail store={viewed} />}
      </Drawer>

      {prompt && (
        <PromptDialog
          body={prompt.kind === "reject" ? O.REJECT_APPLICATION_BODY(prompt.target.business) : O.SUSPEND_BODY(prompt.target.name)}
          confirmLabel={prompt.kind === "reject" ? O.REJECT : O.SUSPEND}
          danger
          key={`${prompt.kind}-${prompt.target.id ?? prompt.target.slug}`}
          label={O.REASON}
          loading={Boolean(busy)}
          onCancel={() => setPrompt(null)}
          onConfirm={async (reason) => {
            const { kind, target } = prompt;
            await (kind === "reject"
              ? run("prompt", () => decideSellerApplication(target.id, "reject", reason, actor), O.APPLICATION_REJECTED(target.business), infoToast)
              : run("prompt", () => setStoreStatus(target.slug, "suspended", reason, actor), O.STORE_SUSPENDED(target.name), infoToast));
            setPrompt(null);
          }}
          open
          title={prompt.kind === "reject" ? O.REJECT_APPLICATION : O.SUSPEND_STORE}
        />
      )}
    </div>
  );
}

function StoreDetail({ store }) {
  const { data: ledger, loading } = useAsync(() => getStoreLedger(store.slug), [store.slug]);
  const [tab, setTab] = useState("overview");
  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center gap-3">
        <StoreAvatar size="size-14 text-lg" store={store} />
        <div>
          <p className="font-semibold">{store.name}</p>
          <StatusBadge status={store.status === "approved" ? "active" : "suspended"} />
          <VerifiedBadges className="mt-1.5" store={store} />
        </div>
      </div>
      <Tabs onChange={setTab} tabs={[{ label: SX.TAB_OVERVIEW, value: "overview" }, { label: SX.TAB_PROFILE, value: "profile" }]} value={tab} />
      {tab === "profile" ? <BusinessProfile store={store} /> : (<>
      {store.suspensionReason && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{O.SUSPENDED_BECAUSE(store.suspensionReason)}</p>}
      <KeyValue items={[
        ["GSTIN", <span className="font-mono text-xs" key="g">{store.gstin}</span>], [O.GST_STATE_CODE, store.gstStateCode], [O.LOCATION, `${store.city}, ${store.state}`],
        [O.RATING, `${store.rating} (${store.ratingCount})`], [O.SELLING_SINCE, store.since], [O.COL_PRODUCTS, store.products], [O.COL_GMV, formatCurrency(store.gmv)],
        [O.COL_COMMISSION, store.commissionOverride != null ? `${store.commissionOverride}% ${O.STORE_OVERRIDE}` : O.DEFAULT_RULE],
      ]} />
      <DrawerSection title={O.DELIVERY_METHODS}>
        <ul className="space-y-1.5 text-sm">
          {store.shippingMethods.map((m) => (
            <li className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2" key={m.id}>
              <span>{m.name}<span className="block text-xs text-muted">{EN.COMMON.DAYS(m.minDays, m.maxDays)}{m.codAllowed ? " · COD" : ""}</span></span>
              <span className="tabular">{m.fee ? formatCurrency(m.fee) : EN.CART.FREE}</span>
            </li>
          ))}
        </ul>
      </DrawerSection>
      <DrawerSection title={O.LEDGER_SUMMARY}>
        {loading || !ledger ? <p className="text-sm text-muted">{EN.COMMON.LOADING}</p> : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label={O.COL_BALANCE} tone={ledger.balance < 0 ? "danger" : "success"} value={<Money value={ledger.balance} />} />
              <MiniStat label={O.IN_RETURN_WINDOW} value={formatCurrency(ledger.pending)} />
            </div>
            <ul className="mt-3 divide-y divide-line text-xs">
              {ledger.entries.slice(0, 6).map((e, i) => (
                <li className="flex justify-between gap-3 py-1.5" key={`${e.description}-${i}`}>
                  <span className="min-w-0"><span className="line-clamp-1">{e.description}</span><span className="text-muted">{formatDate(e.date)}</span></span>
                  <Money value={e.amount} />
                </li>
              ))}
            </ul>
          </>
        )}
      </DrawerSection>
      </>)}
      {store.status === "approved" && (
        <Button fullWidth to={ROUTES.STORE(store.slug)} variant="outline"><ExternalLink className="size-4" />{O.VIEW_STOREFRONT}</Button>
      )}
    </div>
  );
}

function BusinessProfile({ store }) {
  const list = (items) => (items?.length ? <span className="flex flex-wrap gap-1">{items.map((x) => <Badge key={x}>{x}</Badge>)}</span> : "—");
  return (
    <div className="space-y-5">
      <KeyValue items={[
        [SX.BUSINESS_TYPE, store.businessType], [SX.YEAR, store.yearEstablished], [SX.EMPLOYEES, store.employees], [SX.TURNOVER, store.annualTurnover],
        [SX.PLAN_LABEL, SX.PLAN[store.plan ?? "free"]], [SX.COL_KYC, SX.KYC[store.kycStatus] ?? store.kycStatus], [SX.GST_VERIFIED, store.gstVerified ? SX.YES : SX.NO],
        [SX.COL_RESPONSE, store.responseRate != null ? `${store.responseRate}% · ${SX.WITHIN(store.responseHours)}` : "—"],
        [SX.CERTIFICATIONS, list(store.certifications)], [SX.MARKETS, list(store.mainMarkets)],
      ]} />
      <DrawerSection title={SX.CONTACT}>
        <KeyValue items={[[SX.CONTACT_PERSON, store.contactPerson], [SX.PHONE, store.phone], [SX.EMAIL, store.ownerEmail], [O.LOCATION, store.address ?? `${store.city}, ${store.state}`], ["GSTIN", <span className="font-mono text-xs" key="g">{store.gstin}</span>]]} />
      </DrawerSection>
    </div>
  );
}
