import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { adjustStock, getSellerProducts, getStockMovements } from "@/api";
import {
  Badge, Button, DataTable, ErrorState, ExportMenu, MiniStat, PageHeader, PageLoader, Panel, SearchInput, SmartImage, Tabs,
} from "@/components";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { errorToast, formatDateTime, formatNumber, getErrorMessage, successToast } from "@/utils";
import { downloadTable } from "@/utils/documents";

const H = EN.SELLER_HUB;
const label = (v) => Object.values(v.attributes).join(" / ") || EN.SELLER.DEFAULT_VARIANT;
const isLow = (v) => v.stock > 0 && v.stock <= (v.lowStockThreshold ?? 3);

function StockCell({ onSave, row }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (change) => {
    setBusy(true);
    await onSave(row, change);
    setBusy(false);
    setValue("");
  };
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="inline-flex h-9 items-center rounded-lg border border-line bg-white">
        <button aria-label={H.DECREASE_STOCK(row.sku)} className="grid size-9 place-items-center text-muted hover:text-ink disabled:opacity-40" disabled={busy || row.stock === 0} onClick={() => save({ delta: -1 })} type="button"><Minus className="size-4" /></button>
        <span className="w-10 text-center font-semibold tabular">{row.stock}</span>
        <button aria-label={H.INCREASE_STOCK(row.sku)} className="grid size-9 place-items-center text-muted hover:text-ink disabled:opacity-40" disabled={busy} onClick={() => save({ delta: 1 })} type="button"><Plus className="size-4" /></button>
      </div>
      <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); if (value !== "") save({ note: H.SET_STOCK_NOTE, setTo: Number(value) }); }}>
        <input aria-label={H.SET_TO_FOR(row.sku)} className="h-9 w-16 rounded-lg border border-line px-2 text-sm tabular" inputMode="numeric" onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} placeholder={H.SET_TO} value={value} />
        <Button disabled={value === "" || busy} size="sm" type="submit" variant="outline">{EN.COMMON.SAVE}</Button>
      </form>
    </div>
  );
}

export function SellerInventory() {
  useDocumentTitle(EN.SELLER.NAV_INVENTORY);
  const { user } = useAuth();
  const storeSlug = user.storeSlug;
  const { data, error, loading, reload, setData } = useAsync(() => getSellerProducts(storeSlug), [storeSlug]);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const history = useAsync(() => (tab === "history" ? getStockMovements(storeSlug) : Promise.resolve([])), [tab, storeSlug]);

  const rows = useMemo(() => (data ?? []).flatMap((p) => p.variants.map((v) => ({ ...v, label: label(v), product: p }))), [data]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (tab === "all" || (tab === "low" && isLow(r)) || (tab === "out" && r.stock === 0))
      && (!q || r.product.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)));
  }, [rows, tab, query]);

  const onSave = async (row, change) => {
    try {
      const updated = await adjustStock(storeSlug, row.id, change);
      setData(data.map((p) => (p.id === row.product.id ? { ...p, variants: p.variants.map((v) => (v.id === row.id ? { ...v, stock: updated.stock } : v)) } : p)));
      if (change.setTo != null) successToast(H.STOCK_UPDATED(row.sku, updated.stock));
    } catch (err) {
      errorToast(getErrorMessage(err));
    }
  };

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const units = rows.reduce((s, r) => s + r.stock, 0);
  const tabs = [
    { count: rows.length, label: EN.COMMON.ALL, value: "all" },
    { count: rows.filter(isLow).length, label: EN.SELLER.LOW_STOCK, value: "low" },
    { count: rows.filter((r) => r.stock === 0).length, label: EN.PRODUCT.OUT_OF_STOCK, value: "out" },
    { label: H.MOVEMENT_HISTORY, value: "history" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        actions={<ExportMenu onExport={(format) => downloadTable(format, `kartiva-inventory-${storeSlug}.csv`, [
          { header: "Product", value: (r) => r.product.name }, { header: "Variant", key: "label" }, { header: "SKU", key: "sku" },
          { header: "Price", key: "price" }, { header: "Stock", key: "stock" },
        ], filtered, { title: EN.SELLER.NAV_INVENTORY })} />}
        subtitle={H.INVENTORY_SUBTITLE}
        title={EN.SELLER.NAV_INVENTORY}
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <MiniStat label={H.SKUS} value={formatNumber(rows.length)} />
        <MiniStat label={H.UNITS_IN_STOCK} value={formatNumber(units)} />
        <MiniStat label={EN.SELLER.LOW_STOCK} tone="warning" value={rows.filter(isLow).length} />
        <MiniStat label={EN.PRODUCT.OUT_OF_STOCK} tone="danger" value={rows.filter((r) => r.stock === 0).length} />
      </div>
      <Panel>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <Tabs onChange={setTab} tabs={tabs} value={tab} />
          {tab !== "history" && <SearchInput className="w-full sm:w-72" onChange={setQuery} placeholder={H.SEARCH_SKU} value={query} />}
        </div>
        {tab === "history" ? (
          history.loading ? <PageLoader /> : (
            <DataTable
              columns={[
                { header: EN.TABLE.DATE, key: "at", render: (m) => formatDateTime(m.at) },
                { header: EN.SELLER.PRODUCT, key: "productName", render: (m) => <>{m.productName}<span className="block font-mono text-xs text-muted">{m.sku}</span></> },
                { header: EN.TABLE.TYPE, key: "reason", render: (m) => <Badge tone={m.delta > 0 ? "success" : "neutral"}>{H.MOVEMENT[m.reason] ?? m.reason}</Badge> },
                { header: EN.TABLE.DESCRIPTION, key: "note", render: (m) => <span className="text-muted">{m.note}{m.subOrderNumber ? ` · ${m.subOrderNumber}` : ""}</span> },
                { align: "right", header: H.CHANGE, key: "delta", render: (m) => <span className={m.delta > 0 ? "text-emerald-700" : "text-red-600"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span> },
                { align: "right", header: H.STOCK_AFTER, key: "stockAfter" },
              ]}
              empty={H.NO_MOVEMENTS}
              rows={history.data ?? []}
            />
          )
        ) : (
          <DataTable
            columns={[
              { header: EN.SELLER.PRODUCT, key: "product", render: (r) => (
                <span className="flex items-center gap-3">
                  <SmartImage alt="" className="size-10 shrink-0 rounded-md bg-slate-50 object-contain" src={r.product.thumbnail} />
                  <span className="min-w-0"><span className="line-clamp-1 font-medium">{r.product.name}</span><span className="text-xs text-muted">{r.label}</span></span>
                </span>
              ) },
              { header: "SKU", key: "sku", render: (r) => <span className="font-mono text-xs">{r.sku}</span> },
              { header: EN.TABLE.STATUS, key: "state", render: (r) => (r.stock === 0 ? <Badge tone="danger">{EN.PRODUCT.OUT_OF_STOCK}</Badge> : isLow(r) ? <Badge tone="warning">{EN.SELLER.LOW_STOCK}</Badge> : <Badge tone="success">{EN.PRODUCT.IN_STOCK}</Badge>) },
              { align: "right", header: EN.SELLER.STOCK, key: "stock", render: (r) => <StockCell onSave={onSave} row={r} /> },
            ]}
            empty={H.NO_MATCHES}
            rows={filtered}
          />
        )}
      </Panel>
    </div>
  );
}
