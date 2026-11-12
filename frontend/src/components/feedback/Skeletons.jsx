import { Skeleton } from "../ui";

export function ProductCardSkeleton() {
  return (
    <div className="rounded-xl bg-white p-3 shadow-card">
      <Skeleton className="aspect-square w-full rounded-lg" />
      <Skeleton className="mt-3 h-3 w-1/3" />
      <Skeleton className="mt-2 h-4 w-full" />
      <Skeleton className="mt-1.5 h-4 w-2/3" />
      <Skeleton className="mt-3 h-5 w-1/2" />
    </div>
  );
}

export function ProductGridSkeleton({ count = 10, className = "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5" }) {
  return (
    <div aria-busy="true" aria-label="Loading products" className={className}>
      {Array.from({ length: count }, (_, i) => <ProductCardSkeleton key={i} />)}
    </div>
  );
}

export function PageLoader() {
  return (
    <div aria-busy="true" className="grid min-h-[50vh] place-items-center" role="status">
      <div className="size-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
    </div>
  );
}
