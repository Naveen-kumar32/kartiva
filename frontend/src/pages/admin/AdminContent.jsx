import { useFormik } from "formik";
import { ExternalLink, FilePlus2, FileText, Megaphone, Pencil } from "lucide-react";
import { useState } from "react";

import { getAdminContent, saveAnnouncement, saveCmsPage, saveHomeSections, setCmsPublished } from "@/api";
import {
  Button, DataTable, Drawer, ErrorState, FormInput, FormTextarea, PageHeader, PageLoader, Panel, RichText, Tabs, Toggle,
} from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { errorToast, formatDateTime, getErrorMessage, infoToast, successToast } from "@/utils";
import { createCmsPageSchema } from "@/validators";

import { Pill, SrHeader } from "./opsShared";
import { useActor } from "./opsUtils";

const P = EN.ADMIN_PRO.CONTENT;
const C = EN.ADMIN_PRO.COMMON;
const SECTIONS = ["heroCarousel", "sponsoredRow", "featuredStores", "buyRequestBanner"];
const kebab = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function AdminContent() {
  useDocumentTitle(P.TITLE);
  const actor = useActor();
  const { data, error, loading, reload, setData } = useAsync(getAdminContent, []);
  const [tab, setTab] = useState("pages");
  const [editing, setEditing] = useState(null);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const refresh = async () => setData(await getAdminContent());

  return (
    <div className="space-y-6">
      <PageHeader actions={tab === "pages" && <Button onClick={() => setEditing({})}><FilePlus2 className="size-4" />{P.NEW_PAGE}</Button>} subtitle={P.SUBTITLE} title={P.TITLE} />
      <Panel>
        <Tabs onChange={setTab} tabs={[{ count: data.pages.length, label: P.TAB_PAGES, value: "pages" }, { label: P.TAB_ANNOUNCEMENT, value: "announcement" }, { label: P.TAB_HOME, value: "home" }]} value={tab} />
        <div className="mt-4">
          {tab === "pages" && (
            <DataTable
              columns={[
                { header: P.COL_TITLE, key: "title", render: (p) => <button className="text-left font-medium hover:text-brand-700" onClick={() => setEditing(p)} type="button">{p.title}</button> },
                { header: P.COL_URL, key: "slug", render: (p) => <span className="font-mono text-xs">{ROUTES.PAGE(p.slug)}</span> },
                { header: C.STATUS, key: "published", render: (p) => (
                  <span className="flex items-center gap-2">
                    <Toggle checked={p.published} label={P.PUBLISH_TOGGLE(p.title)} onChange={async (on) => { try { await setCmsPublished(p.id, on, actor); await refresh(); infoToast(on ? P.PUBLISHED_TOAST(p.title) : P.UNPUBLISHED_TOAST(p.title)); } catch (err) { errorToast(getErrorMessage(err)); } }} />
                    <Pill tone={p.published ? "success" : "neutral"}>{p.published ? P.PUBLISHED : P.DRAFT}</Pill>
                  </span>
                ) },
                { header: P.COL_UPDATED, key: "updatedAt", render: (p) => <span className="text-xs text-muted">{formatDateTime(p.updatedAt)}{p.updatedBy ? ` · ${p.updatedBy}` : ""}</span> },
                { header: <SrHeader>{C.ACTIONS}</SrHeader>, key: "actions", render: (p) => (
                  <span className="flex justify-end gap-1">
                    <Button onClick={() => setEditing(p)} size="sm" variant="outline"><Pencil className="size-4" />{P.EDIT}</Button>
                    {p.published && <Button aria-label={P.OPEN_PAGE(p.title)} size="sm" target="_blank" title={P.OPEN_PAGE(p.title)} to={ROUTES.PAGE(p.slug)} variant="ghost"><ExternalLink className="size-4" /></Button>}
                  </span>
                ) },
              ]}
              rows={data.pages}
            />
          )}
          {tab === "announcement" && <AnnouncementEditor actor={actor} initial={data.announcement} onSaved={refresh} />}
          {tab === "home" && <HomeSections actor={actor} initial={data.homeSections} onSaved={refresh} />}
        </div>
      </Panel>

      <Drawer onClose={() => setEditing(null)} open={Boolean(editing)} side="right" size="lg" title={editing?.id ? P.EDIT_TITLE(editing.title) : P.NEW_PAGE}>
        {editing && <PageEditor actor={actor} key={editing.id ?? "new"} onSaved={async () => { await refresh(); setEditing(null); }} page={editing} taken={data.pages.filter((p) => p.id !== editing.id).map((p) => p.slug)} />}
      </Drawer>
    </div>
  );
}

function Preview({ body, title }) {
  return (
    <article className="rounded-xl border border-line bg-white p-5">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{P.PREVIEW}</p>
      <h1 className="text-xl font-bold">{title || P.UNTITLED}</h1>
      <RichText body={body || ""} className="mt-3 text-sm leading-relaxed text-ink/90" compact />
    </article>
  );
}

