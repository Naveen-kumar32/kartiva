import { cn } from "@/utils/cn";

export function FormTextarea({ className, error, label, name, rows = 4, touched, ...props }) {
  const showError = Boolean(touched && error);
  return (
    <div className={className}>
      {label && <label className="mb-1.5 block text-sm font-medium" htmlFor={name}>{label}</label>}
      <textarea
        aria-describedby={showError ? `${name}-error` : undefined}
        aria-invalid={showError}
        className={cn("w-full rounded-lg border bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20", showError ? "border-red-500" : "border-line")}
        id={name}
        name={name}
        rows={rows}
        {...props}
      />
      {showError && <p className="mt-1 text-xs text-red-600" id={`${name}-error`} role="alert">{error}</p>}
    </div>
  );
}
