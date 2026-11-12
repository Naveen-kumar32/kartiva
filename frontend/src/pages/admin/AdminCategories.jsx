import { useFormik } from "formik";
import { ArrowDown, ArrowUp, ChevronRight, FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { deleteCategory, getAdminCategories, moveCategory, saveCategory, setCategoryActive } from "@/api";
import {
  Button, ConfirmDialog, EmptyState, ErrorState, FormInput, FormSelect, FormTextarea, Modal, PageHeader, PageLoader, Panel, SearchInput, Toggle,
} from "@/components";
import { PLATFORM } from "@/data";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { cn, errorToast, getErrorMessage, successToast } from "@/utils";
import { createCategorySchema } from "@/validators";

import { IconAction, SrHeader } from "./opsShared";

const O = EN.ADMIN_OPS;

export function AdminCategories() {
  useDocumentTitle(O.CATEGORIES_TITLE);
  const { data, error, loading, reload, setData } = useAsync(getAdminCategories, []);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState({});
  const [form, setForm] = useState(null); // { category?, parentId? }
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => setData(await getAdminCategories());
  const act = async (fn, message) => {
    try {
      await fn();
      if (message) successToast(message);
      await refresh();
    } catch (err) {
      errorToast(getErrorMessage(err));
    }
  };

  const tree = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    const match = (c) => !term || c.name.toLowerCase().includes(term) || c.slug.includes(term);
    return data.filter((c) => !c.parentId).map((root) => {
      const children = data.filter((c) => c.parentId === root.id);
      const shown = match(root) ? children : children.filter(match);
      return { children: shown, productCount: children.reduce((t, c) => t + c.productCount, root.productCount), root, visible: match(root) || shown.length > 0 };
    }).filter((n) => n.visible);
  }, [data, q]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const roots = data.filter((c) => !c.parentId);
  const isOpen = (id) => Boolean(q.trim()) || expanded[id];

  return (
    <div className="space-y-6">
      <PageHeader
        actions={<Button onClick={() => setForm({})}><Plus className="size-4" />{O.NEW_CATEGORY}</Button>}
        subtitle={O.CATEGORIES_SUBTITLE}
        title={O.CATEGORIES_TITLE}
      />
      <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">{O.CATEGORIES_HINT}</p>
      <Panel>
        <SearchInput className="mb-4 max-w-sm" onChange={setQ} placeholder={O.SEARCH_CATEGORIES} value={q} />
        {tree.length === 0 ? <EmptyState title={O.NO_RESULTS} /> : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-y border-line bg-slate-50 text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-2.5" scope="col">{O.COL_CATEGORY}</th>
                  <th className="px-3 py-2.5 text-right" scope="col">{O.COL_PRODUCTS}</th>
                  <th className="px-3 py-2.5" scope="col">{O.COL_TAX_DEFAULTS}</th>
                  <th className="px-3 py-2.5" scope="col">{O.COL_RETURN_WINDOW}</th>
                  <th className="px-3 py-2.5" scope="col">{O.COL_VISIBLE}</th>
                  <th className="px-5 py-2.5 text-right" scope="col"><SrHeader>{O.COL_ACTIONS}</SrHeader></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tree.map(({ children, productCount, root }, ri) => (
                  <CategoryRows
                    childrenRows={children}
                    isFirst={ri === 0}
                    isLast={ri === roots.length - 1}
                    key={root.id}
                    onAddChild={() => setForm({ parentId: root.id })}
                    onDelete={setToDelete}
                    onEdit={(category) => setForm({ category })}
                    onMove={(c, dir) => act(() => moveCategory(c.id, dir))}
                    onToggle={(c, v) => act(() => setCategoryActive(c.id, v), v ? O.SHOWN_TOAST(c.name) : O.HIDDEN_TOAST(c.name))}
                    onToggleOpen={() => setExpanded((e) => ({ ...e, [root.id]: !e[root.id] }))}
                    open={isOpen(root.id)}
                    productCount={productCount}
                    root={root}
                    siblingsOf={(c) => data.filter((x) => x.parentId === c.parentId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {form && (
        <CategoryForm
          category={form.category}
          defaultParentId={form.parentId}
          key={form.category?.id ?? `new-${form.parentId ?? "root"}`}
          onClose={() => setForm(null)}
          onSaved={async (name, isNew) => { setForm(null); successToast(isNew ? O.CATEGORY_CREATED(name) : O.CATEGORY_SAVED(name)); await refresh(); }}
          roots={roots}
        />
      )}

      <ConfirmDialog
        body={toDelete ? O.DELETE_CATEGORY_BODY(toDelete.name) : ""}
        confirmLabel={O.DELETE}
        danger
        loading={busy}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          setBusy(true);
          await act(() => deleteCategory(toDelete.id), O.CATEGORY_DELETED(toDelete.name));
          setBusy(false);
          setToDelete(null);
        }}
        open={Boolean(toDelete)}
        title={O.DELETE_CATEGORY}
      />
    </div>
  );
}

function CategoryRows({ childrenRows, isFirst, isLast, onAddChild, onDelete, onEdit, onMove, onToggle, onToggleOpen, open, productCount, root, siblingsOf }) {
  return (
    <>
      <CategoryRow
        category={root}
        canDown={!isLast}
        canUp={!isFirst}
        expander={(
          <button aria-expanded={open} aria-label={open ? O.COLLAPSE(root.name) : O.EXPAND(root.name)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-slate-100" onClick={onToggleOpen} type="button">
            <ChevronRight className={cn("size-4 transition", open && "rotate-90")} />
          </button>
        )}
        extraAction={<IconAction icon={FolderPlus} label={O.ADD_SUBCATEGORY(root.name)} onClick={onAddChild} />}
        onDelete={onDelete}
        onEdit={onEdit}
        onMove={onMove}
        onToggle={onToggle}
        productCount={productCount}
        subCount={childrenRows.length}
      />
      {open && childrenRows.map((c) => {
        const siblings = siblingsOf(c);
        const idx = siblings.findIndex((s) => s.id === c.id);
        return (
          <CategoryRow
            canDown={idx < siblings.length - 1}
            canUp={idx > 0}
            category={c}
            child
            key={c.id}
            onDelete={onDelete}
            onEdit={onEdit}
            onMove={onMove}
            onToggle={onToggle}
            parentHidden={root.isActive === false}
            productCount={c.productCount}
          />
        );
      })}
    </>
  );
}

function CategoryRow({ canDown, canUp, category: c, child, expander, extraAction, onDelete, onEdit, onMove, onToggle, parentHidden, productCount, subCount }) {
  return (
    <tr className={cn("hover:bg-slate-50/70", child && "bg-slate-50/40", c.isActive === false && "text-muted")}>
      <td className="px-5 py-2.5">
        <div className={cn("flex items-center gap-2", child && "pl-9")}>
          {expander}
          <div className="min-w-0">
            <p className="font-medium text-ink">{c.name}{subCount != null && <span className="ml-2 text-xs font-normal text-muted">{O.SUBCATEGORY_COUNT(subCount)}</span>}{c.showInNav && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200">{O.IN_TOP_MENU}</span>}</p>
            <p className="font-mono text-xs text-muted">/{c.slug}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right tabular">{productCount}</td>
      <td className="px-3 py-2.5 text-xs">
        {c.defaultHsn || c.defaultGstRate != null ? <>HSN {c.defaultHsn ?? "—"} · GST {c.defaultGstRate ?? "—"}%</> : <span className="text-muted">—</span>}
      </td>
      <td className="px-3 py-2.5 text-xs">{c.returnWindowDays != null ? O.DAYS(c.returnWindowDays) : <span className="text-muted">{O.PLATFORM_DEFAULT}</span>}</td>
      <td className="px-3 py-2.5">
        <Toggle checked={c.isActive !== false} disabled={parentHidden} label={O.TOGGLE_VISIBLE(c.name)} onChange={(v) => onToggle(c, v)} />
      </td>
      <td className="px-5 py-2.5">
        <div className="flex justify-end gap-0.5">
          <IconAction disabled={!canUp} icon={ArrowUp} label={O.MOVE_UP(c.name)} onClick={() => onMove(c, -1)} />
          <IconAction disabled={!canDown} icon={ArrowDown} label={O.MOVE_DOWN(c.name)} onClick={() => onMove(c, 1)} />
          {extraAction}
          <IconAction icon={Pencil} label={O.EDIT_ITEM(c.name)} onClick={() => onEdit(c)} />
          <IconAction danger icon={Trash2} label={O.DELETE_ITEM(c.name)} onClick={() => onDelete(c)} />
        </div>
      </td>
    </tr>
  );
}

function CategoryForm({ category, defaultParentId, onClose, onSaved, roots }) {
  const isNew = !category;
  const formik = useFormik({
    initialValues: {
      defaultGstRate: category?.defaultGstRate ?? "", defaultHsn: category?.defaultHsn ?? "", description: category?.description ?? "",
      name: category?.name ?? "", parentId: category?.parentId ?? defaultParentId ?? "", returnWindowDays: category?.returnWindowDays ?? "",
      shortName: category?.shortName ?? "", showInNav: Boolean(category?.showInNav),
    },
    onSubmit: async (values) => {
      try {
        await saveCategory({ ...category, ...values, id: category?.id });
        await onSaved(values.name.trim(), isNew);
      } catch (err) {
        errorToast(getErrorMessage(err));
      }
    },
    validationSchema: createCategorySchema({ ...EN.VALIDATION, ...O.VALIDATION }),
  });
  const { errors, handleBlur, handleChange, handleSubmit, isSubmitting, setFieldValue, touched, values } = formik;
  const field = (name, label, props = {}) => (
    <FormInput error={errors[name]} label={label} name={name} onBlur={handleBlur} onChange={handleChange} touched={touched[name]} value={values[name]} {...props} />
  );
  const parentOptions = roots.filter((r) => r.id !== category?.id).map((r) => ({ label: r.name, value: r.id }));

  return (
    <Modal onClose={onClose} open title={isNew ? O.NEW_CATEGORY : O.EDIT_CATEGORY}>
      <form className="space-y-4" noValidate onSubmit={handleSubmit}>
        {field("name", O.FIELD_NAME, { autoFocus: true })}
        <FormSelect
          label={O.FIELD_PARENT}
          name="parentId"
          onBlur={handleBlur}
          onChange={handleChange}
          options={parentOptions}
          placeholder={O.TOP_LEVEL}
          value={values.parentId}
        />
        {!values.parentId && (
          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-medium">{O.SHOW_IN_NAV}</p><p className="text-xs text-muted">{O.SHOW_IN_NAV_HINT}</p></div>
              <Toggle checked={values.showInNav} label={O.SHOW_IN_NAV} onChange={(v) => setFieldValue("showInNav", v)} />
            </div>
            {values.showInNav && field("shortName", O.FIELD_SHORT_NAME, { hint: O.FIELD_SHORT_NAME_HINT, maxLength: 24 })}
          </div>
        )}
        <FormTextarea label={O.FIELD_DESCRIPTION} name="description" onBlur={handleBlur} onChange={handleChange} rows={2} value={values.description} />
        <div className="grid gap-4 sm:grid-cols-3">
          {field("defaultHsn", O.FIELD_HSN, { inputMode: "numeric", maxLength: 8 })}
          <FormSelect
            label={O.FIELD_GST}
            name="defaultGstRate"
            onChange={handleChange}
            options={PLATFORM.gstRateChoices.map((r) => ({ label: `${r}%`, value: r }))}
            placeholder="—"
            value={values.defaultGstRate}
          />
          {field("returnWindowDays", O.FIELD_RETURN_WINDOW, { hint: O.FIELD_RETURN_WINDOW_HINT, inputMode: "numeric", type: "number" })}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} variant="ghost">{EN.COMMON.CANCEL}</Button>
          <Button loading={isSubmitting} type="submit">{isNew ? O.CREATE : EN.COMMON.SAVE}</Button>
        </div>
      </form>
    </Modal>
  );
}
