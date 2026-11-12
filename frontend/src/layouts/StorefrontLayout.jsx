import { Outlet, useLocation } from "react-router-dom";

import { AdSlot, ErrorBoundary, Footer, Navbar } from "@/components";
import { AD_SLOT_KEYS } from "@/constants";
import { EN } from "@/locales";

export function StorefrontLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-screen flex-col">
      <a className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2" href="#main">{EN.NAV.SKIP_TO_CONTENT}</a>
      <AdSlot slotKey={AD_SLOT_KEYS.HOME_STRIP_TOP} variant="strip" />
      <Navbar />
      <main className="flex-1" id="main">
        <ErrorBoundary resetKey={pathname}><Outlet /></ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}
