import { Navigate, Outlet, useLocation } from "react-router-dom";

import { USER_ROLES } from "@/constants";
import { useAuth } from "@/hooks";
import { getDashboardRouteForRole, safeNextPath } from "@/utils/authRedirect";

// Login/register are guest-only. Once signed in, buyers go back to where they came from
// (e.g. checkout), sellers/admins to their dashboard.
export function GuestRoute() {
  const { isAuthenticated, role } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Outlet />;
  const next = role === USER_ROLES.BUYER ? safeNextPath(location.state?.from) : null;
  return <Navigate replace to={next ?? getDashboardRouteForRole(role)} />;
}
