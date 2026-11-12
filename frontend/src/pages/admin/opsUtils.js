// Non-component helpers shared by the admin growth pages (not part of the pages barrel).
import { useAuth } from "@/hooks";
import { EN } from "@/locales";

const AGO = EN.ADMIN_PRO.COMMON;

// Name of the signed-in admin, used as the audit-log actor.
export function useActor() {
  const { user } = useAuth();
  return user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email : undefined;
}

export function timeAgo(iso) {
  if (!iso) return "—";
  const mins = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return AGO.AGE_M(Math.max(1, Math.round(mins)));
  if (mins < 60 * 48) return AGO.AGE_H(Math.round(mins / 60));
  return AGO.AGE_D(Math.round(mins / 1440));
}
