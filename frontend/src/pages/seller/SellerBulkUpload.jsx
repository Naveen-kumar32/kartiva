import { CheckCircle2, Download, FileSpreadsheet, History, PackagePlus, RefreshCw, TriangleAlert, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import { applyBulkPriceStock, bulkCreateProducts, getBulkUploadData } from "@/api";
import { Badge, Button, DataTable, ErrorState, PageHeader, PageLoader, Panel, Tabs } from "@/components";
import { CATEGORIES, PLATFORM } from "@/data";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { cn, errorToast, formatCurrency, formatDateTime, getErrorMessage, successToast } from "@/utils";

const U = EN.SELLER_PRO.BULK;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const NEW_COLUMNS = ["name", "category_slug", "brand", "description", "price", "mrp", "stock", "hsn", "gst_rate", "image_url"];

// Small RFC-4180 CSV parser: quoted fields, escaped quotes (""), commas/newlines inside quotes, CRLF, BOM.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const clean = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!clean.length) return [];
  const header = clean[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  // Undo the spreadsheet formula guard added on export ('=…)
  const val = (c) => c.trim().replace(/^'(?=[=+\-@])/, "");
  return clean.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, val(r[i] ?? "")])));
}
const num = (v) => (v === "" || v == null ? NaN : Number(String(v).replace(/[₹,\s]/g, "")));

function FilePicker({ label, onFile }) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-slate-50/60 px-6 py-8 text-center hover:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/30">
      <Upload aria-hidden className="size-7 text-brand-600" />
      <span className="font-semibold">{label}</span>
      <span className="text-xs text-muted">{U.FILE_HINT}</span>
      <input accept=".csv,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} type="file" />
    </label>
  );
}

const readFile = (file) => new Promise((resolve, reject) => {
  if (!/\.csv$/i.test(file.name)) { reject(new Error(U.NOT_CSV)); return; }
  if (file.size > MAX_FILE_BYTES) { reject(new Error(U.TOO_BIG)); return; }
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error(U.READ_FAILED));
  reader.readAsText(file);
});

