import { TriangleAlert } from "lucide-react";

import { EN } from "@/locales";

import { Button } from "../ui";

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-red-100 bg-red-50/50 px-6 py-12 text-center" role="alert">
      <TriangleAlert aria-hidden className="size-10 text-red-500" />
      <h2 className="mt-3 font-semibold">{EN.ERRORS.TITLE}</h2>
      <p className="mt-1 text-sm text-muted">{message ?? EN.ERRORS.FALLBACK}</p>
      {onRetry && <Button className="mt-5" onClick={onRetry} variant="outline">{EN.ERRORS.RETRY}</Button>}
    </div>
  );
}
