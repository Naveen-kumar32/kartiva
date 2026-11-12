import { ExternalLink, LogOut, Menu, Search } from "lucide-react";
import { Suspense, useState } from "react";
import { useDispatch } from "react-redux";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { logout } from "@/api";
import { Badge, Drawer, ErrorBoundary, Logo, NotificationBell, PageLoader } from "@/components";
import { useAuth, useIdleTimeout } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { clearCredentials } from "@/store/slices/authSlice";
import { cn } from "@/utils/cn";
import { infoToast } from "@/utils/toast";

// Pages inside a section share the section in the sidebar and get tabs at the top of the page.
const matches = (pathname, to) => pathname === to || (to.split("/").length > 2 && pathname.startsWith(`${to}/`));
const sectionOf = (nav, pathname) => nav.find((n) => n.items?.some((i) => matches(pathname, i.to)));

// Shared shell for seller & admin areas.
// nav: [{ heading } | { label, icon, items: [{ to, label }] }] — items after the first become tabs.
// notice: optional banner above every page (e.g. "store under review").
// badges: { [path]: count } — red count bubbles (summed per section in the sidebar, shown per tab).
export function DashboardLayout({ areaLabel, badges = {}, nav, notice, subtitle }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { user } = useAuth();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = sectionOf(nav, pathname);

  const signOut = async () => {
    await logout();
    dispatch(clearCredentials());
    navigate(ROUTES.HOME);
  };
  // Dashboards hold sensitive data: sign out after 30 minutes without activity.
  useIdleTimeout(async () => {
    await logout();
    dispatch(clearCredentials());
    infoToast(EN.AUTH.SESSION_EXPIRED);
    navigate(ROUTES.LOGIN, { replace: true });
  }, 30);

  const count = (n) => (n > 0 ? <span aria-label={`${n} new`} className="grid min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-5 text-white">{n > 99 ? "99+" : n}</span> : null);
  const q = query.trim().toLowerCase();
  const results = q ? nav.flatMap((n) => (n.items ?? []).map((i) => ({ ...i, section: n.label }))).filter((i) => `${i.label} ${i.section}`.toLowerCase().includes(q)) : [];
  const close = () => { setOpen(false); setQuery(""); };

  const links = (
    <div className="p-3">
      <label className="relative mb-2 block">
        <span className="sr-only">{EN.NAV.FIND_PAGE}</span>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/50" />
        <input className="h-9 w-full rounded-lg border border-white/10 bg-white/10 pl-9 pr-3 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none" onChange={(e) => setQuery(e.target.value)} placeholder={EN.NAV.FIND_PAGE} type="search" value={query} />
      </label>
      {q ? (
        <ul className="space-y-0.5">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-white/50">{EN.NAV.NO_PAGE}</li>}
          {results.map((r) => (
            <li key={r.to}><NavLink className="block rounded-lg px-3 py-2 text-sm text-white/85 hover:bg-white/10" onClick={close} to={r.to}>{r.label}{r.label !== r.section && <span className="block text-[11px] text-white/50">{r.section}</span>}</NavLink></li>
          ))}
        </ul>
      ) : (
        <nav className="space-y-0.5">
          {nav.map((n) => (n.heading ? (
            <p className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-white/40 first:pt-1" key={`h-${n.heading}`}>{n.heading}</p>
          ) : (
            <NavLink
              aria-current={n === active ? "page" : undefined}
              className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition", n === active ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white")}
              key={n.label}
              onClick={close}
              to={n.items[0].to}
            >
              <n.icon aria-hidden className="size-5" /> <span className="flex-1">{n.label}</span>
              {count(n.items.reduce((t, i) => t + (badges[i.to] ?? 0), 0))}
            </NavLink>
          )))}
        </nav>
      )}
    </div>
  );

  const tabs = active && active.items.length > 1 ? (
    <nav aria-label={active.label} className="scrollbar-none -mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line px-1">
      {active.items.map((i) => (
        <NavLink
          className={({ isActive }) => cn("flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition", isActive || matches(pathname, i.to) ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-ink")}
          end
          key={i.to}
          to={i.to}
        >
          {i.label}{count(badges[i.to] ?? 0)}
        </NavLink>
      ))}
    </nav>
  ) : null;

  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[256px_1fr] lg:bg-brand-900">
      <aside className="hidden bg-brand-900 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-y-auto">
        <div className="flex h-16 items-center px-5"><Logo light /></div>
        <p className="px-6 pb-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">{areaLabel}</p>
        {links}
        <a className="mx-3 mb-4 mt-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10" href={ROUTES.HOME}>
          <ExternalLink aria-hidden className="size-4" /> {EN.APP.NAME} {EN.COMMON.STOREFRONT}
        </a>
      </aside>
      <Drawer onClose={() => setOpen(false)} open={open} title={areaLabel}>
        <div className="min-h-full bg-brand-900">{links}</div>
      </Drawer>
      <div className="flex min-h-screen min-w-0 flex-col bg-canvas">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
          <button aria-label={EN.NAV.MENU} className="rounded-lg p-1.5 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} type="button"><Menu className="size-6" /></button>
          <p className="truncate font-semibold">{subtitle}</p>
          <Badge className="hidden sm:inline-flex" tone="accent">{EN.COMMON.DEMO_BADGE}</Badge>
          <div className="ml-auto flex items-center gap-3">
            <NotificationBell />
            <span className="hidden text-sm text-muted sm:inline">{user?.firstName} {user?.lastName}</span>
            <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">{user?.firstName?.[0]}</span>
            <button aria-label={EN.AUTH.LOGOUT} className="rounded-lg p-2 text-muted hover:bg-slate-100" onClick={signOut} title={EN.AUTH.LOGOUT} type="button"><LogOut className="size-5" /></button>
          </div>
        </header>
        <main className="flex-1 bg-canvas p-4 sm:p-6 lg:p-8">{notice}{tabs}<ErrorBoundary resetKey={pathname}><Suspense fallback={<PageLoader />}><Outlet /></Suspense></ErrorBoundary></main>
      </div>
    </div>
  );
}
