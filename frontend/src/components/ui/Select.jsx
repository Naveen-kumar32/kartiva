import { Check, ChevronDown, Search } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { EN } from "@/locales";
import { cn } from "@/utils/cn";

const LIST_MAX = 288; // px — fixed list height; the list scrolls inside it
const GAP = 6;
const same = (a, b) => String(a ?? "") === String(b ?? "");

/**
 * Custom dropdown used for every select in the app (replaces the native <select>, whose OS popup can grow
 * taller than the screen). Fixed max height with inner scrolling, search for long lists, optional groups,
 * keyboard support (↑ ↓ Home End Enter Esc, type to search), opens upwards when there is no room below and
 * follows its trigger while the page scrolls.
 *
 * options: [{ value, label, group?, disabled? }]   onChange(value)   value: current value ("" = placeholder)
 */
export function Select({
  ariaLabel, className, disabled, id, invalid, name, onBlur, onChange, options, placeholder, searchable, size = "md", value,
}) {
  const autoId = useId();
  const triggerId = id ?? `select-${autoId}`;
  const listId = `${triggerId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  const withSearch = searchable ?? options.length > 8;
  const items = useMemo(() => {
    const all = [...(placeholder != null ? [{ isPlaceholder: true, label: placeholder, value: "" }] : []), ...options];
    const q = query.trim().toLowerCase();
    return q ? all.filter((o) => !o.isPlaceholder && `${o.label} ${o.group ?? ""}`.toLowerCase().includes(q)) : all;
  }, [options, placeholder, query]);
  const selected = options.find((o) => same(o.value, value));

  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    // Field scrolled out of view (e.g. under the sticky header) → close instead of floating over the page.
    if (r.bottom < 72 || r.top > window.innerHeight) { setOpen(false); setQuery(""); return; }
    const below = window.innerHeight - r.bottom - GAP - 8;
    const above = r.top - GAP - 8;
    const chrome = withSearch ? 52 : 8;
    const up = below < 220 && above > below;
    const room = Math.max(120, (up ? above : below) - chrome);
    const width = Math.max(r.width, 224);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setPos({ left, listMax: Math.min(LIST_MAX, room), top: up ? undefined : r.bottom + GAP, bottom: up ? window.innerHeight - r.top + GAP : undefined, width });
  }, [withSearch]);

  const close = useCallback((focusTrigger = true) => {
    setOpen(false);
    setQuery("");
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  const openList = () => {
    if (disabled) return;
    const idx = Math.max(0, (placeholder != null ? [{ value: "" }, ...options] : options).findIndex((o) => same(o.value, value)));
    setActive(idx);
    place();
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true); // follow the trigger (also inside scrolling drawers)
    return () => { window.removeEventListener("resize", onMove); window.removeEventListener("scroll", onMove, true); };
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!panelRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) close(false); };
    document.addEventListener("mousedown", onDown);
    (withSearch ? searchRef.current : listRef.current)?.focus({ preventScroll: true });
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close, withSearch]);

  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (item) => {
    if (!item || item.disabled) return;
    if (!same(item.value, value)) onChange?.(item.isPlaceholder ? "" : item.value);
    close();
  };

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(items.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); choose(items[active]); }
    else if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); close(); }
  };

  let lastGroup;
  return (
    <>
      <button
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        className={cn(
          "flex items-center justify-between gap-2 rounded-lg border bg-white text-left text-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60",
          size === "sm" ? "h-9 px-2.5" : "h-11 px-3",
          !/(^|\s)w-/.test(className ?? "") && "w-full", // full width unless the caller sets a width
          invalid ? "border-red-500" : "border-line hover:border-slate-400",
          className,
        )}
        data-value={value ?? ""}
        disabled={disabled}
        id={triggerId}
        name={name}
        onBlur={() => !open && onBlur?.()}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); openList(); } }}
        ref={triggerRef}
        type="button"
      >
        <span className={cn("truncate", !selected && "text-muted")}>{selected?.label ?? placeholder ?? EN.COMMON.SELECT}</span>
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-muted transition", open && "rotate-180")} />
      </button>

      {open && pos && createPortal(
        <div
          className="fixed z-[70] flex flex-col overflow-hidden rounded-xl border border-line bg-white shadow-raised"
          ref={panelRef}
          style={{ bottom: pos.bottom, left: pos.left, top: pos.top, width: pos.width }}
        >
          {withSearch && (
            <div className="relative border-b border-line p-2">
              <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
                aria-controls={listId}
                aria-label={EN.COMMON.SEARCH_OPTIONS}
                className="h-9 w-full rounded-lg border border-line pl-8 pr-2 text-sm focus:border-brand-500 focus:outline-none"
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={onKey}
                placeholder={EN.COMMON.SEARCH_OPTIONS}
                ref={searchRef}
                value={query}
              />
            </div>
          )}
          <ul
            aria-label={ariaLabel}
            className="overflow-y-auto overscroll-contain py-1 outline-none"
            id={listId}
            onKeyDown={withSearch ? undefined : onKey}
            ref={listRef}
            role="listbox"
            style={{ maxHeight: pos.listMax }}
            tabIndex={-1}
          >
            {items.length === 0 && <li className="px-3 py-3 text-sm text-muted">{EN.COMMON.NO_OPTIONS}</li>}
            {items.map((o, i) => {
              const header = o.group && o.group !== lastGroup ? o.group : null;
              lastGroup = o.group;
              const isSel = !o.isPlaceholder && same(o.value, value);
              return (
                <li key={`${o.group ?? ""}-${o.value}-${i}`} role="presentation">
                  {header && <p className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{header}</p>}
                  <div
                    aria-disabled={o.disabled || undefined}
                    aria-selected={isSel}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm",
                      o.group && "pl-5",
                      i === active && "bg-brand-50 text-brand-800",
                      o.isPlaceholder && "text-muted",
                      o.disabled && "cursor-not-allowed opacity-50",
                    )}
                    data-index={i}
                    id={`${listId}-${i}`}
                    onClick={() => choose(o)}
                    onMouseEnter={() => setActive(i)}
                    role="option"
                  >
                    <span className="flex-1">{o.label}</span>
                    {isSel && <Check aria-hidden className="size-4 text-brand-600" />}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}
