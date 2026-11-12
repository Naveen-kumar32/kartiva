import { ProductCard } from "./ProductCard";

export function ProductGrid({ products, sponsored = [] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
      {sponsored.map((p) => <ProductCard key={`s-${p.id}`} product={p} sponsored />)}
      {products.map((p) => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}
