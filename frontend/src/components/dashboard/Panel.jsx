export function Panel({ action, children, className = "", title }) {
  return (
    <section className={`rounded-2xl bg-white p-5 shadow-card ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
