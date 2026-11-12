import { ProductCard } from "./ProductCard";

// Horizontal scroller on mobile, grid row on desktop.
export function ProductRail({ products, sponsored = false }) {
  return (
    <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-5 xl:grid-cols-6">
      {products.map((p) => (
        <ProductCard className="w-44 shrink-0 snap-start sm:w-auto" key={p.id} product={p} sponsored={sponsored} />
      ))}
    </div>
  );
}
