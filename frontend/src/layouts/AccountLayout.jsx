import { NavLink, Outlet } from "react-router-dom";

import { Container } from "@/components";
import { EN } from "@/locales";
import { cn } from "@/utils/cn";

import { ACCOUNT_LINKS } from "./accountLinks";

// Everything a customer owns, in one place (Amazon "Your Account" style). Customers only.
export function AccountLayout() {
  const link = ({ isActive }) => cn("flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition", isActive ? "bg-brand-50 text-brand-800" : "text-ink/80 hover:bg-slate-50 hover:text-ink");
  return (
    <Container className="pt-4 sm:pt-6 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6">
      <nav aria-label={EN.NAV.MY_ACCOUNT} className="scrollbar-none -mx-4 mb-4 flex gap-1 overflow-x-auto px-4 lg:sticky lg:top-32 lg:mx-0 lg:mb-0 lg:h-fit lg:flex-col lg:rounded-2xl lg:bg-white lg:p-2 lg:shadow-card">
        {ACCOUNT_LINKS.map(([Icon, label, to]) => (
          <NavLink className={link} end key={to} to={to}><Icon aria-hidden className="size-4 shrink-0" />{label}</NavLink>
        ))}
      </nav>
      <div className="min-w-0 [&>div]:!max-w-none [&>div]:!px-0 [&>div]:!pt-0">
        <Outlet />
      </div>
    </Container>
  );
}