function PageEditor({ actor, onSaved, page, taken }) {
  const formik = useFormik({
    initialValues: { body: page.body ?? "", published: page.published ?? false, slug: page.slug ?? "", title: page.title ?? "" },
    onSubmit: async (values) => {
      try {
        await saveCmsPage({ ...values, id: page.id }, actor);
        successToast(P.SAVED(values.title));
        await onSaved();
      } catch (err) {
        errorToast(getErrorMessage(err));
      }
    },
    validationSchema: createCmsPageSchema(EN.VALIDATION, P.VALIDATION, taken),
  });
  const field = (name) => ({ error: formik.errors[name], name, onBlur: formik.handleBlur, onChange: formik.handleChange, touched: formik.touched[name], value: formik.values[name] });
  return (
    <form className="space-y-4 p-4" noValidate onSubmit={formik.handleSubmit}>
      <FormInput label={P.F_TITLE} {...field("title")} onChange={(e) => { formik.handleChange(e); if (!page.id && !formik.touched.slug) formik.setFieldValue("slug", kebab(e.target.value)); }} />
      <FormInput hint={P.F_SLUG_HINT(ROUTES.PAGE(formik.values.slug || "…"))} label={P.F_SLUG} {...field("slug")} />
      <FormTextarea label={P.F_BODY} rows={10} {...field("body")} />
      <label className="flex items-center gap-3 text-sm"><Toggle checked={formik.values.published} label={P.F_PUBLISHED} onChange={(v) => formik.setFieldValue("published", v)} />{P.F_PUBLISHED}</label>
      <Preview body={formik.values.body} title={formik.values.title} />
      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-line bg-white px-4 py-3">
        <Button loading={formik.isSubmitting} type="submit">{C.SAVE}</Button>
      </div>
    </form>
  );
}

function AnnouncementEditor({ actor, initial, onSaved }) {
  const [value, setValue] = useState({ active: Boolean(initial?.active), link: initial?.link ?? "", text: initial?.text ?? "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await saveAnnouncement(value, actor);
      await onSaved();
      successToast(P.ANNOUNCEMENT_SAVED);
    } catch (err) {
      errorToast(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <label className="flex items-center gap-3 text-sm font-medium"><Toggle checked={value.active} label={P.A_ACTIVE} onChange={(v) => setValue((x) => ({ ...x, active: v }))} />{P.A_ACTIVE}</label>
        <FormTextarea label={P.A_TEXT} maxLength={160} name="a-text" onChange={(e) => setValue((x) => ({ ...x, text: e.target.value }))} rows={3} value={value.text} />
        <p className="-mt-3 text-right text-xs text-muted">{P.CHARS(value.text.length, 160)}</p>
        <FormInput hint={P.A_LINK_HINT} label={P.A_LINK} name="a-link" onChange={(e) => setValue((x) => ({ ...x, link: e.target.value }))} placeholder="/post-requirement" value={value.link} />
        <Button loading={busy} onClick={save}>{C.SAVE}</Button>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{P.PREVIEW}</p>
        <div className="overflow-hidden rounded-xl border border-line">
          {value.active && value.text.trim() ? (
            <div className="flex items-center justify-center gap-2 bg-brand-800 px-4 py-2 text-center text-sm text-white">
              <Megaphone aria-hidden className="size-4 shrink-0 text-accent-400" /><span>{value.text}</span>{value.link && <span className="font-semibold underline">{P.LEARN_MORE}</span>}
            </div>
          ) : <p className="bg-slate-50 px-4 py-2 text-center text-xs text-muted">{P.A_HIDDEN}</p>}
          <div className="h-24 bg-slate-50 p-4"><div className="h-3 w-1/3 rounded bg-slate-200" /><div className="mt-3 h-10 rounded bg-slate-200" /></div>
        </div>
      </div>
    </div>
  );
}

function HomeSections({ actor, initial, onSaved }) {
  const [busy, setBusy] = useState(null);
  return (
    <div>
      <p className="mb-4 text-sm text-muted">{P.HOME_NOTE}</p>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {SECTIONS.map((k) => (
          <li className="flex items-center justify-between gap-4 p-4" key={k}>
            <span className="flex items-start gap-3"><FileText aria-hidden className="mt-0.5 size-5 text-muted" /><span><span className="block font-medium">{P.SECTION[k]}</span><span className="text-xs text-muted">{P.SECTION_HINT[k]}</span></span></span>
            <Toggle checked={initial[k] !== false} disabled={busy === k} label={P.SECTION[k]} onChange={async (on) => {
              setBusy(k);
              try {
                await saveHomeSections({ ...initial, [k]: on }, actor);
                await onSaved();
                infoToast(on ? P.SECTION_ON(P.SECTION[k]) : P.SECTION_OFF(P.SECTION[k]));
              } catch (err) {
                errorToast(getErrorMessage(err));
              } finally {
                setBusy(null);
              }
            }} />
          </li>
        ))}
      </ul>
    </div>
  );
}
