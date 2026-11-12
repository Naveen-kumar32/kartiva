import { Check, Eye, Star, X } from "lucide-react";
import { useMemo, useState } from "react";

import { getAdminProducts, moderateProduct } from "@/api";
import {
  Badge, Button, DataTable, Drawer, EmptyState, ErrorState, ExportMenu, KeyValue, PageHeader, PageLoader, Panel, PromptDialog, SearchInput, SmartImage, StatusBadge, Tabs,
} from "@/components";
import { CATEGORIES, STORES } from "@/data";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { cn, errorToast, formatCurrency, getErrorMessage, successToast } from "@/utils";
import { downloadTable } from "@/utils/documents";

import { FilterSelect, SrHeader } from "./opsShared";

const O = EN.ADMIN_OPS;
const TABS = [
  ["review", O.TAB_IN_REVIEW, (p) => p.status === "pending_review"],
  ["live", O.TAB_LIVE, (p) => p.status === "active"],
  ["rejected", O.TAB_REJECTED, (p) => p.status === "rejected"],
  ["inactive", O.TAB_INACTIVE, (p) => p.status === "inactive" || p.status === "draft"],
  ["featured", O.TAB_FEATURED, (p) => p.isFeatured],
];
const storeName = (slug) => STORES.find((s) => s.slug === slug)?.name ?? slug;
const categoryName = (slug) => CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;
const priceRange = (p) => {
  const prices = p.variants.map((v) => v.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatCurrency(min) : `${formatCurrency(min)} – ${formatCurrency(max)}`;
};

export function AdminProducts() {
  useDocumentTitle(O.PRODUCTS_TITLE);
  const { data, error, loading, reload, setData } = useAsync(getAdminProducts, []);
  const [tab, setTab] = useState("review");
  const [q, setQ] = useState("");
  const [store, setStore] = useState("");
  const [category, setCategory] = useState("");
  const [viewId, setViewId] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const rows = useMemo(() => {
    if (!data) return [];
    const test = TABS.find(([key]) => key === tab)[2];
    const term = q.trim().toLowerCase();
    return data.filter((p) => test(p)
      && (!store || p.storeSlug === store)
      && (!category || p.categorySlug === category)
      && (!term || p.name.toLowerCase().includes(term) || p.brand.toLowerCase().includes(term) || p.variants.some((v) => v.sku.toLowerCase().includes(term))));
  }, [data, tab, q, store, category]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const act = async (product, action, reason) => {
    setBusyId(product.id);
    try {
      const updated = await moderateProduct(product.id, action, reason);
      setData(data.map((p) => (p.id === product.id ? { ...p, ...updated } : p)));
      successToast(O.PRODUCT_ACTION_TOAST[action](product.name));
    } catch (err) {
      errorToast(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const exportList = (format) => downloadTable(format, `kartiva-products-${tab}.csv`, [
    { header: "ID", key: "id" }, { header: O.COL_PRODUCT, key: "name" }, { header: O.COL_BRAND, key: "brand" },
    { header: O.COL_STORE, value: (p) => storeName(p.storeSlug) }, { header: O.COL_CATEGORY, value: (p) => categoryName(p.categorySlug) },
    { header: "HSN", key: "hsnCode" }, { header: "GST %", key: "gstRate" }, { header: O.COL_MIN_PRICE, value: (p) => Math.min(...p.variants.map((v) => v.price)) },
    { header: O.COL_STOCK, value: (p) => p.variants.reduce((t, v) => t + v.stock, 0) }, { header: O.COL_STATUS, key: "status" }, { header: O.COL_FEATURED, value: (p) => (p.isFeatured ? "Yes" : "No") },
  ], rows, { title: O.PRODUCTS_TITLE });

  const viewed = data.find((p) => p.id === viewId);
  const leafCategories = CATEGORIES.filter((c) => c.parentId);

  const actionsFor = (p) => (
    <span className="flex justify-end gap-1">
      {(p.status === "pending_review" || p.status === "rejected") && (
        <Button aria-label={`${O.APPROVE} ${p.name}`} loading={busyId === p.id} onClick={() => act(p, "approve")} size="sm"><Check className="size-4" /><span className="hidden xl:inline">{O.APPROVE}</span></Button>
      )}
      {p.status === "pending_review" && (
        <Button aria-label={`${O.REJECT} ${p.name}`} onClick={() => setRejecting(p)} size="sm" variant="outline"><X className="size-4" /><span className="hidden xl:inline">{O.REJECT}</span></Button>
      )}
      {p.status === "active" && <Button onClick={() => act(p, "deactivate")} size="sm" variant="ghost">{O.DEACTIVATE}</Button>}
      {p.status === "inactive" && <Button onClick={() => act(p, "activate")} size="sm" variant="ghost">{O.ACTIVATE}</Button>}
      <Button aria-label={O.VIEW_ITEM(p.name)} onClick={() => setViewId(p.id)} size="sm" variant="ghost"><Eye className="size-4" /></Button>
    </span>
  );

  return (
    <div className="space-y-6">
      <PageHeader actions={<ExportMenu onExport={exportList} size="md" />} subtitle={O.PRODUCTS_SUBTITLE} title={O.PRODUCTS_TITLE} />
      <Panel>
        <Tabs onChange={setTab} tabs={TABS.map(([value, label, test]) => ({ count: data.filter(test).length, label, value }))} value={tab} />
        <div className="my-4 grid gap-3 sm:grid-cols-[1fr_200px_200px]">
          <SearchInput onChange={setQ} placeholder={O.SEARCH_PRODUCTS} value={q} />
          <FilterSelect label={O.ALL_STORES} onChange={setStore} options={STORES.map((s) => [s.slug, s.name])} value={store} />
          <FilterSelect label={O.ALL_CATEGORIES} onChange={setCategory} options={leafCategories.map((c) => [c.slug, c.name])} value={category} />
        </div>
        {rows.length === 0 ? <EmptyState body={tab === "review" ? O.REVIEW_EMPTY_BODY : undefined} title={tab === "review" ? O.REVIEW_EMPTY : O.NO_RESULTS} /> : (
          <DataTable
            columns={[
              { header: O.COL_PRODUCT, key: "name", render: (p) => (
                <button className="flex items-center gap-3 text-left" onClick={() => setViewId(p.id)} type="button">
                  <SmartImage alt="" className="size-11 shrink-0 rounded-md bg-slate-50 object-contain" src={p.thumbnail} />
                  <span className="min-w-0"><span className="line-clamp-1 font-medium hover:text-brand-700">{p.name}</span><span className="text-xs text-muted">{p.brand} · {O.VARIANT_COUNT(p.variants.length)}</span></span>
                </button>
              ) },
              { header: O.COL_STORE, key: "storeSlug", render: (p) => storeName(p.storeSlug) },
              { header: O.COL_CATEGORY, key: "categorySlug", render: (p) => categoryName(p.categorySlug) },
              { align: "right", header: O.COL_PRICE, key: "price", render: priceRange },
              { align: "right", header: O.COL_STOCK, key: "stock", render: (p) => { const s = p.variants.reduce((t, v) => t + v.stock, 0); return <span className={s === 0 ? "font-semibold text-red-600" : ""}>{s}</span>; } },
              { header: O.COL_STATUS, key: "status", render: (p) => <StatusBadge status={p.status} /> },
              { header: <SrHeader>{O.COL_FEATURED}</SrHeader>, key: "featured", render: (p) => (
                <button aria-label={p.isFeatured ? O.UNFEATURE(p.name) : O.FEATURE(p.name)} aria-pressed={p.isFeatured} className="rounded-md p-1 hover:bg-amber-50" onClick={() => act(p, "feature")} title={p.isFeatured ? O.UNFEATURE(p.name) : O.FEATURE(p.name)} type="button">
                  <Star className={cn("size-5", p.isFeatured ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
                </button>
              ) },
              { header: <SrHeader>{O.COL_ACTIONS}</SrHeader>, key: "actions", render: actionsFor },
            ]}
            rows={rows}
          />
        )}
      </Panel>

      <Drawer onClose={() => setViewId(null)} open={Boolean(viewed)} side="right" size="lg" title={viewed?.name ?? ""}>
        {viewed && (
          <div className="space-y-5 p-4">
            <div className="scrollbar-none flex gap-2 overflow-x-auto">
              {viewed.images.map((src) => <SmartImage alt="" className="size-24 shrink-0 rounded-lg border border-line bg-white object-contain p-1" key={src} src={src} />)}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={viewed.status} />
              {viewed.isFeatured && <Badge tone="accent">{O.TAB_FEATURED}</Badge>}
            </div>
            {viewed.rejectionReason && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{O.REJECTION_REASON}: {viewed.rejectionReason}</p>}
            <KeyValue items={[
              [O.COL_STORE, storeName(viewed.storeSlug)], [O.COL_CATEGORY, categoryName(viewed.categorySlug)], [O.COL_BRAND, viewed.brand],
              ["HSN", viewed.hsnCode], ["GST", `${viewed.gstRate}%`], [O.RETURNABLE, viewed.isReturnable ? O.RETURNABLE_DAYS(viewed.returnWindowDays) : O.NO],
              [O.RATING, `${viewed.rating} (${viewed.reviewCount})`],
            ]} />
            <section>
              <h3 className="mb-2 text-sm font-semibold">{O.VARIANTS}</h3>
              <table className="w-full text-xs">
                <thead><tr className="border-b border-line text-left text-muted"><th className="py-1.5">{O.COL_VARIANT}</th><th>SKU</th><th className="text-right">{O.COL_PRICE}</th><th className="text-right">{O.COL_STOCK}</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {viewed.variants.map((v) => (
                    <tr key={v.id}>
                      <td className="py-1.5">{Object.values(v.attributes).join(" / ") || O.DEFAULT_VARIANT}</td>
                      <td className="font-mono">{v.sku}</td>
                      <td className="text-right tabular">{formatCurrency(v.price)}<span className="block text-muted line-through">{formatCurrency(v.mrp)}</span></td>
                      <td className={cn("text-right tabular", v.stock === 0 && "font-semibold text-red-600")}>{v.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            {viewed.specifications?.length > 0 && (
              <section>
                <h3 className="mb-1 text-sm font-semibold">{O.SPECIFICATIONS}</h3>
                <KeyValue items={viewed.specifications.map((s) => [s.name, s.value])} />
              </section>
            )}
            <section>
              <h3 className="mb-1 text-sm font-semibold">{O.DESCRIPTION}</h3>
              <p className="text-sm text-ink/80">{viewed.description}</p>
            </section>
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {actionsFor(viewed)}
              {viewed.status === "active" && <Button size="sm" to={ROUTES.PRODUCT(viewed.slug)} variant="outline">{O.VIEW_ON_STORE}</Button>}
            </div>
          </div>
        )}
      </Drawer>

      {rejecting && (
        <PromptDialog
          body={O.REJECT_PRODUCT_BODY(rejecting.name)}
          confirmLabel={O.REJECT}
          danger
          key={rejecting.id}
          label={O.REASON_FOR_SELLER}
          onCancel={() => setRejecting(null)}
          onConfirm={async (reason) => { const p = rejecting; setRejecting(null); await act(p, "reject", reason); }}
          open
          placeholder={O.REJECT_PLACEHOLDER}
          title={O.REJECT_PRODUCT}
        />
      )}
    </div>
  );
}
