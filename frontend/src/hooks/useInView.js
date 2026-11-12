import { useEffect, useRef, useState } from "react";

// true once the element has been ≥ threshold visible (used for ad impressions).
export function useInView({ once = true, threshold = 0.5 } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        if (once) observer.disconnect();
      } else if (!once) setInView(false);
    }, { threshold });
    observer.observe(node);
    return () => observer.disconnect();
  }, [once, threshold]);
  return [ref, inView];
}
