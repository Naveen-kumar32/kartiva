import { useEffect, useRef } from "react";

const EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];

// Calls onIdle after `minutes` without user activity (session management for seller/admin dashboards).
export function useIdleTimeout(onIdle, minutes = 30) {
  const callback = useRef(onIdle);
  useEffect(() => { callback.current = onIdle; }, [onIdle]);
  useEffect(() => {
    let timer;
    let last = 0;
    const reset = () => {
      const now = Date.now();
      if (now - last < 1000) return; // throttle
      last = now;
      clearTimeout(timer);
      timer = setTimeout(() => callback.current(), minutes * 60_000);
    };
    reset();
    EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => { clearTimeout(timer); EVENTS.forEach((e) => window.removeEventListener(e, reset)); };
  }, [minutes]);
}
