import { formatDateTime } from "@/utils/format";

import { StatusBadge } from "./StatusBadge";

// events: [{ status, at, note?, by? }]
export function Timeline({ events }) {
  return (
    <ol className="relative space-y-4 border-l-2 border-line pl-5">
      {events.map((e, i) => (
        <li className="relative" key={`${e.status}-${e.at}-${i}`}>
          <span aria-hidden className={`absolute -left-[27px] top-1 size-3 rounded-full ring-4 ring-white ${i === events.length - 1 ? "bg-brand-600" : "bg-slate-300"}`} />
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={e.status} />
            <span className="text-xs text-muted">{formatDateTime(e.at)}{e.by ? ` · ${e.by}` : ""}</span>
          </div>
          {e.note && <p className="mt-1 text-sm text-ink/80">{e.note}</p>}
        </li>
      ))}
    </ol>
  );
}
