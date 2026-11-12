import { PackageOpen } from "lucide-react";

import { Button } from "../ui";

export function EmptyState({ actionLabel, actionTo, body, icon: Icon = PackageOpen, onAction, title }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-brand-50 text-brand-600">
        <Icon aria-hidden className="size-8" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      {body && <p className="mt-1 max-w-md text-sm text-muted">{body}</p>}
      {actionLabel && (
        <Button className="mt-6" onClick={onAction} to={actionTo}>{actionLabel}</Button>
      )}
    </div>
  );
}
