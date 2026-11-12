import { ClipboardList, Heart, LayoutDashboard, LayoutGrid, LifeBuoy, MessageSquareQuote, MessagesSquare, Package } from "lucide-react";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";

import { getUnreadMessageCount } from "@/api";
import { USER_ROLES } from "@/constants";
import { CATEGORIES } from "@/data";
import { useAuth } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { selectMobileMenuOpen, setMobileMenuOpen } from "@/store/slices/uiSlice";
import { getDashboardRouteForRole } from "@/utils/authRedirect";

import { Drawer } from "../ui";

const N = EN.BUYER_HUB.NAV;

export function MobileMenu() {
  const dispatch = useDispatch();
  const open = useSelector(selectMobileMenuOpen);
  const { isAuthenticated, role, user } = useAuth();
  const close = () => dispatch(setMobileMenuOpen(false));
  const allRoots = CATEGORIES.filter((c) => !c.parentId && c.isActive !== false);
  const roots = allRoots.filter((c) => c.showInNav).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!open || !user) return undefined;
    let alive = true;
    getUnreadMessageCount(user).then((n) => alive && setUnread(n));
    return () => { alive = false; };
  }, [open, user]);
  const accountLinks = [
    [LayoutDashboard, EN.NAV.MY_ACCOUNT, ROUTES.ACCOUNT.HOME],
    [Package, EN.NAV.MY_ORDERS, ROUTES.ACCOUNT.ORDERS],
    [MessageSquareQuote, N.ENQUIRIES, ROUTES.ACCOUNT.ENQUIRIES],
    [MessagesSquare, N.MESSAGES, ROUTES.ACCOUNT.MESSAGES, unread],
    [Heart, N.WISHLIST, ROUTES.ACCOUNT.WISHLIST],
    [LifeBuoy, N.SUPPORT, ROUTES.ACCOUNT.SUPPORT],
  ];

  return (
    <Drawer onClose={close} open={open} title={EN.NAV.MENU}>
      <div className="bg-brand-700 px-4 py-4 text-white">
        {isAuthenticated ? (
          <Link className="font-semibold" onClick={close} to={getDashboardRouteForRole(role) === ROUTES.HOME ? ROUTES.ACCOUNT.ORDERS : getDashboardRouteForRole(role)}>
            {EN.NAV.HELLO(user.firstName)}
          </Link>
        ) : (
          <Link className="font-semibold" onClick={close} to={ROUTES.LOGIN}>{EN.NAV.HELLO_GUEST}</Link>
        )}
      </div>
      <nav className="p-2">
        <Link className="mb-1 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-3 font-semibold text-ink" onClick={close} to={ROUTES.POST_REQUIREMENT}>
          <ClipboardList aria-hidden className="size-5 text-accent-600" />{N.POST_REQUIREMENT}
        </Link>
        {isAuthenticated && role === USER_ROLES.BUYER && (
          <>
            {accountLinks.map(([Icon, label, to, badge]) => (
              <Link className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-slate-50" key={to} onClick={close} to={to}>
                <Icon aria-hidden className="size-4 text-muted" /><span className="flex-1">{label}</span>
                {badge > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-5 text-white tabular">{badge}</span>}
              </Link>
            ))}
            <hr className="my-2 border-line" />
          </>
        )}
        <Link className="flex items-center gap-2 rounded-lg px-3 py-3 font-semibold text-brand-700 hover:bg-slate-50" onClick={close} to={ROUTES.CATEGORIES}>
          <LayoutGrid aria-hidden className="size-5" />{EN.NAV.BROWSE_ALL(allRoots.length)}
        </Link>
        {roots.map((root) => (
          <details className="group" key={root.id}>
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-3 font-medium hover:bg-slate-50">
              {root.name} <span className="text-muted transition group-open:rotate-90">›</span>
            </summary>
            <div className="pb-2 pl-4">
              <Link className="block rounded-lg px-3 py-2 text-sm font-semibold text-brand-700" onClick={close} to={ROUTES.CATEGORY(root.slug)}>{EN.COMMON.SEE_ALL}</Link>
              {CATEGORIES.filter((c) => c.parentId === root.id && c.isActive !== false).map((c) => (
                <Link className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-slate-50 hover:text-ink" key={c.id} onClick={close} to={ROUTES.CATEGORY(c.slug)}>{c.name}</Link>
              ))}
            </div>
          </details>
        ))}
        <hr className="my-2 border-line" />
        <Link className="block rounded-lg px-3 py-3 font-medium text-brand-700" onClick={close} to={ROUTES.SELL}>{EN.NAV.SELL}</Link>
        <Link className="block rounded-lg px-3 py-3 font-medium" onClick={close} to={ROUTES.ADVERTISE}>{EN.FOOTER.ADVERTISE}</Link>
      </nav>
    </Drawer>
  );
}
