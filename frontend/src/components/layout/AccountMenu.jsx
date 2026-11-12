import { ChevronDown, Heart, LayoutDashboard, LayoutGrid, LifeBuoy, LogOut, MessageSquareQuote, MessagesSquare, Package, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { Link, useNavigate } from "react-router-dom";

import { getUnreadMessageCount, logout } from "@/api";
import { USER_ROLES } from "@/constants";
import { useAuth } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { clearCredentials } from "@/store/slices/authSlice";
import { infoToast } from "@/utils/toast";

const N = EN.BUYER_HUB.NAV;

export function AccountMenu() {
  const { isAuthenticated, role, user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!open || !user) return undefined;
    let alive = true;
    getUnreadMessageCount(user).then((n) => alive && setUnread(n));
    return () => { alive = false; };
  }, [open, user]);

  if (!isAuthenticated) {
    return (
      <Link className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-white hover:bg-white/10" to={ROUTES.LOGIN}>
        <User aria-hidden className="size-5" />
        <span className="hidden text-left leading-tight lg:block">
          <span className="block text-[11px] text-white/75">{EN.NAV.HELLO_GUEST}</span>
          <span className="block text-sm font-semibold">{EN.NAV.ACCOUNT_ORDERS}</span>
        </span>
      </Link>
    );
  }

  const signOut = async () => {
    await logout();
    dispatch(clearCredentials());
    infoToast(EN.AUTH.LOGGED_OUT);
    navigate(ROUTES.HOME);
  };

  return (
    <div className="relative" ref={ref}>
      <button aria-expanded={open} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-white hover:bg-white/10" onClick={() => setOpen((v) => !v)} type="button">
        <span className="grid size-7 place-items-center rounded-full bg-accent-500 text-xs font-bold text-ink">{user.firstName[0]}</span>
        <span className="hidden text-left leading-tight lg:block">
          <span className="block text-[11px] text-white/75">{EN.NAV.HELLO(user.firstName)}</span>
          <span className="flex items-center gap-1 text-sm font-semibold">{EN.NAV.ACCOUNT} <ChevronDown aria-hidden className="size-3.5" /></span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-xl border border-line bg-white p-1.5 text-ink shadow-raised" role="menu">
          {role === USER_ROLES.SELLER && <MenuLink icon={LayoutDashboard} label={EN.NAV.SELLER_DASHBOARD} onClick={() => setOpen(false)} to={ROUTES.SELLER.DASHBOARD} />}
          {role === USER_ROLES.ADMIN && <MenuLink icon={LayoutDashboard} label={EN.NAV.ADMIN_PANEL} onClick={() => setOpen(false)} to={ROUTES.ADMIN.DASHBOARD} />}
          {role === USER_ROLES.BUYER && (
            <>
              <MenuLink icon={LayoutGrid} label={EN.NAV.MY_ACCOUNT} onClick={() => setOpen(false)} to={ROUTES.ACCOUNT.HOME} />
              <MenuLink icon={Package} label={EN.NAV.MY_ORDERS} onClick={() => setOpen(false)} to={ROUTES.ACCOUNT.ORDERS} />
              <MenuLink icon={MessageSquareQuote} label={N.ENQUIRIES} onClick={() => setOpen(false)} to={ROUTES.ACCOUNT.ENQUIRIES} />
              <MenuLink badge={unread} icon={MessagesSquare} label={N.MESSAGES} onClick={() => setOpen(false)} to={ROUTES.ACCOUNT.MESSAGES} />
              <MenuLink icon={Heart} label={N.WISHLIST} onClick={() => setOpen(false)} to={ROUTES.ACCOUNT.WISHLIST} />
              <MenuLink icon={LifeBuoy} label={N.SUPPORT} onClick={() => setOpen(false)} to={ROUTES.ACCOUNT.SUPPORT} />
            </>
          )}
          <hr className="my-1 border-line" />
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50" onClick={signOut} role="menuitem" type="button">
            <LogOut aria-hidden className="size-4 text-muted" /> {EN.AUTH.LOGOUT}
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({ badge = 0, icon: Icon, label, onClick, to }) {
  return (
    <Link className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50" onClick={onClick} role="menuitem" to={to}>
      <Icon aria-hidden className="size-4 text-muted" /> <span className="flex-1">{label}</span>
      {badge > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-5 text-white tabular">{badge}</span>}
    </Link>
  );
}
