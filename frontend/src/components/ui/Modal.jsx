import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";

import { EN } from "@/locales";

export function Modal({ children, onClose, open, title }) {
  const panelRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div animate={{ opacity: 1 }} className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" exit={{ opacity: 0 }} initial={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            animate={{ scale: 1, y: 0 }}
            aria-labelledby="modal-title"
            aria-modal="true"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-raised outline-none"
            exit={{ scale: 0.97, y: 8 }}
            initial={{ scale: 0.97, y: 8 }}
            onClick={(e) => e.stopPropagation()}
            ref={panelRef}
            role="dialog"
            tabIndex={-1}
            transition={{ duration: 0.18 }}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold" id="modal-title">{title}</h2>
              {onClose && (
                <button aria-label={EN.COMMON.CLOSE} className="rounded-md p-1 text-muted hover:bg-slate-100" onClick={onClose} type="button">
                  <X className="size-5" />
                </button>
              )}
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
