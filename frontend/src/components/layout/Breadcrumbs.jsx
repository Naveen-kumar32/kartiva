import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

export function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm">
      <ol className="flex flex-wrap items-center gap-1 text-muted">
        {items.map((item, i) => (
          <li className="flex items-center gap-1" key={item.label}>
            {i > 0 && <ChevronRight aria-hidden className="size-3.5" />}
            {item.to && i < items.length - 1 ? <Link className="hover:text-brand-700 hover:underline" to={item.to}>{item.label}</Link> : <span aria-current="page" className="text-ink">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
