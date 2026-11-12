import { BadgeCheck, Bike, FileText, MessageSquareQuote, RotateCcw, ShieldCheck, ShoppingCart, Zap } from "lucide-react";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { Link, useNavigate, useParams } from "react-router-dom";

import { getProduct } from "@/api";
import {
  AdSlot, Badge, Breadcrumbs, BulkPricingTable, Button, Container, DeliveryCheck, EnquiryButton, ErrorState, PageLoader, PriceTag, ProductGallery, ProductRail,
  QuantityStepper, Rating, ReviewList, SectionHeader, SupplierCard, TradeChips, VariantSelector, WishlistButton,
} from "@/components";
import { AD_SLOT_KEYS } from "@/constants";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { addToCart } from "@/store/slices/cartSlice";
import { maxQtyFor, nextTierFor } from "@/utils/cart";
import { categoryTrail, discountPercent, findVariant, getDefaultVariant } from "@/utils/catalog";
import { formatCurrency } from "@/utils/format";
import { minOrderQty, tierFor, unitPriceFor } from "@/utils/pricing";
import { successToast } from "@/utils/toast";

const B = EN.BUYER_HUB;

export function ProductDetail() {
  const { slug } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { data: product, error, loading, reload } = useAsync(() => getProduct(slug), [slug]);
  // Selection is stored with the product id it belongs to, so navigating to another product
  // falls back to that product's default variant without a reset effect.
  const [selection, setSelection] = useState({ attrs: null, productId: null, quantity: null });
  useDocumentTitle(product?.name);
  const isCurrent = product && selection.productId === product.id;
  const selected = product ? (isCurrent ? selection.attrs : getDefaultVariant(product).attributes) : {};
  const moq = product ? minOrderQty(product) : 1;
  // Quantity starts at the minimum order quantity (MOQ) and never goes below it.
  const quantity = Math.max(moq, (isCurrent ? selection.quantity : null) ?? moq);
  const setSelected = (attrs) => setSelection({ attrs, productId: product.id, quantity: null });

  const variant = product ? findVariant(product, selected) ?? getDefaultVariant(product) : null;
  const maxQty = product ? Math.max(moq, maxQtyFor(product, variant)) : 1;
  const setQuantity = (q) => setSelection({ attrs: selected, productId: product.id, quantity: Math.min(maxQty, Math.max(moq, q)) });

  if (loading) return <PageLoader />;
  if (error || !product) return <Container className="py-10"><ErrorState message={error} onRetry={reload} /></Container>;

  const store = product.store;
  const inStock = variant.stock >= moq;
  const unitPrice = unitPriceFor(product, variant, quantity);
  const tier = tierFor(product, quantity);
  const nextTier = nextTierFor(product, variant, quantity);
  const enquiryOnly = Boolean(product.enquiryOnly);
  const crumbs = [{ label: EN.COMMON.HOME, to: ROUTES.HOME }, ...categoryTrail(product.categorySlug).map((c) => ({ label: c.name, to: ROUTES.CATEGORY(c.slug) })), { label: product.name }];

  const add = (goToCart) => {
    dispatch(addToCart({ maxQty, productId: product.id, quantity, variantId: variant.id }));
    if (goToCart) navigate(ROUTES.CART);
    else successToast(EN.CART.ADDED);
  };

  return (
    <Container className="pt-4 sm:pt-6">
      <Breadcrumbs items={crumbs} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_340px]">
        <ProductGallery images={product.images} key={product.id} name={product.name} />

        <div className="min-w-0">
          <Link className="text-sm font-semibold uppercase tracking-wide text-brand-700 hover:underline" to={ROUTES.SEARCH(product.brand)}>{product.brand}</Link>
          <div className="mt-1 flex items-start justify-between gap-3">
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{product.name}</h1>
            <WishlistButton className="shrink-0" product={product} size="lg" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Rating count={product.reviewCount} value={product.rating} />
            <span className="text-xs text-muted">{EN.PRODUCT.BOUGHT(product.soldCount)}</span>
          </div>
          <TradeChips className="mt-3" product={product} />
          <div className="mt-5 rounded-xl bg-white p-4 shadow-card">
            {enquiryOnly && <p className="text-xs font-semibold uppercase tracking-wide text-muted">{B.CHIPS.EX_SHOWROOM}</p>}
            <PriceTag discount={discountPercent(unitPrice, variant.mrp)} mrp={variant.mrp} price={unitPrice} size="lg" />
            {tier && <p className="mt-1 text-sm font-medium text-emerald-700">{B.PRICING.BULK_APPLIED(formatCurrency(unitPrice), tier.minQty, formatCurrency(variant.price))}</p>}
            {!enquiryOnly && nextTier && <p className="mt-1 text-sm text-brand-700">{B.PRICING.NUDGE(nextTier.addQty, formatCurrency(nextTier.unitPrice))}</p>}
            {moq > 1 && <p className="mt-1 text-sm text-amber-800">{B.PRICING.MOQ_NOTE(moq)}</p>}
            <p className="mt-1 text-xs text-muted">{enquiryOnly ? B.PRICING.EX_SHOWROOM_NOTE : `${EN.PRODUCT.INCLUSIVE_TAXES} · GST ${product.gstRate}% · HSN ${product.hsnCode}`}</p>
          </div>

          {!enquiryOnly && <BulkPricingTable className="mt-4" onPick={setQuantity} product={product} quantity={quantity} variant={variant} />}

          <div className="mt-6"><VariantSelector onSelect={setSelected} product={product} selected={selected} /></div>

          <p className="mt-5 text-sm">
            {inStock
              ? variant.stock <= 3 ? <span className="font-semibold text-red-600">{EN.PRODUCT.ONLY_LEFT(variant.stock)}</span> : <span className="font-semibold text-emerald-700">{EN.PRODUCT.IN_STOCK}</span>
              : <span className="font-semibold text-red-600">{EN.PRODUCT.OUT_OF_STOCK}</span>}
            <span className="ml-3 text-xs text-muted">{EN.PRODUCT.SKU}: {variant.sku}</span>
          </p>

          {enquiryOnly ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <EnquiryButton mode="on_road" product={product} size="lg" store={store} variant="accent"><MessageSquareQuote className="size-5" />{B.ENQUIRY.CTA_ON_ROAD}</EnquiryButton>
              <EnquiryButton mode="test_ride" product={product} size="lg" store={store} variant="outline"><Bike className="size-5" />{B.ENQUIRY.CTA_TEST_RIDE}</EnquiryButton>
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <QuantityStepper max={maxQty} min={moq} onChange={setQuantity} value={quantity} />
                <Button className="min-w-40 flex-1" disabled={!inStock} onClick={() => add(false)} size="lg" variant="accent"><ShoppingCart className="size-5" />{EN.PRODUCT.ADD_TO_CART}</Button>
                <Button className="min-w-40 flex-1" disabled={!inStock} onClick={() => add(true)} size="lg"><Zap className="size-5" />{EN.PRODUCT.BUY_NOW}</Button>
              </div>
              {quantity > 1 && <p className="mt-2 text-sm text-muted">{B.PRICING.LINE_TOTAL(quantity, formatCurrency(unitPrice * quantity))}</p>}
              <EnquiryButton className="mt-3" fullWidth initialQty={quantity} product={product} store={store} variant="subtle"><MessageSquareQuote className="size-4" />{B.ENQUIRY.CTA_BEST_PRICE}</EnquiryButton>
            </>
          )}

          <ul className="mt-6 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            {[
              [RotateCcw, product.isReturnable ? EN.PRODUCT.RETURNS(product.returnWindowDays) : EN.PRODUCT.NON_RETURNABLE],
              [FileText, EN.PRODUCT.GST_INVOICE],
              [ShieldCheck, EN.PRODUCT.SECURE],
              [BadgeCheck, EN.COMMON.VERIFIED_SELLER],
            ].map(([Icon, text]) => (
              <li className="flex flex-col items-center gap-1.5 rounded-xl bg-white p-3 text-center shadow-card" key={text}>
                <Icon aria-hidden className="size-5 text-brand-600" />{text}
              </li>
            ))}
          </ul>
        </div>

        <aside className="space-y-4 lg:col-span-2 xl:col-span-1">
          {!enquiryOnly && <DeliveryCheck price={unitPrice * quantity} product={product} />}
          <SupplierCard store={store} />
          <AdSlot slotKey={AD_SLOT_KEYS.PRODUCT_BELOW_BUYBOX} variant="compact" />
        </aside>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 shadow-card sm:p-6">
          <h2 className="text-lg font-bold">{EN.PRODUCT.DESCRIPTION}</h2>
          <p className="mt-3 leading-relaxed text-ink/90">{product.description}</p>
        </section>
        <section className="rounded-2xl bg-white p-5 shadow-card sm:p-6">
          <h2 className="text-lg font-bold">{EN.PRODUCT.SPECIFICATIONS}</h2>
          <dl className="mt-3 divide-y divide-line text-sm">
            {product.specifications.map((s) => (
              <div className="grid grid-cols-[40%_1fr] gap-4 py-2.5" key={s.name}><dt className="text-muted">{s.name}</dt><dd>{s.value}</dd></div>
            ))}
            {Object.entries(variant.attributes).map(([k, v]) => (
              <div className="grid grid-cols-[40%_1fr] gap-4 py-2.5" key={k}><dt className="text-muted">{k}</dt><dd><Badge tone="brand">{v}</Badge></dd></div>
            ))}
          </dl>
        </section>
      </div>

      <section className="mt-8 rounded-2xl bg-white p-5 shadow-card sm:p-6">
        <h2 className="mb-5 text-lg font-bold">{EN.PRODUCT.REVIEWS}</h2>
        <ReviewList rating={product.rating} reviewCount={product.reviewCount} reviews={product.reviews} />
      </section>

      {product.related.length > 0 && (
        <section className="mt-10">
          <SectionHeader title={EN.PRODUCT.SIMILAR} to={ROUTES.CATEGORY(product.categorySlug)} />
          <ProductRail products={product.related} />
        </section>
      )}
      <AdSlot className="mt-10" context={{ categorySlug: categoryTrail(product.categorySlug)[0]?.slug, excludeProductId: product.id }} slotKey={AD_SLOT_KEYS.PRODUCT_SPONSORED_ROW} title={EN.ADS.SPONSORED_RELATED} />
    </Container>
  );
}
