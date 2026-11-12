import { Copy, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { deleteSellerProduct, duplicateSellerProduct, getSellerProducts, setSellerProductStatus } from "@/api";
import {
  Badge, Button, ConfirmDialog, DataTable, EmptyState, ErrorState, ExportMenu, PageHeader, PageLoader, Panel, SearchInput, SmartImage, StatusBadge, Tabs,
} from "@/components";
import { CATEGORIES } from "@/data";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { errorToast, formatCurrency, getErrorMessage, successToast } from "@/utils";
import { downloadTable } from "@/utils/documents";

const H = EN.SELLER_HUB;
const W = EN.SELLER_PRO.PRODUCT;
const STATUSES = ["all", "active", "pending_review", "draft", "rejected", "inactive"];
const categoryName = (slug) => CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;
const variantLabel = (v) => Object.values(v.attributes).join(" / ") || EN.SELLER.DEFAULT_VARIANT;

function IconAction({ icon: Icon, label, onClick, to }) {
  const cls = "grid size-8 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-ink";
  if (to) return <Link aria-label={label} className={cls} title={label} to={to}><Icon className="size-4" /></Link>;
  return <button aria-label={label} className={cls} onClick={onClick} title={label} type="button"><Icon className="size-4" /></button>;
}

export function SellerProducts() {
  useDocumentTitle(EN.SELLER.PRODUCTS_TITLE);
  const { user } = useAuth();
  const navigate = useNavigate();
  const storeSlug = user.storeSlug;
  const { data, error, loading, reload, setData } = useAsync(() => getSellerProducts(storeSlug), [storeSlug]);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => STATUSES.reduce((acc, s) => ({ ...acc, [s]: (data ?? []).filter((p) => s === "all" || p.status === s).length }), {}), [data]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((p) => (tab === "all" || p.status === tab) && (!q || p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.variants.some((v) => v.sku.toLowerCase().includes(q))));
  }, [data, tab, query]);

  const refresh = async () => setData(await getSellerProducts(storeSlug));
  const act = async (fn, message) => {
    try {
      await fn();
      await refresh();
      successToast(message);
    } catch (err) {
      errorToast(getErrorMessage(err));
    }
  };

  const exportList = (format) => downloadTable(format, `kartiva-products-${storeSlug}.csv`, [
    { header: "Product", key: "name" }, { header: "Brand", key: "brand" }, { header: "Category", value: (r) => categoryName(r.categorySlug) },
    { header: "Status", key: "status" }, { header: "HSN", key: "hsnCode" }, { header: "GST %", key: "gstRate" },
    { header: "Variants", value: (r) => r.variants.map((v) => `${v.sku} (${variantLabel(v)}) ₹${v.price} x${v.stock}`).join(" | ") },
    { header: "Total stock", value: (r) => r.summary.totalStock },
  ], rows, { title: EN.SELLER.PRODUCTS_TITLE });

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-6">
      <PageHeader
        actions={(
          <>
            <ExportMenu onExport={exportList} />
            <Button size="sm" to={ROUTES.SELLER.PRODUCT_NEW}><Plus className="size-4" />{H.ADD_PRODUCT}</Button>
          </>
        )}
        subtitle={H.PRODUCTS_SUBTITLE(data.length)}
        title={EN.SELLER.PRODUCTS_TITLE}
      />
      <Panel>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <Tabs onChange={setTab} tabs={STATUSES.map((s) => ({ count: counts[s], label: s === "all" ? EN.COMMON.ALL : EN.ORDER.STATUS[s], value: s }))} value={tab} />
          <SearchInput className="w-full sm:w-72" onChange={setQuery} placeholder={H.SEARCH_PRODUCTS} value={query} />
        </div>
        {rows.length === 0 ? (
          <EmptyState actionLabel={H.ADD_PRODUCT} actionTo={ROUTES.SELLER.PRODUCT_NEW} body={H.NO_PRODUCTS_BODY} title={H.NO_PRODUCTS} />
        ) : (
          <DataTable
            columns={[
              { header: EN.SELLER.PRODUCT, key: "name", render: (p) => (
                <span className="flex items-center gap-3">
                  <SmartImage alt="" className="size-11 shrink-0 rounded-md bg-slate-50 object-contain" src={p.thumbnail} />
                  <span className="min-w-0">
                    <button className="line-clamp-1 text-left font-medium hover:text-brand-700" onClick={() => navigate(ROUTES.SELLER.PRODUCT_EDIT(p.id))} type="button">{p.name}</button>
                    <span className="block text-xs text-muted">{p.brand} · {categoryName(p.categorySlug)}</span>
                    {(p.priceTiers?.length > 0 || p.moq > 1 || p.enquiryOnly) && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {p.priceTiers?.length > 0 && <Badge tone="brand">{W.CHIP_BULK}</Badge>}
                        {p.moq > 1 && <Badge tone="info">{W.CHIP_MOQ(p.moq)}</Badge>}
                        {p.enquiryOnly && <Badge tone="accent">{W.CHIP_ENQUIRY}</Badge>}
                      </span>
                    )}
                  </span>
                </span>
              ) },
              { header: EN.SELLER.VARIANTS, key: "variants", render: (p) => <span className="text-sm">{p.variants.length}<span className="block max-w-48 truncate text-xs text-muted">{p.variants.map(variantLabel).join(", ")}</span></span> },
              { align: "right", header: EN.TABLE.PRICE, key: "price", render: (p) => {
                const prices = p.variants.map((v) => v.price);
                const [min, max] = [Math.min(...prices), Math.max(...prices)];
                return min === max ? formatCurrency(min) : `${formatCurrency(min)} – ${formatCurrency(max)}`;
              } },
              { align: "right", header: EN.SELLER.STOCK, key: "stock", render: (p) => <span className={p.summary.totalStock === 0 ? "font-semibold text-red-600" : ""}>{p.summary.totalStock}</span> },
              { header: EN.TABLE.STATUS, key: "status", render: (p) => (
                <span>
                  <StatusBadge status={p.status} />
                  {p.status === "rejected" && p.rejectionReason && <span className="mt-1 block max-w-52 text-xs text-red-700">{p.rejectionReason}</span>}
                </span>
              ) },
              { header: "", key: "actions", render: (p) => (
                <span className="flex items-center justify-end gap-0.5">
                  <IconAction icon={Pencil} label={H.EDIT} to={ROUTES.SELLER.PRODUCT_EDIT(p.id)} />
                  <IconAction icon={Copy} label={H.DUPLICATE} onClick={() => act(() => duplicateSellerProduct(storeSlug, p.id), H.DUPLICATED)} />
                  {p.status === "active" && <IconAction icon={Eye} label={H.VIEW_ON_STORE} to={ROUTES.PRODUCT(p.slug)} />}
                  {p.status === "active" && <IconAction icon={EyeOff} label={H.DEACTIVATE} onClick={() => act(() => setSellerProductStatus(storeSlug, p.id, "inactive"), H.DEACTIVATED)} />}
                  {p.status === "inactive" && <IconAction icon={Eye} label={H.ACTIVATE} onClick={() => act(() => setSellerProductStatus(storeSlug, p.id, "active"), H.ACTIVATED)} />}
                  <IconAction icon={Trash2} label={H.DELETE} onClick={() => setToDelete(p)} />
                </span>
              ) },
            ]}
            rows={rows}
          />
        )}
      </Panel>
      <ConfirmDialog
        body={H.DELETE_BODY}
        confirmLabel={H.DELETE}
        danger
        loading={busy}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          setBusy(true);
          await act(() => deleteSellerProduct(storeSlug, toDelete.id), H.DELETED);
          setBusy(false);
          setToDelete(null);
        }}
        open={Boolean(toDelete)}
        title={H.DELETE_TITLE(toDelete?.name ?? "")}
      />
    </div>
  );
}
