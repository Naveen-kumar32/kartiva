// Part-to-whole as labelled horizontal bars (single hue, values always visible).
export function ShareBars({ items }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex justify-between text-sm"><span>{item.label}</span><span className="font-semibold tabular">{item.share}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[#14a397]" style={{ width: `${item.share}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
