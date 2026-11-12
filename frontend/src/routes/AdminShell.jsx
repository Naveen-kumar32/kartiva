import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { getNavCounts, SEEN_EVENT } from "@/api";
import { useAuth } from "@/hooks";
import { DashboardLayout } from "@/layouts";
import { EN } from "@/locales";

// Admin shell: sidebar count bubbles for anything that needs attention (new orders, sign-ups, tickets …).
export function AdminShell({ nav }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [badges, setBadges] = useState({});
  useEffect(() => {
    let alive = true;
    const refresh = () => getNavCounts(user).then((c) => alive && setBadges(c));
    refresh();
    window.addEventListener(SEEN_EVENT, refresh);
    return () => { alive = false; window.removeEventListener(SEEN_EVENT, refresh); };
  }, [user, pathname]);
  return <DashboardLayout areaLabel={EN.ADMIN.AREA} badges={badges} nav={nav} subtitle={EN.ADMIN.SUBTITLE} />;
}
