import { useCallback, useEffect, useState } from "react";

// true once the element has been ≥ threshold visible (used for ad impressions).
// Callback ref, so it also works when the element mounts later (e.g. after a loading skeleton).
export function useInView({ once = true, threshold = 0.5 } = {}) {
  const [node, setNode] = useState(null);
  const [inView, setInView] = useState(false);
  const ref = useCallback((el) => setNode(el), []);
  useEffect(() => {
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        if (once) observer.disconnect();
      } else if (!once) setInView(false);
    }, { threshold });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, once, threshold]);
  return [ref, inView];
}
