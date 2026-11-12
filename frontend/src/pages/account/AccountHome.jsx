import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { getMyOrders, getMyRfqs, getUnreadMessageCount, getWishlistIds } from "@/api";
import { StatusBadge } from "@/components";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { ACCOUNT_LINKS } from "@/layouts";
import { EN, ROUTES } from "@/locales";
import { formatCurrency, formatRelative } from "@/utils/format";

const H = EN.ACCOUNT_HUB;
const CARD_KEYS = { [ROUTES.ACCOUNT.ENQUIRIES]: "quotes", [ROUTES.ACCOUNT.MESSAGES]: "messages", [ROUTES.ACCOUNT.ORDERS]: "orders", [ROUTES.ACCOUNT.PROFILE]: "profile", [ROUTES.ACCOUNT.SUPPORT]: "help", [ROUTES.ACCOUNT.WISHLIST]: "wishlist" };

// Customer home: one card per area with a live count, plus the latest orders.
export function AccountHome() {
  const { user } = useAuth();
  useDocumentTitle(EN.NAV.MY_ACCOUNT);
  const { data } = useAsync(async () => {
    const [orders, rfqs, unread, wishlist] = await Promise.all([getMyOrders(), getMyRfqs(user).catch(() => []), getUnreadMessageCount(user), getWishlistIds(user).catch(() => [])]);
    return { orders, rfqs, unread, wishlist };
  }, [user?.email]);
  const counts = data && {
    [ROUTES.ACCOUNT.ENQUIRIES]: H.COUNT_OPEN(data.rfqs.filter((r) => r.status === "open").length),
    [ROUTES.ACCOUNT.MESSAGES]: H.COUNT_UNREAD(data.unread),
    [ROUTES.ACCOUNT.ORDERS]: H.COUNT_ORDERS(data.orders.length),
    [ROUTES.ACCOUNT.WISHLIST]: H.COUNT_ITEMS(data.wishlist.length),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{H.HELLO(user.firstName)}</h1>
        <p className="mt-1 text-sm text-muted">{H.SUBTITLE}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ACCOUNT_LINKS.slice(1).map(([Icon, label, to]) => (
          <li key={to}>
            <Link className="group flex h-full items-start gap-3 rounded-2xl bg-white p-4 shadow-card transition hover:shadow-raised" to={to}>
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon aria-hidden className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 font-semibold">{label}<ChevronRight aria-hidden className="size-4 text-muted transition group-hover:translate-x-0.5" /></span>
                <span className="mt-0.5 block text-sm text-muted">{H.CARDS[CARD_KEYS[to]]}</span>
                {counts?.[to] && <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">{counts[to]}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <section className="rounded-2xl bg-white p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">{H.RECENT_ORDERS}</h2>
          <Link className="text-sm font-semibold text-brand-700 hover:underline" to={ROUTES.ACCOUNT.ORDERS}>{H.VIEW_ALL}</Link>
        </div>
        {data && data.orders.length === 0 && <p className="text-sm text-muted">{H.NO_ORDERS}</p>}
        <ul className="divide-y divide-line">
          {(data?.orders ?? []).slice(0, 3).map((o) => (
            <li className="flex flex-wrap items-center gap-3 py-3 text-sm" key={o.number}>
              <span className="min-w-0 flex-1"><span className="font-mono text-xs font-semibold">{o.number}</span><span className="block text-xs text-muted">{formatRelative(o.createdAt)} · {o.subOrders.map((s) => s.storeName).join(", ")}</span></span>
              <span className="flex flex-wrap gap-1">{o.subOrders.map((s) => <StatusBadge key={s.number} status={s.status} />)}</span>
              <span className="w-24 text-right font-semibold tabular">{formatCurrency(o.grandTotal)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
