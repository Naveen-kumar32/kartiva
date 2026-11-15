import { useEffect, useState } from "react";

const cache = new Map();

/** Looks at an image's corners: transparent or plain-white corners = a product "cut-out", anything else = a full photo. */
function detect(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const corners = [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]].map(([x, y]) => ctx.getImageData(x, y, 1, 1).data);
        const plain = corners.every(([r, g, b, a]) => a < 200 || (r > 235 && g > 235 && b > 235));
        resolve(plain ? "cutout" : "photo");
      } catch {
        resolve("unknown"); // host doesn't allow reading pixels
      }
    };
    img.onerror = () => resolve("unknown");
    setTimeout(() => resolve("unknown"), 4000); // slow host: don't wait forever
    img.src = src;
  });
}

/** "cutout" | "photo" | "unknown" (couldn't tell) | null (still checking). Results are cached per image URL. */
export function useImageKind(src, enabled = true) {
  const [result, setResult] = useState(null); // { src, kind } of the last finished check
  useEffect(() => {
    if (!enabled || !src || cache.has(src)) return undefined;
    let alive = true;
    detect(src).then((kind) => { cache.set(src, kind); if (alive) setResult({ kind, src }); });
    return () => { alive = false; };
  }, [src, enabled]);
  if (!enabled || !src) return null;
  return cache.get(src) ?? (result?.src === src ? result.kind : null);
}
