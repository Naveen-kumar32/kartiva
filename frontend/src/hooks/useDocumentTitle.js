import { useEffect } from "react";

import { EN } from "@/locales";

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${EN.APP.NAME}` : `${EN.APP.NAME} — ${EN.APP.TAGLINE}`;
  }, [title]);
}
