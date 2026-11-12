// Two-column definition list for detail panels. items: [[label, value], ...]
export function KeyValue({ items }) {
  return (
    <dl className="divide-y divide-line text-sm">
      {items.filter(Boolean).map(([label, value]) => (
        <div className="grid grid-cols-[42%_1fr] gap-3 py-2" key={label}>
          <dt className="text-muted">{label}</dt>
          <dd className="min-w-0 break-words">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
