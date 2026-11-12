import { Clock, MapPin, MessageSquareText, Store } from "lucide-react";

import { EN, ROUTES } from "@/locales";

import { VerifiedBadges } from "../market";
import { Button, Rating } from "../ui";
import { EnquiryButton } from "./EnquiryModal";
import { StoreAvatar } from "./StoreCard";

const B = EN.BUYER_HUB.SUPPLIER;
const THIS_YEAR = new Date().getFullYear();
const yearsInBusiness = (store) => (store?.yearEstablished ? Math.max(1, THIS_YEAR - store.yearEstablished) : null);

// Alibaba-style supplier card for the product page ("Sold by").
export function SupplierCard({ store }) {
  const years = yearsInBusiness(store);
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="text-xs text-muted">{EN.PRODUCT.SOLD_BY}</p>
      <div className="mt-2 flex items-center gap-3">
        <StoreAvatar size="size-11" store={store} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{store.name}</p>
          <Rating count={store.ratingCount} value={store.rating} />
        </div>
      </div>
      <VerifiedBadges className="mt-3" compact store={store} />
      <ul className="mt-3 space-y-1.5 text-xs text-muted">
        <li className="flex items-center gap-1.5"><Store aria-hidden className="size-3.5" />{[store.businessType, years && EN.MARKET.YEARS_IN_BUSINESS(years)].filter(Boolean).join(" · ")}</li>
        <li className="flex items-center gap-1.5"><MapPin aria-hidden className="size-3.5" />{store.city}, {store.state}</li>
        <li className="flex items-center gap-1.5"><Clock aria-hidden className="size-3.5" />{[EN.MARKET.RESPONDS_IN(store.responseHours), EN.MARKET.RESPONSE_RATE(store.responseRate)].filter(Boolean).join(" · ")}</li>
      </ul>
      <p className="mt-3 text-xs text-muted">{store.returnPolicy}</p>
      <div className="mt-3 grid gap-2">
        <EnquiryButton size="sm" store={store} variant="subtle"><MessageSquareText className="size-4" />{B.CONTACT}</EnquiryButton>
        <Button size="sm" to={ROUTES.STORE(store.slug)} variant="outline">{EN.PRODUCT.VISIT_STORE}</Button>
      </div>
    </div>
  );
}
