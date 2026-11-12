import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/hooks";
import { ROUTES } from "@/locales";
import { getDashboardRouteForRole } from "@/utils/authRedirect";

// UX guard only — the backend enforces the real permissions.
export function ProtectedRoute({ requiredRoles }) {
  const { isAuthenticated, role } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate replace state={{ from: location.pathname + location.search }} to={ROUTES.LOGIN} />;
  if (requiredRoles && !requiredRoles.includes(role)) return <Navigate replace to={getDashboardRouteForRole(role)} />;
  return <Outlet />;
}
