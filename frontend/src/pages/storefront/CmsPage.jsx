import { FileText, LifeBuoy, SearchX, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { NavLink, useParams } from "react-router-dom";

import { getCmsPage, getCmsPages } from "@/api";
import { Breadcrumbs, Button, Container, EmptyState, PageLoader, RichText } from "@/components";
import { CMS_GROUPS } from "@/data";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { cn } from "@/utils/cn";
import { formatDate } from "@/utils/format";

const B = EN.BUYER_HUB.CMS;
const T = EN.SITE;
const headingsOf = (body = "") => body.split("\n").filter((l) => /^##\s/.test(l.trim())).map((l) => l.trim().slice(3));
const slugId = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// Help centre / policy pages managed by admins. Unknown / unpublished → not found.
export function CmsPage() {
  const { slug } = useParams();
  const { data: page, error, loading } = useAsync(() => getCmsPage(slug), [slug]);
  const { data: pages } = useAsync(getCmsPages, []);
  useDocumentTitle(page?.title ?? (error ? EN.ERRORS.NOT_FOUND_TITLE : undefined));
  if (loading) return <PageLoader />;
  if (error || !page) {
    return (
      <Container className="py-16">
        <EmptyState actionLabel={EN.CART.CONTINUE_SHOPPING} actionTo={ROUTES.HOME} body={B.NOT_FOUND_BODY} icon={SearchX} title={B.NOT_FOUND_TITLE} />
      </Container>
    );
  }
  const group = page.group ?? "about";
  const toc = headingsOf(page.body);

  return (
    <Container className="pt-4 sm:pt-6">
      <Breadcrumbs items={[{ label: EN.COMMON.HOME, to: ROUTES.HOME }, ...(T.GROUPS[group] && T.GROUPS[group] !== page.title ? [{ label: T.GROUPS[group] }] : []), { label: page.title }]} />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr] xl:grid-cols-[240px_1fr_200px]">
        <nav aria-label={B.MORE_PAGES} className="order-last space-y-5 lg:order-none">
          {CMS_GROUPS.map((g) => {
            const items = (pages ?? []).filter((p) => (p.group ?? "about") === g);
            if (!items.length) return null;
            return (
              <div key={g}>
                <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wide text-muted">{T.GROUPS[g]}</p>
                <ul className="space-y-0.5">
                  {items.map((p) => (
                    <li key={p.slug}>
                      <NavLink className={({ isActive }) => cn("block rounded-lg px-3 py-1.5 text-sm hover:bg-white", isActive ? "bg-white font-semibold text-brand-700 shadow-card" : "text-muted hover:text-ink")} to={ROUTES.PAGE(p.slug)}>{p.title}</NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-4">
          <article className="rounded-2xl bg-white p-5 shadow-card sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{T.GROUPS[group]}</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold sm:text-3xl"><FileText aria-hidden className="size-6 shrink-0 text-brand-600" />{page.title}</h1>
            {page.summary && <p className="mt-2 text-muted">{page.summary}</p>}
            <p className="mt-1 text-xs text-muted">{B.UPDATED(formatDate(page.updatedAt))}</p>
            <RichText body={page.body} className="mt-6 max-w-3xl leading-relaxed text-ink/90" />
          </article>
          <Feedback key={slug} />
          <div className="flex flex-col items-start gap-3 rounded-2xl bg-brand-50 p-5 ring-1 ring-brand-100 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 font-medium text-brand-900"><LifeBuoy aria-hidden className="size-5" />{T.CONTACT_CTA}</p>
            <Button to={ROUTES.ACCOUNT.SUPPORT}>{T.CONTACT_SUPPORT}</Button>
          </div>
        </div>

        {toc.length > 2 && (
          <aside className="hidden xl:block">
            <div className="sticky top-32 rounded-2xl bg-white p-4 shadow-card">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{T.IN_THIS_PAGE}</p>
              <ul className="space-y-1 text-sm">
                {toc.map((h) => <li key={h}><a className="block text-muted hover:text-brand-700" href={`#${slugId(h)}`}>{h}</a></li>)}
              </ul>
            </div>
          </aside>
        )}
      </div>
    </Container>
  );
}

function Feedback() {
  const [answer, setAnswer] = useState(null);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm shadow-card">
      {answer ? <p className="font-medium text-emerald-700" role="status">{T.HELPFUL_THANKS}</p> : (
        <>
          <p className="font-medium">{T.HELPFUL}</p>
          <Button onClick={() => setAnswer("yes")} size="sm" variant="outline"><ThumbsUp aria-hidden className="size-4" />{T.HELPFUL_YES}</Button>
          <Button onClick={() => setAnswer("no")} size="sm" variant="outline"><ThumbsDown aria-hidden className="size-4" />{T.HELPFUL_NO}</Button>
        </>
      )}
    </div>
  );
}
