import { Mail, MapPin, MessagesSquare, Phone, Plus, Tag, UsersRound, X } from "lucide-react";
import { useMemo, useState } from "react";

import { getSellerCustomers, saveCustomerNotes } from "@/api";
import {
  Badge, Button, DataTable, Drawer, EmptyState, ErrorState, ExportMenu, MiniStat, PageHeader, PageLoader, Panel, SearchInput, StatusBadge,
} from "@/components";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { cn, errorToast, formatCompactInr, formatCurrency, formatDate, formatNumber, getErrorMessage, successToast } from "@/utils";

const C = EN.SELLER_PRO.CUSTOMERS;
const SEGMENTS = ["all", "vip", "repeat", "new", "at_risk", "lead"];
const SEGMENT_TONE = { at_risk: "danger", lead: "neutral", new: "info", repeat: "brand", vip: "accent" };

function CustomerDrawer({ customer, onClose, onSaved, storeSlug }) {
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [tags, setTags] = useState(customer?.tags ?? []);
  const [tag, setTag] = useState("");
  const [saving, setSaving] = useState(false);
  const addTag = () => {
    const t = tag.trim();
    if (t && !tags.includes(t) && tags.length < 10) setTags([...tags, t]);
    setTag("");
  };
  const save = async () => {
    setSaving(true);
    try {
      await saveCustomerNotes(storeSlug, customer.email, { notes, tags });
      successToast(C.SAVED);
      onSaved();
    } catch (err) {
      errorToast(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer onClose={onClose} open={Boolean(customer)} side="right" size="md" title={customer?.name ?? ""}>
      {customer && (
        <div className="space-y-5 p-5">
          <header className="flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-50 text-lg font-bold text-brand-700">{customer.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2)}</span>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold">{customer.name}</p>
              {customer.businessName && <p className="text-sm">{customer.businessName}</p>}
              <p className="flex items-center gap-1 text-sm text-muted"><MapPin aria-hidden className="size-3.5" />{[customer.city, customer.state].filter(Boolean).join(", ") || "—"}</p>
            </div>
            <Badge tone={SEGMENT_TONE[customer.segment]}>{C.SEGMENT[customer.segment]}</Badge>
          </header>
          <div className="space-y-1 text-sm">
            <p className="flex items-center gap-2"><Mail aria-hidden className="size-4 text-muted" />{customer.email}</p>
            {customer.phone && <p className="flex items-center gap-2"><Phone aria-hidden className="size-4 text-muted" />{customer.phone}</p>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat className="bg-slate-50 shadow-none" label={C.ORDERS} value={formatNumber(customer.orders)} />
            <MiniStat className="bg-slate-50 shadow-none" label={C.LTV} value={formatCompactInr(customer.totalSpent)} />
            <MiniStat className="bg-slate-50 shadow-none" label={C.RETURNS} value={formatNumber(customer.returns)} />
          </div>
          {customer.threadId && <Button size="sm" to={`${ROUTES.SELLER.MESSAGES}?thread=${customer.threadId}`} variant="outline"><MessagesSquare className="size-4" />{C.MESSAGE}</Button>}

          <section>
            <h3 className="mb-2 text-sm font-semibold">{C.ORDER_HISTORY}</h3>
            {customer.history.length === 0 ? <p className="text-sm text-muted">{C.NO_ORDERS(customer.enquiries)}</p> : (
              <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
                {customer.history.map((h) => (
                  <li className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm" key={h.number}>
                    <span className="min-w-0">
                      <span className="block font-mono text-xs font-semibold">{h.number}</span>
                      <span className="text-xs text-muted">{formatDate(h.createdAt)} · {C.ITEMS(h.items)}</span>
                    </span>
                    <span className="flex items-center gap-2"><StatusBadge status={h.status} /><b className="tabular">{formatCurrency(h.total)}</b></span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">{C.NOTES_TAGS}</h3>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200" key={t}>
                  <Tag aria-hidden className="size-3" />{t}
                  <button aria-label={C.REMOVE_TAG(t)} className="rounded-full hover:bg-violet-100" onClick={() => setTags(tags.filter((x) => x !== t))} type="button"><X className="size-3" /></button>
                </span>
              ))}
              {tags.length === 0 && <span className="text-xs text-muted">{C.NO_TAGS}</span>}
            </div>
            <div className="flex gap-2">
              <input aria-label={C.ADD_TAG} className="h-9 flex-1 rounded-lg border border-line px-3 text-sm" maxLength={24} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} placeholder={C.TAG_PLACEHOLDER} value={tag} />
              <Button disabled={!tag.trim()} onClick={addTag} size="sm" variant="subtle"><Plus className="size-4" />{C.ADD_TAG}</Button>
            </div>
            <label className="block text-sm font-medium" htmlFor="crm-notes">{C.NOTES}</label>
            <textarea className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" id="crm-notes" maxLength={2000} onChange={(e) => setNotes(e.target.value)} placeholder={C.NOTES_PLACEHOLDER} rows={4} value={notes} />
            <Button loading={saving} onClick={save} size="sm">{EN.COMMON.SAVE}</Button>
          </section>
        </div>
      )}
    </Drawer>
  );
}

export function SellerCustomers() {
  useDocumentTitle(EN.SELLER.NAV_CUSTOMERS);
  const { user } = useAuth();
  const storeSlug = user.storeSlug;
  const { data, error, loading, reload, setData } = useAsync(() => getSellerCustomers(storeSlug), [storeSlug]);
  const [segment, setSegment] = useState("all");
  const [query, setQuery] = useState("");
  const [openEmail, setOpenEmail] = useState(null);

  const all = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => Object.fromEntries(SEGMENTS.map((s) => [s, all.filter((c) => s === "all" ? c.segment !== "lead" : c.segment === s).length])), [all]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((c) => (segment === "all" ? c.segment !== "lead" : c.segment === segment) && (!q || `${c.name} ${c.email} ${c.city} ${c.state} ${c.tags.join(" ")}`.toLowerCase().includes(q)));
  }, [all, segment, query]);
  const active = all.find((c) => c.email === openEmail) ?? null;

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const buyers = all.filter((c) => c.orders > 0);
  const revenue = buyers.reduce((t, c) => t + c.totalSpent, 0);
  const repeatRate = buyers.length ? (buyers.filter((c) => c.orders >= 2).length / buyers.length) * 100 : 0;
  const exportList = async (format) => {
    const { downloadTable } = await import("@/utils/documents");
    await downloadTable(format, `kartiva-customers-${storeSlug}.csv`, [
      { header: "Name", key: "name" }, { header: "Email", key: "email" }, { header: "Phone", key: "phone" }, { header: "City", key: "city" }, { header: "State", key: "state" },
      { header: "Orders", key: "orders" }, { header: "Total spent", key: "totalSpent" }, { header: "AOV", key: "aov" },
      { header: "First order", value: (c) => c.firstOrder?.slice(0, 10) ?? "" }, { header: "Last order", value: (c) => c.lastOrder?.slice(0, 10) ?? "" },
      { header: "Returns", key: "returns" }, { header: "Segment", value: (c) => C.SEGMENT[c.segment] }, { header: "Tags", value: (c) => c.tags.join("; ") },
    ], rows, { title: EN.SELLER.NAV_CUSTOMERS });
  };

  return (
    <div className="space-y-6">
      <PageHeader actions={<ExportMenu disabled={!rows.length} onExport={exportList} />} subtitle={C.SUBTITLE} title={EN.SELLER.NAV_CUSTOMERS} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label={C.KPI_CUSTOMERS} value={formatNumber(buyers.length)} />
        <MiniStat label={C.KPI_REPEAT} tone="success" value={`${Math.round(repeatRate)}%`} />
        <MiniStat label={C.KPI_LTV} value={formatCurrency(buyers.length ? revenue / buyers.length : 0)} />
        <MiniStat label={C.KPI_LEADS} value={formatNumber(counts.lead)} />
      </div>
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div aria-label={C.SEGMENTS} className="flex flex-wrap gap-1.5" role="group">
            {SEGMENTS.map((s) => (
              <button aria-pressed={segment === s} className={cn("rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset", segment === s ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-ink ring-line hover:ring-brand-400")} key={s} onClick={() => setSegment(s)} type="button">
                {s === "all" ? C.ALL_CUSTOMERS : C.SEGMENT[s]} <span className="tabular opacity-75">{counts[s]}</span>
              </button>
            ))}
          </div>
          <SearchInput className="w-full sm:w-72" onChange={setQuery} placeholder={C.SEARCH} value={query} />
        </div>
        {all.length === 0 ? <EmptyState body={C.EMPTY_BODY} icon={UsersRound} title={C.EMPTY} /> : (
          <DataTable
            columns={[
              { header: C.CUSTOMER, key: "name", render: (c) => (
                <span className="block min-w-0">
                  <span className="font-medium">{c.name}</span>
                  <span className="block text-xs text-muted">{[c.city, c.state].filter(Boolean).join(", ")}</span>
                  {c.tags.length > 0 && <span className="mt-1 flex flex-wrap gap-1">{c.tags.slice(0, 3).map((t) => <span className="rounded bg-violet-50 px-1.5 text-[11px] text-violet-700" key={t}>{t}</span>)}</span>}
                </span>
              ) },
              { header: C.SEGMENT_COL, key: "segment", render: (c) => <Badge tone={SEGMENT_TONE[c.segment]}>{C.SEGMENT[c.segment]}</Badge> },
              { align: "right", header: C.ORDERS, key: "orders" },
              { align: "right", header: C.LTV, key: "totalSpent", render: (c) => formatCurrency(c.totalSpent) },
              { align: "right", header: C.AOV, key: "aov", render: (c) => (c.orders ? formatCurrency(c.aov) : "—") },
              { header: C.LAST_ORDER, key: "lastOrder", render: (c) => (c.lastOrder ? formatDate(c.lastOrder) : "—") },
              { header: C.FIRST_ORDER, key: "firstOrder", render: (c) => (c.firstOrder ? formatDate(c.firstOrder) : "—") },
              { align: "right", header: C.RETURNS, key: "returns" },
            ]}
            empty={C.EMPTY_FILTER}
            onRowClick={(c) => setOpenEmail(c.email)}
            rowKey="email"
            rows={rows}
          />
        )}
      </Panel>
      <CustomerDrawer customer={active} key={openEmail ?? "none"} onClose={() => setOpenEmail(null)} onSaved={async () => setData(await getSellerCustomers(storeSlug))} storeSlug={storeSlug} />
    </div>
  );
}
