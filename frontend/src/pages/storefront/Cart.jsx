import { ShoppingCart } from "lucide-react";

import { AdSlot, Button, CartSellerGroup, CartSummary, Container, EmptyState } from "@/components";
import { AD_SLOT_KEYS } from "@/constants";
import { useCartView, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";

export function Cart() {
  useDocumentTitle(EN.CART.TITLE);
  const view = useCartView();
  const hasStockIssue = view.hasIssue; // stock, MOQ or enquiry-only lines block checkout

  return (
    <Container className="pt-6">
      <h1 className="mb-1 text-2xl font-bold">{EN.CART.TITLE}</h1>
      {view.groups.length === 0 ? (
        <div className="mt-6"><EmptyState actionLabel={EN.CART.CONTINUE_SHOPPING} actionTo={ROUTES.HOME} body={EN.CART.EMPTY_BODY} icon={ShoppingCart} title={EN.CART.EMPTY_TITLE} /></div>
      ) : (
        <>
          <p className="mb-6 text-sm text-muted">{EN.CART.SELLER_COUNT(view.groups.length)} · {EN.CART.DELIVERY_ESTIMATE_NOTE}</p>
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">{view.groups.map((g) => <CartSellerGroup group={g} key={g.store.slug} />)}</div>
            <CartSummary view={view}>
              <Button disabled={hasStockIssue} fullWidth size="lg" to={hasStockIssue ? undefined : ROUTES.CHECKOUT} variant="accent">{EN.CART.CHECKOUT}</Button>
            </CartSummary>
          </div>
          <AdSlot className="mt-8" slotKey={AD_SLOT_KEYS.CART_BOTTOM_BANNER} />
        </>
      )}
    </Container>
  );
}
