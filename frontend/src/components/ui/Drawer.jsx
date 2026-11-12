import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";

import { EN } from "@/locales";

export function Drawer({ children, onClose, open, side = "left", size = "sm", title }) {
  const width = { lg: "max-w-2xl", md: "max-w-lg", sm: "max-w-sm" }[size];
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const from = side === "left" ? "-100%" : side === "right" ? "100%" : 0;
  return (
    <AnimatePresence>
      {open && (
        <motion.div animate={{ opacity: 1 }} className="fixed inset-0 z-50 bg-slate-900/50" exit={{ opacity: 0 }} initial={{ opacity: 0 }} onClick={onClose}>
          <motion.aside
            animate={side === "bottom" ? { y: 0 } : { x: 0 }}
            aria-label={title}
            aria-modal="true"
            className={side === "bottom"
              ? "absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white"
              : `absolute inset-y-0 ${side === "left" ? "left-0" : "right-0"} w-[92%] ${width} overflow-y-auto bg-white`}
            exit={side === "bottom" ? { y: "100%" } : { x: from }}
            initial={side === "bottom" ? { y: "100%" } : { x: from }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-4 py-3">
              <h2 className="font-semibold">{title}</h2>
              <button aria-label={EN.COMMON.CLOSE} className="rounded-md p-1 text-muted hover:bg-slate-100" onClick={onClose} type="button">
                <X className="size-5" />
              </button>
            </div>
            {children}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
