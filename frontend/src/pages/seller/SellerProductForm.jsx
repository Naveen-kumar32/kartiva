import { useFormik } from "formik";
import { ArrowLeft, ChevronDown, ChevronUp, ImagePlus, Info, Layers, Plus, Trash2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { getSellerProduct, saveSellerProduct } from "@/api";
import {
  Button, ErrorState, FormInput, FormTextarea, PageHeader, PageLoader, Panel, PriceTag, Rating, Select, SmartImage, Toggle,
} from "@/components";
import { CATEGORIES, PLATFORM } from "@/data";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { discountPercent, errorToast, formatCurrency, getErrorMessage, successToast, tierUnitPrice } from "@/utils";
import { createProductSchema } from "@/validators";

const H = EN.SELLER_HUB;
const W = EN.SELLER_PRO.PRODUCT;
const DEFAULT_TIERS = [{ discountPct: 5, minQty: 10 }];
const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_IMAGES = 8;
const parseValues = (text) => [...new Set(String(text).split(",").map((v) => v.trim()).filter(Boolean))];
const attrKey = (attrs) => JSON.stringify(Object.keys(attrs).sort().map((k) => [k, attrs[k]]));

function combos(options) {
  const usable = options.map((o) => ({ name: o.name.trim(), values: parseValues(o.values) })).filter((o) => o.name && o.values.length);
  return usable.reduce((acc, opt) => acc.flatMap((a) => opt.values.map((v) => ({ ...a, [opt.name]: v }))), [{}]);
}

// Regenerates the variant grid from the option builder, keeping ids / prices of rows that still exist.
function mergeVariants(options, current, skuBase) {
  const existing = new Map(current.map((row) => [attrKey(row.attributes), row]));
  const first = current[0] ?? { mrp: "", price: "", stock: 0 };
  return combos(options).map((attributes, i) => existing.get(attrKey(attributes)) ?? {
    attributes, mrp: first.mrp, price: first.price, stock: 0,
    sku: `${skuBase || "SKU"}-${Object.values(attributes).map((v) => v.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase()).join("-") || i + 1}`,
  });
}

const skuBaseOf = (name) => name.split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0]).join("").toUpperCase();

const emptyProduct = {
  brand: "", bulkPricing: false, categorySlug: "", description: "", enquiryOnly: false, gstRate: 18, hsnCode: "", images: [], isReturnable: true, moq: 1, name: "",
  options: [], priceTiers: DEFAULT_TIERS, specifications: [{ name: "", value: "" }], variants: [{ attributes: {}, mrp: "", price: "", sku: "", stock: 0 }],
};

const toFormValues = (p) => ({
  brand: p.brand, bulkPricing: Boolean(p.priceTiers?.length), categorySlug: p.categorySlug, enquiryOnly: Boolean(p.enquiryOnly), moq: p.moq ?? 1,
  priceTiers: p.priceTiers?.length ? p.priceTiers.map((t) => ({ ...t })) : DEFAULT_TIERS, description: p.description, gstRate: p.gstRate, hsnCode: p.hsnCode,
  images: p.images.filter((src) => src !== "/placeholder-product.svg"), isReturnable: p.isReturnable, name: p.name,
  options: p.variantOptions.map((o) => ({ name: o.name, values: o.values.join(", ") })),
  specifications: p.specifications.filter((s) => !["Brand", "Category", "HSN Code"].includes(s.name)).concat({ name: "", value: "" }),
  variants: p.variants.map((v) => ({ attributes: v.attributes, id: v.id, mrp: v.mrp, price: v.price, sku: v.sku, stock: v.stock })),
});

export function SellerProductForm() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => (id ? getSellerProduct(user.storeSlug, id) : Promise.resolve(null)), [id, user.storeSlug]);
  useDocumentTitle(id ? H.EDIT_PRODUCT : H.ADD_PRODUCT);
  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return <ProductEditor initial={data ? toFormValues(data) : emptyProduct} key={id ?? "new"} product={data} storeSlug={user.storeSlug} />;
}

function Section({ children, hint, title }) {
  return (
    <Panel title={title}>
      {hint && <p className="-mt-2 mb-4 text-sm text-muted">{hint}</p>}
      {children}
    </Panel>
  );
}

