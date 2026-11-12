import { cn } from "@/utils/cn";

export function Skeleton({ className }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-slate-200/80", className)} />;
}
