import { SORT_OPTIONS } from "@/constants";
import { EN } from "@/locales";

import { Select } from "../ui";

export function SortSelect({ onChange, value }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="hidden text-muted sm:inline">{EN.LISTING.SORT}</span>
      <Select ariaLabel={EN.LISTING.SORT} className="w-48 font-medium" onChange={onChange} options={SORT_OPTIONS.map((o) => ({ label: EN.LISTING[o.labelKey], value: o.value }))} searchable={false} size="sm" value={value} />
    </div>
  );
}
