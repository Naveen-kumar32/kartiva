import { Layers, MessageSquareQuote, PackageCheck } from "lucide-react";

import { EN } from "@/locales";
import { cn } from "@/utils/cn";
import { minOrderQty, priceTiersOf } from "@/utils/pricing";

const B = EN.BUYER_HUB.CHIPS;

// B2B listing chips: "Bulk price", "MOQ n", "Enquiry only".
export function TradeChips({ className, product }) {
  const moq = minOrderQty(product);
  const chips = [
    product.enquiryOnly && [MessageSquareQuote, B.ENQUIRY_ONLY, "bg-violet-50 text-violet-700 ring-violet-200"],
    priceTiersOf(product).length > 0 && [Layers, B.BULK_PRICE, "bg-brand-50 text-brand-700 ring-brand-200"],
    moq > 1 && [PackageCheck, B.MOQ(moq), "bg-amber-50 text-amber-800 ring-amber-200"],
  ].filter(Boolean);
  if (!chips.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {chips.map(([Icon, label, tone]) => (
        <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", tone)} key={label}>
          <Icon aria-hidden className="size-3" />{label}
        </span>
      ))}
    </div>
  );
}