function ProductEditor({ initial, product, storeSlug }) {
  const navigate = useNavigate();
  const intent = useRef(false);
  const [imageUrl, setImageUrl] = useState("");
  const [pending, setPending] = useState(null); // which button started the submit (for its spinner)
  const moderation = PLATFORM.productModerationEnabled !== false;
  const roots = CATEGORIES.filter((c) => !c.parentId && c.isActive !== false);

  const formik = useFormik({
    initialValues: initial,
    onSubmit: async (values) => {
      try {
        const payload = {
          ...values,
          specifications: values.specifications.filter((s) => s.name.trim() && s.value.trim()),
          enquiryOnly: values.enquiryOnly,
          moq: Number(values.moq) || 1,
          priceTiers: values.bulkPricing ? values.priceTiers.map((t) => ({ discountPct: Number(t.discountPct), minQty: Number(t.minQty) })) : [],
          submit: intent.current,
          variantOptions: values.options.map((o) => ({ name: o.name.trim(), values: parseValues(o.values) })).filter((o) => o.name && o.values.length),
        };
        await saveSellerProduct(storeSlug, product?.id ?? null, payload);
        successToast(intent.current ? (moderation ? H.SUBMITTED_FOR_REVIEW : H.PUBLISHED) : H.DRAFT_SAVED);
        navigate(ROUTES.SELLER.PRODUCTS);
      } catch (err) {
        errorToast(getErrorMessage(err));
      }
    },
    validationSchema: createProductSchema({ ...EN.VALIDATION, ...H.VALIDATION, ...EN.SELLER_PRO.VALIDATION }),
  });
  const {
    errors, handleBlur, handleChange, isSubmitting, setFieldValue, submitCount, submitForm, touched, values,
  } = formik;
  const showAll = submitCount > 0;
  const err = (name) => (showAll || touched[name] ? errors[name] : undefined);

  const setOptions = (options) => {
    setFieldValue("options", options);
    setFieldValue("variants", options.length ? mergeVariants(options, values.variants, skuBaseOf(values.name)) : [values.variants[0] ? { ...values.variants[0], attributes: {} } : emptyProduct.variants[0]]);
  };
  const setVariant = (i, key, value) => setFieldValue(`variants.${i}.${key}`, value);

  const onCategory = (slug) => {
    setFieldValue("categorySlug", slug);
    const cat = CATEGORIES.find((c) => c.slug === slug);
    if (cat?.defaultHsn) setFieldValue("hsnCode", cat.defaultHsn);
    if (cat?.defaultGstRate != null) setFieldValue("gstRate", cat.defaultGstRate);
  };

  const addImage = (src) => {
    if (values.images.length >= MAX_IMAGES) return errorToast(H.IMAGES_MAX(MAX_IMAGES));
    setFieldValue("images", [...values.images, src]);
    return null;
  };
  const onFile = (e) => {
    [...e.target.files].forEach((file) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return errorToast(H.IMAGE_TYPE);
      if (file.size > MAX_IMAGE_BYTES) return errorToast(H.IMAGE_SIZE);
      const reader = new FileReader();
      // functional update so several files read in parallel don't overwrite each other
      reader.onload = () => formik.setValues((prev) => ({ ...prev, images: [...prev.images, reader.result].slice(0, MAX_IMAGES) }));
      reader.readAsDataURL(file);
      return null;
    });
    e.target.value = "";
  };
  const moveImage = (i, d) => {
    const next = [...values.images];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setFieldValue("images", next);
  };

  const prices = values.variants.map((v) => Number(v.price) || 0).filter(Boolean);
  const first = values.variants[0] ?? {};
  const totalStock = values.variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);
  const variantErrors = Array.isArray(errors.variants) ? errors.variants : [];
  const tierErrors = Array.isArray(errors.priceTiers) ? errors.priceTiers : [];
  const basePrice = Number(first.price) || 0;
  const setTier = (i, key, value) => setFieldValue(`priceTiers.${i}.${key}`, value.replace(/[^\d]/g, ""));

  return (
    <form className="space-y-6" noValidate onSubmit={(e) => { e.preventDefault(); }}>
      <PageHeader
        actions={<Button onClick={() => navigate(ROUTES.SELLER.PRODUCTS)} size="sm" variant="ghost"><ArrowLeft className="size-4" />{EN.CHECKOUT.BACK}</Button>}
        subtitle={product ? H.EDIT_SUBTITLE(product.status) : H.NEW_SUBTITLE}
        title={product ? H.EDIT_PRODUCT : H.ADD_PRODUCT}
      />
      {product?.status === "rejected" && product.rejectionReason && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{H.REJECTED_BECAUSE(product.rejectionReason)}</p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Section title={H.SECTION_BASICS}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormInput className="sm:col-span-2" error={err("name")} label={H.FIELD_NAME} name="name" onBlur={handleBlur} onChange={handleChange} touched={showAll || touched.name} value={values.name} />
              <FormInput error={err("brand")} label={EN.LISTING.BRAND} name="brand" onBlur={handleBlur} onChange={handleChange} touched={showAll || touched.brand} value={values.brand} />
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="categorySlug">{H.FIELD_CATEGORY}</label>
                <Select
                  id="categorySlug"
                  invalid={Boolean(err("categorySlug"))}
                  name="categorySlug"
                  onBlur={() => handleBlur({ target: { name: "categorySlug" } })}
                  onChange={onCategory}
                  options={roots.flatMap((root) => CATEGORIES.filter((c) => c.parentId === root.id && c.isActive !== false).map((c) => ({ group: root.name, label: c.name, value: c.slug })))}
                  placeholder={H.CHOOSE_CATEGORY}
                  value={values.categorySlug}
                />
                {err("categorySlug") && <p className="mt-1 text-xs text-red-600" role="alert">{err("categorySlug")}</p>}
              </div>
              <FormTextarea className="sm:col-span-2" error={err("description")} label={EN.PRODUCT.DESCRIPTION} name="description" onBlur={handleBlur} onChange={handleChange} rows={5} touched={showAll || touched.description} value={values.description} />
            </div>
          </Section>

          <Section hint={H.TAX_HINT} title={H.SECTION_TAX}>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormInput error={err("hsnCode")} inputMode="numeric" label={H.FIELD_HSN} name="hsnCode" onBlur={handleBlur} onChange={handleChange} touched={showAll || touched.hsnCode} value={values.hsnCode} />
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="gstRate">{H.FIELD_GST}</label>
                <Select id="gstRate" name="gstRate" onChange={(v) => setFieldValue("gstRate", Number(v))} options={PLATFORM.gstRateChoices.map((r) => ({ label: `${r}%`, value: r }))} value={values.gstRate} />
              </div>
              <div className="flex items-center gap-3 sm:pt-7">
                <Toggle checked={values.isReturnable} label={H.FIELD_RETURNABLE} onChange={(v) => setFieldValue("isReturnable", v)} />
                <span className="text-sm">{values.isReturnable ? EN.PRODUCT.RETURNS(PLATFORM.defaultReturnWindowDays) : EN.PRODUCT.NON_RETURNABLE}</span>
              </div>
            </div>
          </Section>

          <Section hint={H.IMAGES_HINT(MAX_IMAGES)} title={H.SECTION_IMAGES}>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {values.images.map((src, i) => (
                <figure className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-slate-50" key={`${i}-${src.slice(-24)}`}>
                  <SmartImage alt={H.IMAGE_N(i + 1)} className="size-full object-contain p-1" src={src} />
                  {i === 0 && <span className="absolute left-1 top-1 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{H.PRIMARY}</span>}
                  <span className="absolute inset-x-1 bottom-1 flex justify-between opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                    <span className="flex gap-0.5">
                      <button aria-label={H.MOVE_LEFT} className="grid size-6 place-items-center rounded bg-white/90 shadow disabled:opacity-40" disabled={i === 0} onClick={() => moveImage(i, -1)} type="button"><ChevronUp className="size-3.5 -rotate-90" /></button>
                      <button aria-label={H.MOVE_RIGHT} className="grid size-6 place-items-center rounded bg-white/90 shadow disabled:opacity-40" disabled={i === values.images.length - 1} onClick={() => moveImage(i, 1)} type="button"><ChevronDown className="size-3.5 -rotate-90" /></button>
                    </span>
                    <button aria-label={H.REMOVE_IMAGE} className="grid size-6 place-items-center rounded bg-white/90 text-red-600 shadow" onClick={() => setFieldValue("images", values.images.filter((_, j) => j !== i))} type="button"><X className="size-3.5" /></button>
                  </span>
                </figure>
              ))}
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-xs text-muted hover:border-brand-400 hover:text-brand-700">
                <Upload aria-hidden className="size-5" />{H.UPLOAD}
                <input accept="image/jpeg,image/png,image/webp" className="sr-only" multiple onChange={onFile} type="file" />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <input aria-label={H.IMAGE_URL} className="h-10 flex-1 rounded-lg border border-line px-3 text-sm" onChange={(e) => setImageUrl(e.target.value)} placeholder={H.IMAGE_URL_PLACEHOLDER} value={imageUrl} />
              <Button disabled={!/^https:\/\/\S+$/.test(imageUrl)} onClick={() => { addImage(imageUrl.trim()); setImageUrl(""); }} size="md" variant="outline"><ImagePlus className="size-4" />{H.ADD_URL}</Button>
            </div>
          </Section>

          <Section hint={H.VARIANTS_HINT} title={H.SECTION_VARIANTS}>
            <div className="space-y-3">
              {values.options.map((opt, i) => (
                <div className="grid gap-2 sm:grid-cols-[180px_1fr_auto]" key={i}>
                  <input aria-label={H.OPTION_NAME} className="h-10 rounded-lg border border-line px-3 text-sm" onChange={(e) => setOptions(values.options.map((o, j) => (j === i ? { ...o, name: e.target.value } : o)))} placeholder={H.OPTION_NAME_PLACEHOLDER} value={opt.name} />
                  <input aria-label={H.OPTION_VALUES} className="h-10 rounded-lg border border-line px-3 text-sm" onChange={(e) => setOptions(values.options.map((o, j) => (j === i ? { ...o, values: e.target.value } : o)))} placeholder={H.OPTION_VALUES_PLACEHOLDER} value={opt.values} />
                  <Button aria-label={H.REMOVE_OPTION} onClick={() => setOptions(values.options.filter((_, j) => j !== i))} variant="ghost"><Trash2 className="size-4" /></Button>
                </div>
              ))}
              {values.options.length < 3 && (
                <Button onClick={() => setOptions([...values.options, { name: values.options.length ? "Colour" : "Size", values: "" }])} size="sm" variant="subtle"><Plus className="size-4" />{H.ADD_OPTION}</Button>
              )}
            </div>
            <div className="-mx-5 mt-5 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-y border-line bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr><th className="px-5 py-2">{H.VARIANT}</th><th className="px-2 py-2">SKU</th><th className="px-2 py-2">{EN.PRODUCT.MRP}</th><th className="px-2 py-2">{EN.TABLE.PRICE}</th><th className="px-5 py-2">{EN.SELLER.STOCK}</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {values.variants.map((v, i) => {
                    const e = variantErrors[i] ?? {};
                    const cell = (key, type = "text") => (
                      <div>
                        <input aria-invalid={Boolean(showAll && e[key])} aria-label={`${key} ${i + 1}`} className={`h-9 w-full rounded-md border px-2 text-sm tabular ${showAll && e[key] ? "border-red-500" : "border-line"}`} inputMode={type === "number" ? "decimal" : undefined} onChange={(ev) => setVariant(i, key, type === "number" ? ev.target.value.replace(/[^\d.]/g, "") : ev.target.value.toUpperCase())} value={v[key]} />
                        {showAll && e[key] && <p className="mt-0.5 text-[11px] text-red-600">{e[key]}</p>}
                      </div>
                    );
                    return (
                      <tr key={attrKey(v.attributes) + i}>
                        <td className="px-5 py-2 font-medium">{Object.values(v.attributes).join(" / ") || EN.SELLER.DEFAULT_VARIANT}</td>
                        <td className="w-48 px-2 py-2">{cell("sku")}</td>
                        <td className="w-28 px-2 py-2">{cell("mrp", "number")}</td>
                        <td className="w-28 px-2 py-2">{cell("price", "number")}</td>
                        <td className="w-28 px-5 py-2">{cell("stock", "number")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {typeof errors.variants === "string" && showAll && <p className="mt-2 text-sm text-red-600">{errors.variants}</p>}
          </Section>

          <Section hint={W.HINT} title={W.TITLE}>
            <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Toggle checked={values.bulkPricing} label={W.BULK_PRICING} onChange={(v) => setFieldValue("bulkPricing", v)} />
                  <span className="text-sm"><b>{W.BULK_PRICING}</b><span className="block text-xs text-muted">{W.BULK_PRICING_HINT}</span></span>
                </div>
                {values.bulkPricing && (
                  <div className="space-y-2">
                    {values.priceTiers.map((t, i) => {
                      const e = tierErrors[i] ?? {};
                      return (
                        <div className="grid grid-cols-[1fr_1fr_auto] items-start gap-2" key={i}>
                          <label className="text-xs text-muted">{W.MIN_QTY}
                            <input aria-invalid={Boolean(showAll && e.minQty)} className={`mt-1 h-9 w-full rounded-md border px-2 text-sm tabular text-ink ${showAll && e.minQty ? "border-red-500" : "border-line"}`} inputMode="numeric" onChange={(ev) => setTier(i, "minQty", ev.target.value)} value={t.minQty} />
                            {showAll && e.minQty && <span className="mt-0.5 block text-[11px] text-red-600">{e.minQty}</span>}
                          </label>
                          <label className="text-xs text-muted">{W.DISCOUNT}
                            <input aria-invalid={Boolean(showAll && e.discountPct)} className={`mt-1 h-9 w-full rounded-md border px-2 text-sm tabular text-ink ${showAll && e.discountPct ? "border-red-500" : "border-line"}`} inputMode="numeric" onChange={(ev) => setTier(i, "discountPct", ev.target.value)} value={t.discountPct} />
                            {showAll && e.discountPct && <span className="mt-0.5 block text-[11px] text-red-600">{e.discountPct}</span>}
                          </label>
                          <Button aria-label={W.REMOVE_TIER} className="mt-5" disabled={values.priceTiers.length === 1} onClick={() => setFieldValue("priceTiers", values.priceTiers.filter((_, j) => j !== i))} variant="ghost"><Trash2 className="size-4" /></Button>
                        </div>
                      );
                    })}
                    {typeof errors.priceTiers === "string" && showAll && <p className="text-sm text-red-600">{errors.priceTiers}</p>}
                    {values.priceTiers.length < 3 && (
                      <Button onClick={() => { const last = values.priceTiers.at(-1) ?? { discountPct: 0, minQty: 0 }; setFieldValue("priceTiers", [...values.priceTiers, { discountPct: Math.min(60, Number(last.discountPct) + 5), minQty: Number(last.minQty) * 2 || 10 }]); }} size="sm" variant="subtle"><Plus className="size-4" />{W.ADD_TIER}</Button>
                    )}
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormInput error={err("moq")} hint={W.MOQ_HINT} inputMode="numeric" label={W.MOQ} name="moq" onBlur={handleBlur} onChange={(e) => setFieldValue("moq", e.target.value.replace(/[^\d]/g, ""))} touched={showAll || touched.moq} value={values.moq} />
                  <div className="flex items-start gap-3 sm:pt-7">
                    <Toggle checked={values.enquiryOnly} label={W.ENQUIRY_ONLY} onChange={(v) => setFieldValue("enquiryOnly", v)} />
                    <span className="text-sm"><b>{W.ENQUIRY_ONLY}</b><span className="block text-xs text-muted">{W.ENQUIRY_ONLY_HINT}</span></span>
                  </div>
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 text-sm">
                <p className="mb-2 flex items-center gap-2 font-semibold"><Layers aria-hidden className="size-4 text-brand-600" />{W.SLAB_PREVIEW}</p>
                {!basePrice ? <p className="text-xs text-muted">{W.SLAB_PREVIEW_EMPTY}</p> : (
                  <ul className="space-y-1.5">
                    <li className="flex justify-between"><span>{W.SLAB_RANGE(Math.max(1, Number(values.moq) || 1), values.bulkPricing ? (Number(values.priceTiers[0]?.minQty) || 2) - 1 : null)}</span><b className="tabular">{formatCurrency(basePrice)}</b></li>
                    {values.bulkPricing && values.priceTiers.map((t, i) => (
                      <li className="flex justify-between" key={i}>
                        <span>{W.SLAB_RANGE(Number(t.minQty) || 0, values.priceTiers[i + 1] ? (Number(values.priceTiers[i + 1].minQty) || 1) - 1 : null)}</span>
                        <span className="tabular"><b>{formatCurrency(tierUnitPrice(basePrice, { discountPct: Number(t.discountPct) || 0 }))}</b> <span className="text-xs text-emerald-700">−{Number(t.discountPct) || 0}%</span></span>
                      </li>
                    ))}
                  </ul>
                )}
                {values.enquiryOnly && <p className="mt-3 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{W.ENQUIRY_ONLY_PREVIEW}</p>}
              </div>
            </div>
          </Section>

          <Section title={EN.PRODUCT.SPECIFICATIONS}>
            <div className="space-y-2">
              {values.specifications.map((spec, i) => (
                <div className="grid gap-2 sm:grid-cols-[200px_1fr_auto]" key={i}>
                  <input aria-label={H.SPEC_NAME} className="h-10 rounded-lg border border-line px-3 text-sm" onChange={(e) => setFieldValue(`specifications.${i}.name`, e.target.value)} placeholder={H.SPEC_NAME_PLACEHOLDER} value={spec.name} />
                  <input aria-label={H.SPEC_VALUE} className="h-10 rounded-lg border border-line px-3 text-sm" onChange={(e) => setFieldValue(`specifications.${i}.value`, e.target.value)} placeholder={H.SPEC_VALUE_PLACEHOLDER} value={spec.value} />
                  <Button aria-label={H.REMOVE_SPEC} onClick={() => setFieldValue("specifications", values.specifications.filter((_, j) => j !== i))} variant="ghost"><Trash2 className="size-4" /></Button>
                </div>
              ))}
              <Button onClick={() => setFieldValue("specifications", [...values.specifications, { name: "", value: "" }])} size="sm" variant="subtle"><Plus className="size-4" />{H.ADD_SPEC}</Button>
            </div>
          </Section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20 xl:h-fit">
          <Panel title={H.PREVIEW}>
            <div className="rounded-xl bg-white p-3 ring-1 ring-line">
              <div className="aspect-square overflow-hidden rounded-lg bg-slate-50">
                <SmartImage alt="" className="size-full object-contain p-2" src={values.images[0] ?? "/placeholder-product.svg"} />
              </div>
              <p className="mt-3 truncate text-xs font-medium uppercase tracking-wide text-muted">{values.brand || EN.LISTING.BRAND}</p>
              <p className="mt-1 line-clamp-2 text-sm font-medium">{values.name || H.FIELD_NAME}</p>
              <Rating className="mt-1.5" value={product?.rating || 0} />
              <PriceTag className="mt-2" discount={discountPercent(Number(first.price) || 0, Number(first.mrp) || 0)} mrp={Number(first.mrp) || 0} price={prices.length ? Math.min(...prices) : 0} />
              <p className="mt-1 text-xs text-muted">{H.VARIANTS_STOCK(values.variants.length, totalStock)}</p>
            </div>
          </Panel>
          <Panel>
            <p className="flex gap-2 text-sm text-muted"><Info aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-600" />{moderation ? H.MODERATION_NOTE : H.NO_MODERATION_NOTE}</p>
            <div className="mt-4 grid gap-2">
              <Button loading={isSubmitting && pending === "submit"} onClick={() => { intent.current = true; setPending("submit"); submitForm(); }} size="lg">{moderation ? H.SUBMIT_REVIEW : H.PUBLISH}</Button>
              <Button disabled={isSubmitting} loading={isSubmitting && pending === "draft"} onClick={() => { intent.current = false; setPending("draft"); submitForm(); }} variant="outline">{H.SAVE_DRAFT}</Button>
            </div>
          </Panel>
        </aside>
      </div>
    </form>
  );
}
