import { cn } from "@/utils/cn";

// Formik-friendly input: pass name/value/onChange/onBlur plus error & touched.
export function FormInput({ className, error, hint, label, name, touched, ...props }) {
  const showError = Boolean(touched && error);
  const describedBy = showError ? `${name}-error` : hint ? `${name}-hint` : undefined;
  return (
    <div className={className}>
      {label && <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor={name}>{label}</label>}
      <input
        aria-describedby={describedBy}
        aria-invalid={showError}
        className={cn(
          "h-11 w-full rounded-lg border bg-white px-3 text-sm text-ink placeholder:text-slate-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20",
          showError ? "border-red-500" : "border-line",
        )}
        id={name}
        name={name}
        {...props}
      />
      {showError ? (
        <p className="mt-1 text-xs text-red-600" id={`${name}-error`} role="alert">{error}</p>
      ) : hint ? <p className="mt-1 text-xs text-muted" id={`${name}-hint`}>{hint}</p> : null}
    </div>
  );
}
