import { useSelector } from "react-redux";

import { selectUser } from "@/store/slices/authSlice";

export function useAuth() {
  const user = useSelector(selectUser);
  return { isAuthenticated: Boolean(user), role: user?.role ?? null, user };
}
