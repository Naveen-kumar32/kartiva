import {
  Activity, BadgeIndianRupee, BarChart3, Boxes, Building2, ClipboardList, Crown, FileSpreadsheet, FileText, FolderTree, Gauge, History, Inbox,
  Landmark, LayoutDashboard, LifeBuoy, Mail, Megaphone, MessageSquareText, MessagesSquare, Package, PackageSearch, Percent, Radio, ReceiptIndianRupee,
  ScrollText, Settings, ShieldAlert, ShieldCheck, ShoppingBag, Store, Truck, Undo2, UserCog, Users, UsersRound, Warehouse,
} from "lucide-react";
import { lazy, Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";

import { ErrorBoundary, PageLoader, ScrollToTop } from "@/components";
import { USER_ROLES } from "@/constants";
import { AccountLayout, AuthLayout, StorefrontLayout } from "@/layouts";
import { EN, ROUTES } from "@/locales";
import { AccountHome, Messages, MyEnquiries, MyOrders, Notifications, Profile, Support, Wishlist } from "@/pages/account";
import { ForgotPassword, Login, Register, ResetPassword } from "@/pages/auth";
import { NotFound } from "@/pages/errors";
import { Advertise, AllCategories, Cart, Checkout, CmsPage, Home, Listing, OrderSuccess, PostRequirement, ProductDetail, Report, Sell, StorePage } from "@/pages/storefront";

import { GuestRoute } from "./GuestRoute";
import { ProtectedRoute } from "./ProtectedRoute";
import { AdminShell } from "./AdminShell";
import { SellerShell } from "./SellerShell";

// Seller & admin areas are separate lazy chunks (one per area barrel) — buyers never download them.
const fromSeller = (name) => lazy(() => import("@/pages/seller").then((m) => ({ default: m[name] })));
const fromAdmin = (name) => lazy(() => import("@/pages/admin").then((m) => ({ default: m[name] })));

const S = EN.SELLER;
const A = EN.ADMIN;
const R = ROUTES;

// [path, page component, nav label, icon] — entries without a label are routes only; [null, section] starts a nav group.
const SELLER_PAGES = [
  [null, S.SECTION_OVERVIEW],
  [R.SELLER.DASHBOARD, fromSeller("SellerDashboard"), S.NAV_DASHBOARD, LayoutDashboard],
  [R.SELLER.ANALYTICS, fromSeller("SellerAnalytics"), S.NAV_ANALYTICS, Activity],
  [null, S.SECTION_LEADS],
  [R.SELLER.LEADS, fromSeller("SellerLeads"), S.NAV_LEADS, Inbox],
  [R.SELLER.RFQS, fromSeller("SellerRfqs"), S.NAV_RFQS, ClipboardList],
  [R.SELLER.MESSAGES, fromSeller("SellerMessages"), S.NAV_MESSAGES, MessagesSquare],
  [null, S.SECTION_CATALOGUE],
  [R.SELLER.PRODUCTS, fromSeller("SellerProducts"), S.NAV_PRODUCTS, Boxes],
  [R.SELLER.PRODUCT_NEW, fromSeller("SellerProductForm")],
  [R.SELLER.PRODUCT_EDIT_PATTERN, fromSeller("SellerProductForm")],
  [R.SELLER.INVENTORY, fromSeller("SellerInventory"), S.NAV_INVENTORY, Warehouse],
  [R.SELLER.BULK, fromSeller("SellerBulkUpload"), S.NAV_BULK, FileSpreadsheet],
  [R.SELLER.REVIEWS, fromSeller("SellerReviews"), S.NAV_REVIEWS, MessageSquareText],
  [null, S.SECTION_SALES],
  [R.SELLER.ORDERS, fromSeller("SellerOrders"), S.NAV_ORDERS, Package],
  [R.SELLER.RETURNS, fromSeller("SellerReturns"), S.NAV_RETURNS, Undo2],
  [R.SELLER.CUSTOMERS, fromSeller("SellerCustomers"), S.NAV_CUSTOMERS, UsersRound],
  [R.SELLER.SHIPPING, fromSeller("SellerShipping"), S.NAV_SHIPPING, Truck],
  [R.SELLER.EARNINGS, fromSeller("SellerEarnings"), S.NAV_EARNINGS, BadgeIndianRupee],
  [null, S.SECTION_GROWTH],
  [R.SELLER.ADS, fromSeller("SellerAds"), S.NAV_ADS, Megaphone],
  [R.SELLER.PLAN, fromSeller("SellerPlan"), S.NAV_PLAN, Crown],
  [null, S.SECTION_ACCOUNT],
  [R.SELLER.BUSINESS, fromSeller("SellerBusiness"), S.NAV_BUSINESS, Building2],
  [R.SELLER.STORE, fromSeller("SellerStoreSettings"), S.NAV_STORE, Store],
  [R.SELLER.TEAM, fromSeller("SellerTeam"), S.NAV_TEAM, UserCog],
  [R.SELLER.SUPPORT, fromSeller("SellerSupport"), S.NAV_SUPPORT, LifeBuoy],
];

const ADMIN_PAGES = [
  [null, A.SECTION_OVERVIEW],
  [R.ADMIN.DASHBOARD, fromAdmin("AdminDashboard"), A.NAV_DASHBOARD, LayoutDashboard],
  [R.ADMIN.ANALYTICS, fromAdmin("AdminAnalytics"), A.NAV_ANALYTICS, Activity],
  [null, A.SECTION_COMMERCE],
  [R.ADMIN.ORDERS, fromAdmin("AdminOrders"), A.NAV_ORDERS, ShoppingBag],
  [R.ADMIN.RETURNS, fromAdmin("AdminReturns"), A.NAV_RETURNS, Undo2],
  [R.ADMIN.PRODUCTS, fromAdmin("AdminProducts"), A.NAV_PRODUCTS, Boxes],
  [R.ADMIN.CATEGORIES, fromAdmin("AdminCategories"), A.NAV_CATEGORIES, FolderTree],
  [R.ADMIN.REVIEWS, fromAdmin("AdminReviews"), A.NAV_REVIEWS, MessageSquareText],
  [null, A.SECTION_MARKETPLACE],
  [R.ADMIN.SELLERS, fromAdmin("AdminSellers"), A.NAV_SELLERS, Store],
  [R.ADMIN.VERIFICATION, fromAdmin("AdminVerification"), A.NAV_VERIFICATION, ShieldCheck],
  [R.ADMIN.BUYERS, fromAdmin("AdminBuyers"), A.NAV_BUYERS, Users],
  [R.ADMIN.PRODUCT_REQUESTS, fromAdmin("AdminProductRequests"), A.NAV_PRODUCT_REQUESTS, PackageSearch],
  [R.ADMIN.LEADS, fromAdmin("AdminLeads"), A.NAV_LEADS, ClipboardList],
  [R.ADMIN.PLANS, fromAdmin("AdminPlans"), A.NAV_PLANS, Crown],
  [null, A.SECTION_REVENUE],
  [R.ADMIN.COMMISSIONS, fromAdmin("AdminCommissions"), A.NAV_COMMISSIONS, Percent],
  [R.ADMIN.SETTLEMENTS, fromAdmin("AdminSettlements"), A.NAV_SETTLEMENTS, ReceiptIndianRupee],
  [R.ADMIN.TRANSACTIONS, fromAdmin("AdminTransactions"), A.NAV_TRANSACTIONS, Landmark],
  [R.ADMIN.TAX, fromAdmin("AdminTax"), A.NAV_TAX, ScrollText],
  [R.ADMIN.ADS, fromAdmin("AdminAds"), A.NAV_ADS, Megaphone],
  [null, A.SECTION_ENGAGE],
  [R.ADMIN.SUPPORT, fromAdmin("AdminSupport"), A.NAV_SUPPORT, LifeBuoy],
  [R.ADMIN.BROADCASTS, fromAdmin("AdminBroadcasts"), A.NAV_BROADCASTS, Radio],
  [R.ADMIN.LETTERS, fromAdmin("AdminLetters"), A.NAV_LETTERS, Mail],
  [R.ADMIN.CONTENT, fromAdmin("AdminContent"), A.NAV_CONTENT, FileText],
  [null, A.SECTION_SYSTEM],
  [R.ADMIN.RISK, fromAdmin("AdminRisk"), A.NAV_RISK, ShieldAlert],
  [R.ADMIN.REPORTS, fromAdmin("AdminReports"), A.NAV_REPORTS, BarChart3],
  [R.ADMIN.DOCUMENTS, fromAdmin("AdminDocuments"), A.NAV_DOCUMENTS, Gauge],
  [R.ADMIN.STAFF, fromAdmin("AdminStaff"), A.NAV_STAFF, UserCog],
  [R.ADMIN.AUDIT, fromAdmin("AdminAuditLog"), A.NAV_AUDIT, History],
  [R.ADMIN.SETTINGS, fromAdmin("AdminSettings"), A.NAV_SETTINGS, Settings],
];

// Sidebar: a short list of sections. Related pages live as tabs inside a section (the layout renders the tabs),
// so the sidebar stays ~12 items. { heading } starts a group; items: [{ to, label }] — the first is the landing page.
const sec = (label, icon, items) => ({ icon, items: items.map(([to, tab]) => ({ label: tab, to })), label });
const SELLER_NAV = [
  { heading: S.SECTION_OVERVIEW },
  sec(S.NAV_DASHBOARD, LayoutDashboard, [[R.SELLER.DASHBOARD, S.NAV_DASHBOARD]]),
  sec(S.NAV_ANALYTICS, Activity, [[R.SELLER.ANALYTICS, S.NAV_ANALYTICS]]),
  { heading: S.SECTION_SALES },
  sec(S.NAV_ORDERS, Package, [[R.SELLER.ORDERS, S.NAV_ORDERS], [R.SELLER.RETURNS, S.NAV_RETURNS]]),
  sec(S.NAV_PRODUCTS, Boxes, [[R.SELLER.PRODUCTS, S.NAV_PRODUCTS], [R.SELLER.INVENTORY, S.NAV_INVENTORY], [R.SELLER.BULK, S.NAV_BULK], [R.SELLER.REVIEWS, S.NAV_REVIEWS]]),
  sec(S.NAV_EARNINGS, BadgeIndianRupee, [[R.SELLER.EARNINGS, S.NAV_EARNINGS]]),
  { heading: S.SEC_CUSTOMERS },
  sec(S.NAV_REQUESTS, Inbox, [[R.SELLER.LEADS, S.TAB_ENQUIRIES], [R.SELLER.RFQS, S.NAV_RFQS]]),
  sec(S.NAV_MESSAGES, MessagesSquare, [[R.SELLER.MESSAGES, S.NAV_MESSAGES]]),
  sec(S.NAV_CUSTOMERS, UsersRound, [[R.SELLER.CUSTOMERS, S.NAV_CUSTOMERS]]),
  sec(S.NAV_GROW, Megaphone, [[R.SELLER.ADS, S.NAV_ADS], [R.SELLER.PLAN, S.NAV_PLAN]]),
  { heading: S.SEC_STORE_GROUP },
  sec(S.NAV_MY_STORE, Store, [[R.SELLER.STORE, S.TAB_STORE_PAGE], [R.SELLER.BUSINESS, S.TAB_BUSINESS], [R.SELLER.SHIPPING, S.TAB_DELIVERY], [R.SELLER.TEAM, S.NAV_TEAM]]),
  sec(S.NAV_SUPPORT, LifeBuoy, [[R.SELLER.SUPPORT, S.NAV_SUPPORT]]),
];
const ADMIN_NAV = [
  { heading: A.SECTION_OVERVIEW },
  sec(A.NAV_DASHBOARD, LayoutDashboard, [[R.ADMIN.DASHBOARD, A.NAV_DASHBOARD]]),
  sec(A.NAV_ANALYTICS, Activity, [[R.ADMIN.ANALYTICS, A.NAV_ANALYTICS]]),
  { heading: A.SECTION_OPERATIONS },
  sec(A.NAV_ORDERS, ShoppingBag, [[R.ADMIN.ORDERS, A.NAV_ORDERS], [R.ADMIN.RETURNS, A.NAV_RETURNS]]),
  sec(A.NAV_CATALOGUE, Boxes, [[R.ADMIN.PRODUCTS, A.NAV_PRODUCTS], [R.ADMIN.CATEGORIES, A.NAV_CATEGORIES], [R.ADMIN.REVIEWS, A.NAV_REVIEWS]]),
  sec(A.NAV_SELLERS_GROUP, Store, [[R.ADMIN.SELLERS, A.TAB_SELLER_LIST], [R.ADMIN.VERIFICATION, A.NAV_VERIFICATION], [R.ADMIN.PLANS, A.NAV_PLANS]]),
  sec(A.NAV_CUSTOMERS, Users, [[R.ADMIN.BUYERS, A.NAV_BUYERS], [R.ADMIN.RISK, A.NAV_RISK]]),
  sec(A.NAV_BUYER_REQUESTS, PackageSearch, [[R.ADMIN.PRODUCT_REQUESTS, A.NAV_PRODUCT_REQUESTS], [R.ADMIN.LEADS, A.TAB_ENQUIRIES]]),
  { heading: A.SECTION_REVENUE },
  sec(A.NAV_FINANCE, ReceiptIndianRupee, [[R.ADMIN.SETTLEMENTS, A.NAV_SETTLEMENTS], [R.ADMIN.COMMISSIONS, A.NAV_COMMISSIONS], [R.ADMIN.TRANSACTIONS, A.NAV_TRANSACTIONS], [R.ADMIN.TAX, A.NAV_TAX]]),
  sec(A.NAV_ADS, Megaphone, [[R.ADMIN.ADS, A.NAV_ADS]]),
  { heading: A.SECTION_COMMUNICATION },
  sec(A.NAV_SUPPORT, LifeBuoy, [[R.ADMIN.SUPPORT, A.NAV_SUPPORT]]),
  sec(A.NAV_MESSAGING, Mail, [[R.ADMIN.BROADCASTS, A.NAV_BROADCASTS], [R.ADMIN.LETTERS, A.NAV_LETTERS]]),
  sec(A.NAV_WEBSITE, FileText, [[R.ADMIN.CONTENT, A.NAV_CONTENT]]),
  { heading: A.SECTION_SYSTEM },
  sec(A.NAV_REPORTS_DOCS, BarChart3, [[R.ADMIN.REPORTS, A.NAV_REPORTS], [R.ADMIN.DOCUMENTS, A.NAV_DOCUMENTS]]),
  sec(A.NAV_SETTINGS_GROUP, Settings, [[R.ADMIN.SETTINGS, A.NAV_SETTINGS], [R.ADMIN.STAFF, A.NAV_STAFF], [R.ADMIN.AUDIT, A.NAV_AUDIT]]),
];
const routesOf = (pages) => pages.filter(([path]) => path).map(([path, Page]) => <Route element={<Page />} key={path} path={path} />);

const ACCOUNT_PAGES = [
  [ROUTES.ACCOUNT.HOME, AccountHome], [ROUTES.ACCOUNT.ORDERS, MyOrders], [ROUTES.ACCOUNT.ENQUIRIES, MyEnquiries], [ROUTES.ACCOUNT.MESSAGES, Messages], [ROUTES.ACCOUNT.WISHLIST, Wishlist],
  [ROUTES.ACCOUNT.PROFILE, Profile], [ROUTES.ACCOUNT.SUPPORT, Support], [ROUTES.ACCOUNT.NOTIFICATIONS, Notifications],
];

export function AppRoutes() {
  const { pathname } = useLocation();
  return (
    <>
      <ScrollToTop />
      <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<StorefrontLayout />}>
            <Route element={<Home />} index />
            <Route element={<AllCategories />} path={ROUTES.CATEGORIES} />
            <Route element={<Listing />} path={ROUTES.CATEGORY_PATTERN} />
            <Route element={<Listing />} path={ROUTES.SEARCH_PATTERN} />
            <Route element={<ProductDetail />} path={ROUTES.PRODUCT_PATTERN} />
            <Route element={<StorePage />} path={ROUTES.STORE_PATTERN} />
            <Route element={<Cart />} path={ROUTES.CART} />
            <Route element={<Sell />} path={ROUTES.SELL} />
            <Route element={<Advertise />} path={ROUTES.ADVERTISE} />
            <Route element={<CmsPage />} path={ROUTES.PAGE_PATTERN} />
            <Route element={<PostRequirement />} path={ROUTES.POST_REQUIREMENT} />
            <Route element={<Report />} path={ROUTES.REPORT} />
            <Route element={<ProtectedRoute requiredRoles={[USER_ROLES.BUYER]} />}>
              <Route element={<Checkout />} path={ROUTES.CHECKOUT} />
              <Route element={<OrderSuccess />} path={ROUTES.ORDER_SUCCESS_PATTERN} />
            </Route>
            {/* Customer-only area. Sellers and admins are sent to their own dashboards. */}
            <Route element={<ProtectedRoute requiredRoles={[USER_ROLES.BUYER]} />}>
              <Route element={<AccountLayout />}>
                {ACCOUNT_PAGES.map(([path, Page]) => <Route element={<Page />} key={path} path={path} />)}
              </Route>
            </Route>
            <Route element={<NotFound />} path="*" />
          </Route>

          <Route element={<GuestRoute />}>
            <Route element={<AuthLayout />}>
              <Route element={<Login />} path={ROUTES.LOGIN} />
              <Route element={<Register />} path={ROUTES.REGISTER} />
              <Route element={<ForgotPassword />} path={ROUTES.FORGOT_PASSWORD} />
              <Route element={<ResetPassword />} path={ROUTES.RESET_PASSWORD} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute requiredRoles={[USER_ROLES.SELLER]} />}>
            <Route element={<SellerShell nav={SELLER_NAV} />}>
              {routesOf(SELLER_PAGES)}
            </Route>
          </Route>

          <Route element={<ProtectedRoute requiredRoles={[USER_ROLES.ADMIN]} />}>
            <Route element={<AdminShell nav={ADMIN_NAV} />}>
              {routesOf(ADMIN_PAGES)}
            </Route>
          </Route>
        </Routes>
      </Suspense>
      </ErrorBoundary>
    </>
  );
}
