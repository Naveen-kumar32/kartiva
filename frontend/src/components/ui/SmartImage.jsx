import { ImageOff } from "lucide-react";
import { useState } from "react";

import { cn } from "@/utils/cn";

// Lazy image with a graceful fallback if the URL fails.
export function SmartImage({ alt, className, src, ...props }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return (
      <div className={cn("grid place-items-center bg-slate-100 text-slate-400", className)} role="img" aria-label={alt}>
        <ImageOff aria-hidden className="size-6" />
      </div>
    );
  }
  return <img alt={alt} className={className} decoding="async" loading="lazy" onError={() => setFailed(true)} src={src} {...props} />;
}
