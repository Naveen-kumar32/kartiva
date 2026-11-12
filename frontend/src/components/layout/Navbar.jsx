import { Menu, ShoppingCart } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useLocation } from "react-router-dom";

import { EN, ROUTES } from "@/locales";
import { useAuth } from "@/hooks";
import { selectCartCount } from "@/store/slices/cartSlice";
import { setMobileMenuOpen } from "@/store/slices/uiSlice";

import { NotificationBell } from "../market";
import { Logo } from "../ui";
import { AccountMenu } from "./AccountMenu";
import { AnnouncementBar } from "./AnnouncementBar";
import { CategoryBar } from "./CategoryBar";
import { MobileMenu } from "./MobileMenu";
import { SearchBar } from "./SearchBar";

export function Navbar() {
  const dispatch = useDispatch();
  const count = useSelector(selectCartCount);
  const { pathname } = useLocation();
  const { isAuthenticated } = useAuth();
  return (
    <>
    <AnnouncementBar />
    <header className="sticky top-0 z-30 shadow-md">
      <div className="bg-brand-700">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6 lg:flex-nowrap lg:gap-6 lg:px-8">
          <button aria-label={EN.NAV.MENU} className="-ml-1 rounded-lg p-1.5 text-white hover:bg-white/10 md:hidden" onClick={() => dispatch(setMobileMenuOpen(true))} type="button">
            <Menu className="size-6" />
          </button>
          <Logo light />
          {/* Remount on navigation so the box clears outside search results (no reset effect needed). */}
          <SearchBar className="order-last w-full lg:order-none lg:flex-1" key={pathname === ROUTES.SEARCH_PATTERN ? "search" : pathname} />
          <div className="ml-auto flex items-center gap-1 lg:ml-0">
            {isAuthenticated && <NotificationBell tone="light" />}
            <AccountMenu />
            <Link aria-label={`${EN.NAV.CART} (${count})`} className="relative flex items-center gap-2 rounded-lg px-2 py-1.5 text-white hover:bg-white/10" to={ROUTES.CART}>
              <ShoppingCart aria-hidden className="size-6" />
              {count > 0 && (
                <span className="absolute -top-0.5 left-5 grid min-w-5 place-items-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-ink tabular">{count}</span>
              )}
              <span className="hidden text-sm font-semibold lg:inline">{EN.NAV.CART}</span>
            </Link>
          </div>
        </div>
      </div>
      <CategoryBar />
      <MobileMenu />
    </header>
    </>
  );
}
