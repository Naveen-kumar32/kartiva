const TYPES = /^image\/(jpeg|png|webp)$/;

/**
 * Shrinks a picked photo in the browser (longest side ≤ maxSide, WebP) and returns a data URL,
 * so uploads stay small. Rejects anything that isn't a JPG/PNG/WebP under maxBytes.
 */
export function compressImage(file, { maxBytes = 5 * 1024 * 1024, maxSide = 1200, quality = 0.8 } = {}) {
  if (!file || !TYPES.test(file.type) || file.size > maxBytes) return Promise.reject(new Error("bad-image"));
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/webp", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad-image")); };
    img.src = url;
  });
}
