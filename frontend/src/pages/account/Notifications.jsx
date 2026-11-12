import { Bell, CheckCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { getMyNotifications, markNotificationsRead } from "@/api";
import { Button, Container, EmptyState, ErrorState, PageHeader, PageLoader } from "@/components";
import { useAsync, useAuth, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { cn } from "@/utils/cn";
import { formatDateTime } from "@/utils/format";

const B = EN.BUYER_HUB.NOTIFICATIONS;
const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();

export function Notifications() {
  useDocumentTitle(B.TITLE);
  const { user } = useAuth();
  const { data, error, loading, reload, setData } = useAsync(() => getMyNotifications(user), [user?.email]);
  if (loading) return <PageLoader />;
  if (error) return <Container className="pt-6"><ErrorState message={error} onRetry={reload} /></Container>;
  const unread = data.filter((n) => !n.read).length;
  const groups = [[B.TODAY, data.filter((n) => isToday(n.at))], [B.EARLIER, data.filter((n) => !isToday(n.at))]].filter(([, list]) => list.length);
  const markOne = async (n) => { if (!n.read) setData(await markNotificationsRead(user, n.id)); };

  return (
    <Container className="max-w-3xl space-y-5 pt-6">
      <PageHeader
        actions={unread > 0 && <Button onClick={async () => setData(await markNotificationsRead(user))} size="sm" variant="outline"><CheckCheck className="size-4" />{EN.MARKET.MARK_ALL_READ}</Button>}
        subtitle={B.UNREAD(unread)}
        title={B.TITLE}
      />
      {!data.length && <EmptyState body={B.EMPTY_BODY} icon={Bell} title={EN.MARKET.NO_NOTIFICATIONS} />}
      {groups.map(([label, list]) => (
        <section key={label}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{label}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-white shadow-card">
            {list.map((n) => {
              const body = (
                <>
                  <p className="flex items-center gap-2 font-medium">{!n.read && <span aria-hidden className="size-2 shrink-0 rounded-full bg-brand-600" />}{n.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatDateTime(n.at)}</p>
                </>
              );
              const cls = cn("block px-5 py-4 hover:bg-slate-50", !n.read && "bg-brand-50/50");
              return (
                <li key={n.id}>
                  {n.link ? <Link className={cls} onClick={() => markOne(n)} to={n.link}>{body}</Link> : <button className={cn(cls, "w-full text-left")} onClick={() => markOne(n)} type="button">{body}</button>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </Container>
  );
}
