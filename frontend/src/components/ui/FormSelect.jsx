import { cn } from "@/utils/cn";

import { Select } from "./Select";

// Labelled form dropdown (Formik-friendly: onChange/onBlur receive { target: { name, value } } like a native select).
// options: [{ value, label, group? }]
export function FormSelect({ className, disabled, error, hint, label, name, onBlur, onChange, options, placeholder, searchable, touched, value }) {
  const showError = Boolean(touched && error);
  return (
    <div className={className}>
      {label && <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor={name}>{label}</label>}
      <Select
        disabled={disabled}
        id={name}
        invalid={showError}
        name={name}
        onBlur={() => onBlur?.({ target: { name } })}
        onChange={(v) => onChange?.({ target: { name, value: v === "" ? "" : String(v) } })}
        options={options}
        placeholder={placeholder}
        searchable={searchable}
        value={value}
      />
      {hint && !showError && <p className={cn("mt-1 text-xs text-muted")}>{hint}</p>}
      {showError && <p className="mt-1 text-xs text-red-600" id={`${name}-error`} role="alert">{error}</p>}
    </div>
  );
}
