import { Eye, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getAdminReviews, setReviewHidden } from "@/api";
import { Badge, Button, PageHeader, PageLoader, Panel, Rating, SearchInput, Tabs } from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { formatDate } from "@/utils/format";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast, successToast } from "@/utils/toast";

const T = EN.ADMIN_TOOLS;

export function AdminReviews() {
  useDocumentTitle(EN.ADMIN.NAV_REVIEWS);
  const { data, loading, setData } = useAsync(getAdminReviews, []);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const rows = useMemo(() => (data ?? []).filter((r) => {
    if (tab === "critical" && r.rating > 2) return false;
    if (tab === "hidden" && !r.hidden) return false;
    return `${r.title} ${r.body} ${r.productName} ${r.author}`.toLowerCase().includes(q.toLowerCase());
  }), [data, tab, q]);
  if (loading) return <PageLoader />;

  const toggle = async (review) => {
    try {
      await setReviewHidden(review.id, !review.hidden);
      setData(data.map((r) => (r.id === review.id ? { ...r, hidden: !r.hidden } : r)));
      successToast(review.hidden ? T.REVIEW_RESTORED : T.REVIEW_HIDDEN);
    } catch (err) { errorToast(getErrorMessage(err)); }
  };

  return (
    <div className="space-y-6">
      <PageHeader subtitle={T.REVIEWS_SUBTITLE} title={EN.ADMIN.NAV_REVIEWS} />
      <Panel>
        <Tabs className="mb-4" onChange={setTab} tabs={[
          { count: data.length, label: EN.COMMON.ALL, value: "all" },
          { count: data.filter((r) => r.rating <= 2).length, label: T.CRITICAL, value: "critical" },
          { count: data.filter((r) => r.hidden).length, label: T.HIDDEN, value: "hidden" },
        ]} value={tab} />
        <SearchInput className="mb-4" onChange={setQ} placeholder={T.SEARCH_REVIEWS} value={q} />
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li className={`flex flex-wrap items-start gap-4 py-4 ${r.hidden ? "opacity-60" : ""}`} key={r.id}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><Rating value={r.rating} /><span className="font-semibold">{r.title}</span>{r.hidden && <Badge tone="danger">{T.HIDDEN}</Badge>}</div>
                <p className="mt-1 text-sm">{r.body}</p>
                <p className="mt-1 text-xs text-muted">{r.author}, {r.city} · {formatDate(r.createdAt)} · <Link className="font-medium text-brand-700 hover:underline" to={ROUTES.PRODUCT(r.productSlug)}>{r.productName}</Link></p>
              </div>
              <Button onClick={() => toggle(r)} size="sm" variant={r.hidden ? "subtle" : "outline"}>
                {r.hidden ? <><Eye className="size-4" />{T.RESTORE}</> : <><EyeOff className="size-4" />{T.HIDE}</>}
              </Button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
