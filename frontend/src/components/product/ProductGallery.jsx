import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import { EN } from "@/locales";
import { cn } from "@/utils/cn";

import { SmartImage } from "../ui";

export function ProductGallery({ images, name }) {
  // Parent remounts this with a new `key` per product, so state resets without an effect.
  const [active, setActive] = useState(0);
  return (
    <div className="flex flex-col-reverse gap-3 md:flex-row">
      <div className="scrollbar-none flex gap-2 overflow-x-auto md:flex-col">
        {images.map((src, i) => (
          <button
            aria-label={EN.COMMON.IMAGE_N(i + 1)}
            aria-pressed={i === active}
            className={cn("size-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white", i === active ? "border-brand-600" : "border-line hover:border-brand-300")}
            key={src}
            onClick={() => setActive(i)}
            onMouseEnter={() => setActive(i)}
            type="button"
          >
            <SmartImage alt="" className="size-full object-contain p-1" src={src} />
          </button>
        ))}
      </div>
      <div className="relative aspect-square flex-1 overflow-hidden rounded-2xl bg-white shadow-card">
        <AnimatePresence initial={false} mode="wait">
          <motion.div animate={{ opacity: 1 }} className="size-full" exit={{ opacity: 0 }} initial={{ opacity: 0 }} key={images[active]} transition={{ duration: 0.15 }}>
            <SmartImage alt={name} className="size-full object-contain p-6" loading="eager" src={images[active]} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
