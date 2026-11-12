import { Megaphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getAnnouncement } from "@/api";
import { EN } from "@/locales";

const KEY = "kartiva.announcementDismissed";
const B = EN.BUYER_HUB.ANNOUNCEMENT;
const readDismissed = () => { try { return window.sessionStorage.getItem(KEY); } catch { return null; } };
const writeDismissed = (text) => { try { window.sessionStorage.setItem(KEY, text); } catch { /* storage blocked — dismiss for this render only */ } };

// Site-wide announcement from the CMS (admin → Content). Dismissible per browser session.
export function AnnouncementBar() {
  const [item, setItem] = useState(null);
  const [dismissed, setDismissed] = useState(readDismissed);
  useEffect(() => {
    let alive = true;
    getAnnouncement().then((a) => alive && setItem(a)).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!item || dismissed === item.text) return null;
  const internal = item.link?.startsWith("/") && !item.link.startsWith("//");
  return (
    <div className="bg-accent-500 text-ink" role="region" aria-label={B.LABEL}>
      <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-1.5 text-xs sm:px-6 sm:text-sm lg:px-8">
        <Megaphone aria-hidden className="size-4 shrink-0" />
        <p className="min-w-0 flex-1">
          {item.text}{" "}
          {item.link && (internal
            ? <Link className="font-semibold underline underline-offset-2" to={item.link}>{B.LEARN_MORE}</Link>
            : <a className="font-semibold underline underline-offset-2" href={item.link} rel="noopener noreferrer" target="_blank">{B.LEARN_MORE}</a>)}
        </p>
        <button aria-label={B.DISMISS} className="rounded p-1 hover:bg-black/10" onClick={() => { writeDismissed(item.text); setDismissed(item.text); }} type="button">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
