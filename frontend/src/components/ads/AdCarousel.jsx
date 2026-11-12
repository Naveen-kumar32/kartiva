import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { EN } from "@/locales";
import { cn } from "@/utils/cn";

import { AdCreative } from "./AdCreative";

export function AdCarousel({ items, rotationSeconds = 5 }) {
  const [[index, direction], setState] = useState([0, 1]);
  const [paused, setPaused] = useState(false);
  const count = items.length;
  const go = useCallback((delta) => setState(([i]) => [(i + delta + count) % count, delta]), [count]);

  useEffect(() => {
    if (paused || count < 2) return undefined;
    const t = setInterval(() => go(1), rotationSeconds * 1000);
    return () => clearInterval(t);
  }, [paused, count, go, rotationSeconds]);

  if (!count) return null;
  return (
    <section
      aria-label={EN.ADS.CAROUSEL_LABEL}
      aria-roledescription="carousel"
      className="group/carousel relative"
      onBlur={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative overflow-hidden rounded-2xl">
        <AnimatePresence custom={direction} initial={false} mode="popLayout">
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            aria-label={`${index + 1} ${EN.COMMON.OF} ${count}`}
            aria-roledescription="slide"
            custom={direction}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            exit={{ opacity: 0, x: direction > 0 ? -80 : 80 }}
            initial={{ opacity: 0, x: direction > 0 ? 80 : -80 }}
            key={items[index].id}
            onDragEnd={(_, info) => { if (Math.abs(info.offset.x) > 60) go(info.offset.x < 0 ? 1 : -1); }}
            role="group"
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <AdCreative ad={items[index]} layout="hero" />
          </motion.div>
        </AnimatePresence>
      </div>

      {count > 1 && (
        <>
          <button aria-label={EN.ADS.PREVIOUS_SLIDE} className="absolute left-3 top-1/2 z-20 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-md transition hover:bg-white sm:grid sm:opacity-0 sm:group-hover/carousel:opacity-100 sm:focus:opacity-100" onClick={() => go(-1)} type="button">
            <ChevronLeft className="size-5" />
          </button>
          <button aria-label={EN.ADS.NEXT_SLIDE} className="absolute right-3 top-1/2 z-20 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-md transition hover:bg-white sm:grid sm:opacity-0 sm:group-hover/carousel:opacity-100 sm:focus:opacity-100" onClick={() => go(1)} type="button">
            <ChevronRight className="size-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
            {items.map((ad, i) => (
              <button
                aria-current={i === index}
                aria-label={EN.ADS.SLIDE(i + 1)}
                className={cn("h-2 rounded-full transition-all", i === index ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80")}
                key={ad.id}
                onClick={() => setState(([cur]) => [i, i > cur ? 1 : -1])}
                type="button"
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