function UpdateMode({ onApplied, storeSlug, variants }) {
  const [file, setFile] = useState(null); // { name, rows }
  const [busy, setBusy] = useState(false);
  const bySku = useMemo(() => new Map(variants.map((v) => [v.sku.toUpperCase(), v])), [variants]);

  const preview = useMemo(() => (file?.rows ?? []).map((r, i) => {
    const current = bySku.get(String(r.sku ?? "").trim().toUpperCase());
    const next = { mrp: num(r.mrp), price: num(r.price), stock: num(r.stock) };
    const errors = [];
    if (!current) errors.push(U.ERR_UNKNOWN_SKU);
    if (!(next.price > 0) || !(next.mrp > 0)) errors.push(U.ERR_PRICE);
    else if (next.price > next.mrp) errors.push(U.ERR_PRICE_MRP);
    if (!Number.isInteger(next.stock) || next.stock < 0) errors.push(U.ERR_STOCK);
    const changed = current && ["price", "mrp", "stock"].filter((k) => next[k] !== current[k]);
    return { changed: changed || [], current, errors, line: i + 2, next, sku: r.sku };
  }), [file, bySku]);
  const toApply = preview.filter((p) => !p.errors.length && p.changed.length);
  const invalid = preview.filter((p) => p.errors.length);

  // CSV only: this file is edited and uploaded back, and the upload reads plain CSV.
  const download = async () => {
    const { downloadCsv } = await import("@/utils/documents");
    downloadCsv(`kartiva-price-stock-${storeSlug}.csv`, [
      { header: "sku", key: "sku" }, { header: "product", key: "product" }, { header: "variant", key: "variant" }, { header: "price", key: "price" }, { header: "mrp", key: "mrp" }, { header: "stock", key: "stock" },
    ], variants, { title: U.MODE.update });
  };
  const onFile = async (f) => {
    try {
      const rows = parseCsv(await readFile(f));
      if (!rows.length || !("sku" in rows[0])) throw new Error(U.MISSING_COLUMNS("sku, price, mrp, stock"));
      setFile({ name: f.name, rows });
    } catch (err) {
      errorToast(err.message);
    }
  };
  const apply = async () => {
    setBusy(true);
    try {
      const res = await applyBulkPriceStock(storeSlug, toApply.map((p) => ({ mrp: p.next.mrp, price: p.next.price, sku: p.sku, stock: p.next.stock })), file.name);
      successToast(U.APPLIED(res.applied));
      setFile(null);
      onApplied();
    } catch (err) {
      errorToast(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const cell = (p, key, money) => {
    const v = p.next[key];
    const show = Number.isNaN(v) ? "—" : money ? formatCurrency(v) : v;
    if (!p.current || !p.changed.includes(key)) return show;
    return <span><span className="text-xs text-muted line-through">{money ? formatCurrency(p.current[key]) : p.current[key]}</span> <b className="text-brand-700">{show}</b></span>;
  };

  return (
    <div className="space-y-6">
      <Panel>
        <ol className="grid gap-4 md:grid-cols-3">
          <li className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold text-brand-700">{U.STEP(1)}</p><p className="mt-1 text-sm">{U.UPDATE_STEP_1}</p><div className="mt-3"><Button disabled={!variants.length} onClick={download} size="sm" variant="outline"><Download className="size-4" />{U.DOWNLOAD_CURRENT(variants.length)}</Button></div></li>
          <li className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold text-brand-700">{U.STEP(2)}</p><p className="mt-1 text-sm">{U.UPDATE_STEP_2}</p></li>
          <li className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold text-brand-700">{U.STEP(3)}</p><p className="mt-1 text-sm">{U.UPDATE_STEP_3}</p></li>
        </ol>
        <div className="mt-5"><FilePicker label={U.UPLOAD_EDITED} onFile={onFile} /></div>
      </Panel>
      {file && (
        <Panel
          action={<span className="flex gap-2"><Button onClick={() => setFile(null)} size="sm" variant="ghost">{EN.COMMON.CANCEL}</Button><Button disabled={!toApply.length} loading={busy} onClick={apply} size="sm"><CheckCircle2 className="size-4" />{U.APPLY(toApply.length)}</Button></span>}
          title={U.PREVIEW(file.name)}
        >
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            <Badge tone="brand">{U.ROWS(preview.length)}</Badge><Badge tone="success">{U.CHANGES(toApply.length)}</Badge>{invalid.length > 0 && <Badge tone="danger">{U.ERRORS(invalid.length)}</Badge>}
          </div>
          <DataTable
            columns={[
              { header: U.LINE, key: "line" },
              { header: "SKU", key: "sku", render: (p) => <span className="font-mono text-xs">{p.sku || "—"}</span> },
              { header: EN.SELLER.PRODUCT, key: "product", render: (p) => <span className="line-clamp-1 max-w-56">{p.current ? `${p.current.product} · ${p.current.variant}` : "—"}</span> },
              { align: "right", header: EN.TABLE.PRICE, key: "price", render: (p) => cell(p, "price", true) },
              { align: "right", header: EN.PRODUCT.MRP, key: "mrp", render: (p) => cell(p, "mrp", true) },
              { align: "right", header: EN.SELLER.STOCK, key: "stock", render: (p) => cell(p, "stock") },
              { header: EN.TABLE.STATUS, key: "status", render: (p) => (p.errors.length ? <span className="text-xs font-medium text-red-700">{p.errors.join(" · ")}</span> : p.changed.length ? <Badge tone="success">{U.CHANGED}</Badge> : <span className="text-xs text-muted">{U.UNCHANGED}</span>) },
            ]}
            rowKey="line"
            rows={[...preview].sort((a, b) => (b.errors.length ? 2 : b.changed.length ? 1 : 0) - (a.errors.length ? 2 : a.changed.length ? 1 : 0))}
          />
        </Panel>
      )}
    </div>
  );
}

function CreateMode({ onApplied, storeSlug }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const leafSlugs = useMemo(() => new Set(CATEGORIES.filter((c) => c.parentId && c.isActive !== false).map((c) => c.slug)), []);
  const preview = useMemo(() => (file?.rows ?? []).map((r, i) => {
    const row = { brand: r.brand, categorySlug: r.category_slug, description: r.description, gstRate: num(r.gst_rate), hsn: r.hsn, imageUrl: r.image_url, mrp: num(r.mrp), name: r.name, price: num(r.price), stock: num(r.stock) };
    const errors = [];
    if (!row.name || row.name.length < 3) errors.push(U.ERR_NAME);
    if (!leafSlugs.has(row.categorySlug)) errors.push(U.ERR_CATEGORY);
    if (!(row.price > 0) || !(row.mrp > 0)) errors.push(U.ERR_PRICE);
    else if (row.price > row.mrp) errors.push(U.ERR_PRICE_MRP);
    if (!Number.isInteger(row.stock) || row.stock < 0) errors.push(U.ERR_STOCK);
    if (!/^\d{4,8}$/.test(row.hsn ?? "")) errors.push(U.ERR_HSN);
    if (!PLATFORM.gstRateChoices.includes(row.gstRate)) errors.push(U.ERR_GST(PLATFORM.gstRateChoices.join("/")));
    if (row.imageUrl && !/^https:\/\/\S+$/.test(row.imageUrl)) errors.push(U.ERR_IMAGE);
    return { errors, line: i + 2, row };
  }), [file, leafSlugs]);
  const valid = preview.filter((p) => !p.errors.length);

  const template = async () => {
    const { downloadCsv } = await import("@/utils/documents");
    const sample = { brand: "Annapoorna", category_slug: "fresh-pantry", description: "Premium aged basmati rice, 25 kg HDPE bag. FSSAI licensed.", gst_rate: 5, hsn: "1006", image_url: "", mrp: 2600, name: "1121 Sella Basmati Rice 25 kg", price: 2350, stock: 40 };
    downloadCsv("kartiva-new-products-template.csv", NEW_COLUMNS.map((c) => ({ header: c, key: c })), [sample]);
  };
  const onFile = async (f) => {
    try {
      const rows = parseCsv(await readFile(f));
      const missing = NEW_COLUMNS.filter((c) => c !== "image_url" && rows.length && !(c in rows[0]));
      if (!rows.length || missing.length) throw new Error(U.MISSING_COLUMNS(missing.join(", ") || NEW_COLUMNS.join(", ")));
      setFile({ name: f.name, rows });
    } catch (err) {
      errorToast(err.message);
    }
  };
  const create = async () => {
    setBusy(true);
    try {
      const res = await bulkCreateProducts(storeSlug, valid.map((p) => p.row), file.name);
      successToast(res.moderation ? U.CREATED_REVIEW(res.created.length) : U.CREATED(res.created.length));
      setFile(null);
      onApplied();
    } catch (err) {
      errorToast(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl text-sm">
            <p className="font-semibold">{U.CREATE_TITLE}</p>
            <p className="mt-1 text-muted">{U.CREATE_BODY(PLATFORM.gstRateChoices.join(", "))}</p>
            <p className="mt-2 font-mono text-xs text-muted">{NEW_COLUMNS.join(", ")}</p>
          </div>
          <span className="flex flex-wrap gap-2">
            <Button onClick={template} size="sm" variant="outline"><Download className="size-4" />{U.TEMPLATE}</Button>
            <Button size="sm" to={ROUTES.SELLER.PRODUCT_NEW} variant="ghost">{U.SINGLE_PRODUCT}</Button>
          </span>
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-brand-700">{U.CATEGORY_SLUGS}</summary>
          <p className="mt-2 flex flex-wrap gap-1.5">{[...leafSlugs].map((s) => <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs" key={s}>{s}</code>)}</p>
        </details>
        <div className="mt-5"><FilePicker label={U.UPLOAD_NEW} onFile={onFile} /></div>
      </Panel>
      {file && (
        <Panel
          action={<span className="flex gap-2"><Button onClick={() => setFile(null)} size="sm" variant="ghost">{EN.COMMON.CANCEL}</Button><Button disabled={!valid.length} loading={busy} onClick={create} size="sm"><PackagePlus className="size-4" />{U.CREATE(valid.length)}</Button></span>}
          title={U.PREVIEW(file.name)}
        >
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            <Badge tone="success">{U.VALID(valid.length)}</Badge>{preview.length - valid.length > 0 && <Badge tone="danger">{U.ERRORS(preview.length - valid.length)}</Badge>}
          </div>
          <DataTable
            columns={[
              { header: U.LINE, key: "line" },
              { header: EN.SELLER.PRODUCT, key: "name", render: (p) => <span className="line-clamp-1 max-w-64 font-medium">{p.row.name || "—"}</span> },
              { header: U.CATEGORY, key: "cat", render: (p) => <span className="font-mono text-xs">{p.row.categorySlug || "—"}</span> },
              { align: "right", header: EN.TABLE.PRICE, key: "price", render: (p) => (Number.isNaN(p.row.price) ? "—" : formatCurrency(p.row.price)) },
              { align: "right", header: EN.SELLER.STOCK, key: "stock", render: (p) => (Number.isNaN(p.row.stock) ? "—" : p.row.stock) },
              { header: EN.TABLE.STATUS, key: "status", render: (p) => (p.errors.length ? <span className="text-xs font-medium text-red-700">{p.errors.join(" · ")}</span> : <Badge tone="success">{U.READY}</Badge>) },
            ]}
            rowKey="line"
            rows={preview}
          />
        </Panel>
      )}
    </div>
  );
}

export function SellerBulkUpload() {
  useDocumentTitle(EN.SELLER.NAV_BULK);
  const { user } = useAuth();
  const storeSlug = user.storeSlug;
  const { data, error, loading, reload, setData } = useAsync(() => getBulkUploadData(storeSlug), [storeSlug]);
  const [mode, setMode] = useState("update");
  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const refresh = async () => setData(await getBulkUploadData(storeSlug));

  return (
    <div className="space-y-6">
      <PageHeader subtitle={U.SUBTITLE} title={EN.SELLER.NAV_BULK} />
      <Tabs onChange={setMode} tabs={[{ label: U.MODE_UPDATE, value: "update" }, { label: U.MODE_CREATE, value: "create" }]} value={mode} />
      {mode === "update" ? <UpdateMode onApplied={refresh} storeSlug={storeSlug} variants={data.variants} /> : <CreateMode onApplied={refresh} storeSlug={storeSlug} />}
      <Panel title={<span className="flex items-center gap-2"><History aria-hidden className="size-4 text-muted" />{U.HISTORY}</span>}>
        {data.uploads.length === 0 ? <p className="text-sm text-muted">{U.NO_HISTORY}</p> : (
          <ul className="divide-y divide-line">
            {data.uploads.map((u) => (
              <li className="flex flex-wrap items-center gap-3 py-3 text-sm" key={u.id}>
                <span className={cn("grid size-9 place-items-center rounded-lg", u.mode === "create" ? "bg-violet-50 text-violet-700" : "bg-brand-50 text-brand-700")}>{u.mode === "create" ? <PackagePlus aria-hidden className="size-4" /> : <RefreshCw aria-hidden className="size-4" />}</span>
                <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 font-medium"><FileSpreadsheet aria-hidden className="size-4 text-muted" /><span className="truncate">{u.fileName}</span></span><span className="text-xs text-muted">{U.MODE[u.mode]} · {formatDateTime(u.at)}</span></span>
                <Badge tone="success">{U.OK(u.ok)}</Badge>
                {u.failed > 0 && <Badge tone="danger"><TriangleAlert aria-hidden className="size-3" />{U.FAILED(u.failed)}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
