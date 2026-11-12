import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { getNavCounts, getSellerStore, SEEN_EVENT } from "@/api";
import { useAuth } from "@/hooks";
import { DashboardLayout } from "@/layouts";
import { EN } from "@/locales";

const NOTICE = { pending: EN.SELLER.STORE_PENDING, rejected: EN.SELLER.STORE_REJECTED, suspended: EN.SELLER.STORE_SUSPENDED };

// Seller Hub shell: shows the signed-in seller's own store name and a banner while the store is not live.
export function SellerShell({ nav }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [store, setStore] = useState(null);
  const [badges, setBadges] = useState({});
  useEffect(() => {
    let alive = true;
    getSellerStore(user.storeSlug).then((s) => alive && setStore(s)).catch(() => {});
    const refresh = () => getNavCounts(user).then((c) => alive && setBadges(c));
    refresh();
    window.addEventListener(SEEN_EVENT, refresh);
    return () => { alive = false; window.removeEventListener(SEEN_EVENT, refresh); };
  }, [user, pathname]);

  const notice = store && NOTICE[store.status] ? (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
      <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0" />{NOTICE[store.status]}
    </div>
  ) : null;
  return <DashboardLayout areaLabel={EN.SELLER.AREA} badges={badges} nav={nav} notice={notice} subtitle={EN.SELLER.SUBTITLE(store?.name ?? "…")} />;
}
