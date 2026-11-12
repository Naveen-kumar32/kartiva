import { useState } from "react";

import { EN } from "@/locales";
import { getStore } from "@/utils/catalog";

const F = EN.BUYER_HUB.FILTERS;

function Section({ children, title }) {
  return (
    <fieldset className="border-b border-line py-4 last:border-0">
      <legend className="mb-2 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function CheckList({ counts, labelOf = (k) => k, onToggle, selected }) {
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const visible = expanded ? entries : entries.slice(0, 6);
  return (
    <div className="space-y-1.5">
      {visible.map(([key, count]) => (
        <label className="flex cursor-pointer items-center gap-2 text-sm" key={key}>
          <input checked={selected.includes(key)} className="size-4 rounded border-line accent-brand-600" onChange={() => onToggle(key)} type="checkbox" />
          <span className="flex-1 truncate">{labelOf(key)}</span>
          <span className="text-xs text-muted tabular">{count}</span>
        </label>
      ))}
      {entries.length > 6 && (
        <button className="text-xs font-semibold text-brand-700" onClick={() => setExpanded((v) => !v)} type="button">
          {expanded ? EN.COMMON.SHOW_LESS : EN.COMMON.SHOW_MORE(entries.length - 6)}
        </button>
      )}
    </div>
  );
}

// Remounted (via key) whenever the URL price changes, so local input state stays in sync.
function PriceRange({ max, min, onApply }) {
  const [price, setPrice] = useState({ max: max ?? "", min: min ?? "" });
  const digits = (v) => v.replace(/\D/g, "");
  return (
    <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); onApply({ maxPrice: price.max || undefined, minPrice: price.min || undefined }); }}>
      <input aria-label={EN.LISTING.PRICE_MIN} className="h-9 w-full rounded-lg border border-line px-2 text-sm" inputMode="numeric" onChange={(e) => setPrice((p) => ({ ...p, min: digits(e.target.value) }))} placeholder={`₹ ${EN.LISTING.PRICE_MIN}`} value={price.min} />
      <span className="text-muted">–</span>
      <input aria-label={EN.LISTING.PRICE_MAX} className="h-9 w-full rounded-lg border border-line px-2 text-sm" inputMode="numeric" onChange={(e) => setPrice((p) => ({ ...p, max: digits(e.target.value) }))} placeholder={`₹ ${EN.LISTING.PRICE_MAX}`} value={price.max} />
      <button className="h-9 rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white" type="submit">{EN.LISTING.GO}</button>
    </form>
  );
}

function FlagCheck({ checked, count, label, onChange }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input checked={Boolean(checked)} className="size-4 rounded border-line accent-brand-600" onChange={(e) => onChange(e.target.checked || undefined)} type="checkbox" />
      <span className="flex-1">{label}</span>
      {count != null && <span className="text-xs text-muted tabular">{count}</span>}
    </label>
  );
}

// filters: { brands[], sellers[], businessTypes[], minPrice, maxPrice, minRating, inStock, verified, premium, bulk, attrs{} }
export function FilterPanel({ facets, filters, onChange, onClear }) {
  const toggle = (key, value) => {
    const list = filters[key] ?? [];
    onChange({ [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] });
  };
  const toggleAttr = (name, value) => {
    const list = filters.attrs?.[name] ?? [];
    onChange({ attrs: { ...filters.attrs, [name]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] } });
  };

  return (
    <div>
      <div className="flex items-center justify-between pb-2">
        <h2 className="font-bold">{EN.LISTING.FILTERS}</h2>
        <button className="text-xs font-semibold text-brand-700 hover:underline" onClick={onClear} type="button">{EN.LISTING.CLEAR_ALL}</button>
      </div>

      <Section title={EN.LISTING.PRICE}>
        <PriceRange key={`${filters.minPrice}-${filters.maxPrice}`} max={filters.maxPrice} min={filters.minPrice} onApply={onChange} />
      </Section>

      <Section title={F.SUPPLIER}>
        <div className="space-y-1.5">
          <FlagCheck checked={filters.verified} count={facets?.verified} label={F.VERIFIED} onChange={(verified) => onChange({ verified })} />
          <FlagCheck checked={filters.premium} count={facets?.premium} label={F.PREMIUM} onChange={(premium) => onChange({ premium })} />
          <FlagCheck checked={filters.bulk} count={facets?.bulk} label={F.BULK} onChange={(bulk) => onChange({ bulk })} />
        </div>
      </Section>

      {facets?.businessTypes && Object.keys(facets.businessTypes).length > 0 && (
        <Section title={F.BUSINESS_TYPE}>
          <CheckList counts={facets.businessTypes} onToggle={(v) => toggle("businessTypes", v)} selected={filters.businessTypes ?? []} />
        </Section>
      )}

      <Section title={EN.LISTING.RATING}>
        <div className="space-y-1.5">
          {[4, 3].map((r) => (
            <label className="flex cursor-pointer items-center gap-2 text-sm" key={r}>
              <input checked={Number(filters.minRating) === r} className="size-4 accent-brand-600" name="rating" onChange={() => onChange({ minRating: Number(filters.minRating) === r ? undefined : r })} onClick={() => Number(filters.minRating) === r && onChange({ minRating: undefined })} type="radio" />
              {EN.LISTING.RATING_UP(r)}
            </label>
          ))}
        </div>
      </Section>

      {Object.entries(facets?.attributes ?? {}).map(([name, counts]) => (
        <Section key={name} title={name}>
          <CheckList counts={counts} onToggle={(v) => toggleAttr(name, v)} selected={filters.attrs?.[name] ?? []} />
        </Section>
      ))}

      {facets?.brands && Object.keys(facets.brands).length > 1 && (
        <Section title={EN.LISTING.BRAND}>
          <CheckList counts={facets.brands} onToggle={(v) => toggle("brands", v)} selected={filters.brands ?? []} />
        </Section>
      )}

      {facets?.sellers && Object.keys(facets.sellers).length > 1 && (
        <Section title={EN.LISTING.SELLER}>
          <CheckList counts={facets.sellers} labelOf={(slug) => getStore(slug)?.name ?? slug} onToggle={(v) => toggle("sellers", v)} selected={filters.sellers ?? []} />
        </Section>
      )}

      <Section title={EN.LISTING.AVAILABILITY}>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input checked={Boolean(filters.inStock)} className="size-4 accent-brand-600" onChange={(e) => onChange({ inStock: e.target.checked || undefined })} type="checkbox" />
          {EN.LISTING.IN_STOCK_ONLY}
        </label>
      </Section>
    </div>
  );
}
