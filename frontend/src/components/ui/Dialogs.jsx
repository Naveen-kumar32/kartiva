import { useState } from "react";

import { EN } from "@/locales";

import { Button } from "./Button";
import { FormTextarea } from "./FormTextarea";
import { Modal } from "./Modal";

export function ConfirmDialog({ body, confirmLabel, danger, loading, onCancel, onConfirm, open, title }) {
  return (
    <Modal onClose={onCancel} open={open} title={title}>
      {body && <p className="text-sm text-muted">{body}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onCancel} variant="ghost">{EN.COMMON.CANCEL}</Button>
        <Button loading={loading} onClick={onConfirm} variant={danger ? "danger" : "primary"}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

/** Modal that asks for one text value (reason, UTR, tracking…). Remount with a key to reset. */
export function PromptDialog({ body, confirmLabel, danger, label, loading, multiline = true, onCancel, onConfirm, open, placeholder, required = true, title }) {
  const [value, setValue] = useState("");
  const invalid = required && !value.trim();
  return (
    <Modal onClose={onCancel} open={open} title={title}>
      {body && <p className="mb-3 text-sm text-muted">{body}</p>}
      {multiline ? (
        <FormTextarea label={label} name="prompt" onChange={(e) => setValue(e.target.value)} placeholder={placeholder} rows={3} value={value} />
      ) : (
        <label className="block text-sm font-medium">
          {label}
          <input className="mt-1.5 h-11 w-full rounded-lg border border-line px-3 text-sm focus:border-brand-500 focus:outline-none" onChange={(e) => setValue(e.target.value)} placeholder={placeholder} value={value} />
        </label>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onCancel} variant="ghost">{EN.COMMON.CANCEL}</Button>
        <Button disabled={invalid} loading={loading} onClick={() => onConfirm(value.trim())} variant={danger ? "danger" : "primary"}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
