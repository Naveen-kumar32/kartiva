import { Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { CMS_CONTENT, PLATFORM } from "@/data";
import { EN, ROUTES } from "@/locales";

import { Logo } from "../ui";

const F = EN.FOOTER;
const T = EN.SITE;
// Page links take their label from the page title (Admin → Content & pages), so the two never drift.
const P = (slug) => [CMS_CONTENT.find((p) => p.slug === slug)?.title ?? slug, ROUTES.PAGE(slug)];

// Alibaba-style footer: five link columns + stay connected, then legal / company / payment bar.
const COLUMNS = [
  { links: [P("about"), P("why-kartiva"), P("corporate-responsibility"), P("careers"), P("contact")], title: T.ABOUT_COL },
  { links: [P("secure-payments"), P("buyer-protection"), P("delivery-guarantee"), P("after-sales"), P("policies")], title: T.PROTECTION_COL },
  { links: [[T.ALL_CATEGORIES, ROUTES.CATEGORIES], P("verified-suppliers"), [EN.BUYER_HUB.NAV.POST_REQUIREMENT, ROUTES.POST_REQUIREMENT], P("buy-requests"), P("bulk-buying")], title: T.SOURCE_COL },
  { links: [P("faq"), [T.LIVE_CHAT, ROUTES.ACCOUNT.MESSAGES], [T.DISPUTE, `${ROUTES.REPORT}?type=dispute`], P("returns"), P("shipping"), [T.REPORT_IP, `${ROUTES.REPORT}?type=ip`], [T.REPORT_VIOLATION, `${ROUTES.REPORT}?type=violation`]], title: T.HELP_COL },
  { links: [[F.SELL, ROUTES.SELL], [T.START_SELLING, ROUTES.REGISTER_SELLER], [T.SELLER_SIGN_IN, ROUTES.LOGIN_SELLER], [T.CHECK_ORDER, ROUTES.ACCOUNT.ORDERS], P("verified-supplier"), [F.ADVERTISE, ROUTES.ADVERTISE], P("partnerships"), P("seller-policies")], title: T.SELL_COL },
];
const LEGAL = [P("terms"), P("privacy"), P("cookie-policy"), P("ip-policy"), P("cancellation"), P("grievance")];
const PAYMENTS = T.PAYMENT_METHODS;

// Simple monochrome brand glyphs (lucide 1.x ships no brand icons). Links are set at launch.
const SOCIAL = [
  ["Facebook", "M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v9h4v-9H17l.5-4h-4V8.8c0-.5.3-.8.5-.8Z"],
  ["LinkedIn", "M5 9h3.5v11H5zM6.7 3.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM10.5 9H14v1.6c.6-1 1.8-1.9 3.6-1.9 3.4 0 4 2.2 4 5V20h-3.5v-5.4c0-1.3 0-2.9-1.8-2.9s-2.1 1.4-2.1 2.8V20h-3.7z"],
  ["X", "M4 4h4.6l4 5.6L17.4 4H20l-6.1 7.2L20.5 20h-4.6l-4.3-6-5.1 6H4l6.4-7.6z"],
  ["Instagram", "M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3Zm4 3.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm0 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm4.8-3.3a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"],
  ["YouTube", "M21.6 7.2a2.8 2.8 0 0 0-2-2C17.9 4.8 12 4.8 12 4.8s-5.9 0-7.6.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.7.4 7.6.4 7.6.4s5.9 0 7.6-.4a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.8ZM10 15.1V8.9l5.2 3.1z"],
  ["WhatsApp", "M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.4-.3Z"],
];

export function Footer() {
  return (
    <footer className="mt-16 bg-brand-900 text-white/80">
      <div className="border-b border-white/10">
        <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-8 sm:px-6 md:grid-cols-[1.2fr_1fr] md:items-center lg:px-8">
          <div className="flex items-start gap-4">
            <Logo light />
            <p className="max-w-md text-sm"><ShieldCheck aria-hidden className="mr-1 inline size-4 text-accent-400" />{T.PROTECTION_LINE}</p>
          </div>
          <Newsletter />
        </div>
      </div>

      <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-8 px-4 py-10 sm:px-6 md:grid-cols-3 lg:grid-cols-5 lg:px-8">
        {COLUMNS.map((col, i) => (
          <nav aria-label={col.title} key={col.title}>
            <h2 className="mb-3 text-sm font-bold text-white">{col.title}</h2>
            <ul className="space-y-2 text-sm">
              {col.links.map(([label, to]) => <li key={label}><Link className="hover:text-white hover:underline" to={to}>{label}</Link></li>)}
            </ul>
            {i === COLUMNS.length - 1 && (
              <div className="mt-6">
                <h2 className="mb-3 text-sm font-bold text-white">{T.STAY_CONNECTED}</h2>
                <ul className="flex flex-wrap gap-2">
                  {SOCIAL.map(([name, d]) => (
                    <li key={name}>
                      <a aria-label={`${name} — ${T.SHARE_SOON}`} className="grid size-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" href="#top" onClick={(e) => e.preventDefault()} title={T.SHARE_SOON}>
                        <svg aria-hidden className="size-4" fill="currentColor" viewBox="0 0 24 24"><path d={d} /></svg>
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-white/50">{T.APP_SOON}</p>
              </div>
            )}
          </nav>
        ))}
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto grid max-w-[1440px] gap-4 px-4 py-6 text-xs text-white/60 sm:px-6 lg:grid-cols-[1fr_auto] lg:px-8">
          <div className="space-y-2">
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {LEGAL.map(([label, to]) => <li key={label}><Link className="hover:text-white hover:underline" to={to}>{label}</Link></li>)}
            </ul>
            <p>{T.COMPANY_LINE(PLATFORM)}</p>
            <p>{PLATFORM.supportEmail} · {PLATFORM.supportPhone} · © 2026 {PLATFORM.legalName}. {F.RIGHTS}</p>
          </div>
          <div>
            <p className="mb-1.5 font-semibold text-white/80">{T.PAY_WITH}</p>
            <ul className="flex flex-wrap gap-1.5">
              {PAYMENTS.map((p) => <li className="rounded-md bg-white px-2 py-1 text-[11px] font-bold text-brand-900" key={p}>{p}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}

function Newsletter() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  if (done) return <p className="text-sm font-medium text-accent-400" role="status">{T.NEWSLETTER_DONE}</p>;
  return (
    <form className="w-full" onSubmit={(e) => { e.preventDefault(); if (/^\S+@\S+\.\S+$/.test(email)) setDone(true); }}>
      <label className="mb-1.5 block text-sm font-semibold text-white" htmlFor="newsletter-email">{T.NEWSLETTER}</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Mail aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input className="h-10 w-full rounded-lg border-0 bg-white pl-9 pr-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent-400" id="newsletter-email" onChange={(e) => setEmail(e.target.value)} placeholder={T.NEWSLETTER_PLACEHOLDER} type="email" value={email} />
        </div>
        <button className="h-10 rounded-lg bg-accent-500 px-4 text-sm font-semibold text-ink hover:bg-accent-400" type="submit">{T.NEWSLETTER_CTA}</button>
      </div>
    </form>
  );
}
