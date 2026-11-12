import { Award, BadgeCheck, BadgeIndianRupee, CalendarClock, ClipboardList, FileText, MessageSquareQuote, Truck } from "lucide-react";
import { useDispatch } from "react-redux";
import { Link, useNavigate } from "react-router-dom";

import { getMembershipPlans, logout } from "@/api";
import { Button, Container } from "@/components";
import { USER_ROLES } from "@/constants";
import { PLATFORM } from "@/data";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { clearCredentials } from "@/store/slices/authSlice";
import { formatCurrency } from "@/utils/format";

const ICONS = [BadgeIndianRupee, CalendarClock, Truck, FileText];
const GROWTH_ICONS = [MessageSquareQuote, ClipboardList, Award, BadgeCheck];
const S = EN.BUYER_HUB.SELL_PAGE;

export function Sell() {
  useDocumentTitle(EN.SELL.TITLE);
  const { data: plans } = useAsync(getMembershipPlans, []);
  const { isAuthenticated, role } = useAuth();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isSeller = role === USER_ROLES.SELLER;
  // Signed in as a buyer/admin? Sign out first — the login page is guest-only and would bounce them away.
  const sellerSignIn = async (e) => {
    if (!isAuthenticated) return;
    e.preventDefault();
    await logout();
    dispatch(clearCredentials());
    navigate(ROUTES.LOGIN_SELLER);
  };
  return (
    <>
      <section className="bg-brand-800 text-white">
        <Container className="py-14 sm:py-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent-400">{S.EYEBROW}</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-extrabold sm:text-5xl">{EN.SELL.TITLE}</h1>
          <p className="mt-4 max-w-xl text-lg text-white/80">{S.SUBTITLE}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" to={ROUTES.REGISTER_SELLER} variant="accent">{EN.SELL.CTA}</Button>
            <Link className="inline-flex h-12 items-center rounded-lg px-6 font-semibold text-white ring-1 ring-white/40 hover:bg-white/10" onClick={isSeller ? undefined : sellerSignIn} to={isSeller ? ROUTES.SELLER.DASHBOARD : ROUTES.LOGIN_SELLER}>{isSeller ? EN.AUTH.GO_TO_SELLER_HUB : S.SIGN_IN}</Link>
          </div>
          <dl className="mt-10 grid max-w-2xl grid-cols-3 gap-4">
            {S.STATS.map((s) => (
              <div key={s.label}><dt className="text-xs text-white/70">{s.label}</dt><dd className="text-2xl font-bold">{s.value}</dd></div>
            ))}
          </dl>
        </Container>
      </section>
      <Container className="py-12">
        <h2 className="text-xl font-bold">{S.GROWTH_TITLE}</h2>
        <p className="mt-1 text-sm text-muted">{S.GROWTH_BODY}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {S.GROWTH.map((b, i) => {
            const Icon = GROWTH_ICONS[i];
            return (
              <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-amber-100" key={b.title}>
                <Icon aria-hidden className="size-8 text-accent-600" />
                <h3 className="mt-3 font-semibold">{b.title}</h3>
                <p className="mt-1 text-sm text-muted">{b.body}</p>
              </div>
            );
          })}
        </div>
        <h2 className="mt-12 text-xl font-bold">{S.BASICS_TITLE}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {EN.SELL.BENEFITS.map((b, i) => {
            const Icon = ICONS[i];
            return (
              <div className="rounded-2xl bg-white p-6 shadow-card" key={b.title}>
                <Icon aria-hidden className="size-8 text-brand-600" />
                <h3 className="mt-3 font-semibold">{b.title}</h3>
                <p className="mt-1 text-sm text-muted">{b.body}</p>
              </div>
            );
          })}
        </div>
        <h2 className="mt-12 text-xl font-bold">{S.PLANS_TITLE}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {(plans ?? []).map((p) => (
            <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-line" key={p.code} style={{ borderTop: `4px solid ${p.color}` }}>
              <p className="font-semibold">{p.name}</p>
              <p className="mt-1 text-2xl font-bold">{p.priceYearly ? S.PER_YEAR(formatCurrency(p.priceYearly)) : S.FREE}</p>
              <ul className="mt-3 space-y-1.5 text-sm text-muted">
                {p.features.slice(0, 4).map((f) => <li className="flex items-start gap-2" key={f}><BadgeCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-600" />{f}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <h2 className="mt-14 text-xl font-bold">{EN.SELL.STEPS_TITLE}</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {EN.SELL.STEPS.map((s, i) => (
            <li className="flex items-start gap-3 rounded-2xl bg-white p-5 shadow-card" key={s}>
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-500 font-bold text-ink">{i + 1}</span>
              <span className="pt-1 text-sm font-medium">{s}</span>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-col items-start gap-3 rounded-2xl bg-brand-800 p-6 text-white sm:flex-row sm:items-center sm:justify-between">
          <p className="text-lg font-semibold">{S.FINAL_CTA_TITLE}</p>
          <Button size="lg" to={ROUTES.REGISTER_SELLER} variant="accent">{EN.SELL.CTA}</Button>
        </div>
        <p className="mt-8 text-xs text-muted">{EN.SELL.RATES_NOTE(PLATFORM)}</p>
      </Container>
    </>
  );
}
