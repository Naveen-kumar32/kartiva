import { ChevronDown, Download, FileSpreadsheet, FileText, Sheet } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { EN } from "@/locales";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast } from "@/utils/toast";

import { Button } from "../ui";

const D = EN.DOWNLOAD;
const OPTIONS = [["pdf", FileText, D.PDF, D.PDF_HINT], ["xlsx", FileSpreadsheet, D.EXCEL, D.EXCEL_HINT], ["csv", Sheet, D.CSV, D.CSV_HINT]];

// "Download ▾" — PDF (letterhead) / Excel / CSV for any table or report. onExport(format) does the work.
export function ExportMenu({ disabled, label = D.DOWNLOAD, onExport, size = "sm", variant = "outline" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const run = async (format) => {
    setOpen(false);
    setBusy(true);
    try { await onExport(format); } catch (err) { errorToast(getErrorMessage(err)); } finally { setBusy(false); }
  };
  return (
    <div className="relative" ref={ref}>
      <Button aria-expanded={open} aria-haspopup="menu" disabled={disabled} loading={busy} onClick={() => setOpen((o) => !o)} size={size} variant={variant}>
        <Download className="size-4" />{label}<ChevronDown className="size-3.5" />
      </Button>
      {open && (
        <div className="absolute right-0 z-40 mt-1.5 w-60 rounded-xl border border-line bg-white p-1.5 shadow-raised" role="menu">
          {OPTIONS.map(([format, Icon, title, hint]) => (
            <button className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50" key={format} onClick={() => run(format)} role="menuitem" type="button">
              <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-600" />
              <span><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-muted">{hint}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
