import { LoaderCircle } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/utils/cn";

const VARIANTS = {
  accent: "bg-accent-500 text-ink hover:bg-accent-400 shadow-sm",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-ink hover:bg-slate-100",
  outline: "border border-line bg-white text-ink hover:border-brand-500 hover:text-brand-700",
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  subtle: "bg-brand-50 text-brand-700 hover:bg-brand-100",
};
const SIZES = { lg: "h-12 px-6 text-base", md: "h-10 px-4 text-sm", sm: "h-8 px-3 text-sm" };

export function Button({ as, children, className, fullWidth, loading, size = "md", to, variant = "primary", ...props }) {
  const classes = cn(
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:shrink-0",
    VARIANTS[variant], SIZES[size], fullWidth && "w-full", className,
  );
  if (to) return <Link className={classes} to={to} {...props}>{children}</Link>;
  const Component = as ?? "button";
  return (
    <Component className={classes} disabled={loading || props.disabled} type={Component === "button" ? props.type ?? "button" : undefined} {...props}>
      {loading && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
      {children}
    </Component>
  );
}
