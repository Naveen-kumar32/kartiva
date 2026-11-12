import { Check, CircleAlert, MapPin, PackageCheck, Truck } from "lucide-react";

import { EN } from "@/locales";
import { getStore } from "@/utils/catalog";
import { cn } from "@/utils/cn";
import { formatDate, formatDateTime } from "@/utils/format";
import { buildTracking } from "@/utils/tracking";

const T = EN.TRACKING;

// Delivery progress stepper + courier scan history for one shipment (buyer, seller and admin views).
export function ShipmentTracker({ address, sub }) {
  const t = buildTracking(sub, { buyerCity: address?.city, sellerCity: getStore(sub.storeSlug)?.city ?? sub.storeCity });
  const halted = t.cancelled || t.failed;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="font-semibold">
          {t.deliveredAt ? <span className="text-emerald-700">{T.DELIVERED_ON(formatDate(t.deliveredAt))}</span> : halted ? null : T.ARRIVING(formatDate(t.expectedBy))}
        </p>
        {(t.carrier || t.awb) && (
          <p className="text-xs text-muted">{t.carrier && <>{T.CARRIER}: <b className="text-ink">{t.carrier}</b></>}{t.awb && <> · {T.AWB}: <b className="font-mono text-ink">{t.awb}</b></>}</p>
        )}
      </div>

      {halted ? (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800"><CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />{t.cancelled ? T.CANCELLED : T.FAILED}</p>
      ) : (
        <ol aria-label={T.TITLE} className="grid grid-cols-5 gap-1">
          {T.STEPS.map((label, i) => {
            const done = i <= t.step;
            return (
              <li className="relative flex flex-col items-center text-center" key={label}>
                {i > 0 && <span aria-hidden className={cn("absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2", i <= t.step ? "bg-brand-600" : "bg-slate-200")} />}
                <span className={cn("relative z-10 grid size-7 place-items-center rounded-full ring-4 ring-white", done ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500", i === t.step && !t.deliveredAt && "animate-pulse")}>
                  {i === 4 ? <PackageCheck aria-hidden className="size-4" /> : i === 3 ? <Truck aria-hidden className="size-4" /> : done ? <Check aria-hidden className="size-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                </span>
                <span className={cn("mt-1.5 text-[11px] leading-tight sm:text-xs", done ? "font-semibold text-ink" : "text-muted")}>{label}</span>
              </li>
            );
          })}
        </ol>
      )}

      <ol className="relative space-y-3 border-l-2 border-line pl-5">
        {t.events.map((e, i) => (
          <li className="relative" key={`${e.key}-${e.at}`}>
            <span aria-hidden className={cn("absolute -left-[27px] top-1 size-3 rounded-full ring-4 ring-white", i === 0 ? "bg-brand-600" : "bg-slate-300")} />
            <p className={cn("text-sm", i === 0 ? "font-semibold" : "text-ink/80")}>{T.EVENTS[e.key] ?? e.key}</p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <span>{formatDateTime(e.at)}</span>
              {e.location && <span className="flex items-center gap-0.5"><MapPin aria-hidden className="size-3" />{e.location}</span>}
            </p>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-muted">{T.SAMPLE_NOTE}</p>
    </div>
  );
}
