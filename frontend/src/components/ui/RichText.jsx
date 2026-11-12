import { Info } from "lucide-react";
import { Fragment } from "react";
import { Link } from "react-router-dom";

// Tiny, safe renderer for admin-editable page content (no HTML injection):
// "## h2", "### h3", "- bullet", "1. step", "> callout", "**bold**", "[text](/internal-path or https://…)".
const INLINE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;

function inline(text) {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong className="font-semibold text-ink" key={i}>{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const [, label, href] = link;
      const cls = "font-medium text-brand-700 underline-offset-2 hover:underline";
      if (href.startsWith("/")) return <Link className={cls} key={i} to={href}>{label}</Link>;
      if (/^https:\/\//.test(href)) return <a className={cls} href={href} key={i} rel="noopener noreferrer" target="_blank">{label}</a>;
      return label; // anything else (javascript:, data:, …) is shown as plain text
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

const slugId = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function parseBlocks(body = "") {
  const blocks = [];
  body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean).forEach((chunk) => {
    const lines = chunk.split("\n");
    let list = null;
    let para = [];
    const flush = () => { if (para.length) blocks.push({ text: para.join(" "), type: "p" }); para = []; };
    lines.forEach((raw) => {
      const line = raw.trim();
      const h = line.match(/^(#{2,3})\s+(.*)$/);
      const ul = line.match(/^[-•]\s+(.*)$/);
      const ol = line.match(/^\d+\.\s+(.*)$/);
      if (h) { flush(); list = null; blocks.push({ id: slugId(h[2]), text: h[2], type: h[1].length === 2 ? "h2" : "h3" }); }
      else if (line.startsWith("> ")) { flush(); list = null; blocks.push({ text: line.slice(2), type: "note" }); }
      else if (ul || ol) {
        flush();
        const type = ul ? "ul" : "ol";
        if (!list || list.type !== type) { list = { items: [], type }; blocks.push(list); }
        list.items.push((ul ?? ol)[1]);
      } else { list = null; para.push(line); }
    });
    flush();
  });
  return blocks;
}

export function RichText({ body, className, compact = false }) {
  return (
    <div className={className}>
      {parseBlocks(body).map((b, i) => {
        if (b.type === "h2") return <h2 className={compact ? "mt-5 text-base font-bold" : "mt-8 scroll-mt-28 text-xl font-bold first:mt-0"} id={b.id} key={i}>{inline(b.text)}</h2>;
        if (b.type === "h3") return <h3 className="mt-5 font-semibold" key={i}>{inline(b.text)}</h3>;
        if (b.type === "note") return <p className="mt-4 flex gap-2 rounded-xl bg-brand-50 p-4 text-sm text-brand-900 ring-1 ring-brand-100" key={i}><Info aria-hidden className="mt-0.5 size-4 shrink-0" /><span>{inline(b.text)}</span></p>;
        if (b.type === "ul") return <ul className="mt-3 list-disc space-y-1.5 pl-5 marker:text-brand-600" key={i}>{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>;
        if (b.type === "ol") return <ol className="mt-3 list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-brand-700" key={i}>{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ol>;
        return <p className="mt-3 first:mt-0" key={i}>{inline(b.text)}</p>;
      })}
    </div>
  );
}
