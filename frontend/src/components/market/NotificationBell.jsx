import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { getMyNotifications, markNotificationsRead } from "@/api";
import { useAuth } from "@/hooks";
import { EN } from "@/locales";
import { cn } from "@/utils/cn";
import { formatDateTime } from "@/utils/format";

const M = EN.MARKET;
// Bell + dropdown. tone "light" for the dark storefront header, "dark" for the white dashboard header.
export function NotificationBell({ tone = "dark" }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    let alive = true;
    getMyNotifications(user).then((list) => alive && setItems(list));
    return () => { alive = false; };
  }, [user, pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!user) return null;
  const unread = items.filter((n) => !n.read).length;
  return (
    <div className="relative" ref={ref}>
      <button
        aria-expanded={open}
        aria-label={`${M.NOTIFICATIONS}${unread ? ` (${unread})` : ""}`}
        className={cn("relative rounded-lg p-2", tone === "light" ? "text-white hover:bg-white/10" : "text-muted hover:bg-slate-100")}
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <Bell aria-hidden className="size-5" />
        {unread > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-white text-ink shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold">{M.NOTIFICATIONS}</p>
            {unread > 0 && <button className="text-xs font-semibold text-brand-700 hover:underline" onClick={async () => setItems(await markNotificationsRead(user))} type="button">{M.MARK_ALL_READ}</button>}
          </div>
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">{M.NO_NOTIFICATIONS}</li>}
            {items.map((n) => (
              <li key={n.id}>
                <Link className={cn("block px-4 py-3 text-sm hover:bg-slate-50", !n.read && "bg-brand-50/50")} onClick={() => { setOpen(false); markNotificationsRead(user, n.id).then(setItems); }} to={n.link ?? "#"}>
                  <p className="flex items-center gap-2 font-medium">{!n.read && <span aria-hidden className="size-2 rounded-full bg-brand-600" />}{n.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-muted">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatDateTime(n.at)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
