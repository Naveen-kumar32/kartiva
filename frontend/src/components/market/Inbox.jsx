import { MessagesSquare, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { getMyThreads, markThreadRead, sendMessage } from "@/api";
import { useAsync, useAuth } from "@/hooks";
import { EN } from "@/locales";
import { cn } from "@/utils/cn";
import { formatDateTime } from "@/utils/format";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast } from "@/utils/toast";

import { EmptyState, ErrorState } from "../feedback";
import { Badge, Button, SearchInput } from "../ui";

const M = EN.MARKET;

// Two-pane conversation inbox used by buyers (/account/messages) and sellers (/seller/messages).
// initialThreadId opens a thread directly (e.g. from an enquiry). Admin passes readOnly.
export function Inbox({ initialThreadId = null, readOnly = false }) {
  const { user } = useAuth();
  const { data, error, loading, reload, setData } = useAsync(() => getMyThreads(user), [user?.email]);
  const [activeId, setActiveId] = useState(initialThreadId ? Number(initialThreadId) : null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const me = user?.role === "seller" ? "seller" : user?.role === "admin" ? "admin" : "buyer";

  const threads = useMemo(() => (data ?? []).filter((t) => `${t.subject} ${t.buyer.name} ${t.store?.name}`.toLowerCase().includes(query.toLowerCase())), [data, query]);
  const active = data?.find((t) => t.id === activeId) ?? null;

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [activeId, active?.messages.length]);

  const replace = (thread) => setData(data.map((t) => (t.id === thread.id ? thread : t)));
  const openThread = async (id) => {
    setActiveId(id);
    try { replace(await markThreadRead(id, user)); } catch { /* list stays as is */ }
  };
  const send = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    try {
      replace(await sendMessage(active.id, user, draft));
      setDraft("");
    } catch (err) {
      errorToast(getErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!loading && !data?.length) return <EmptyState body={M.EMPTY_THREADS_BODY} icon={MessagesSquare} title={M.EMPTY_THREADS} />;
  const counterpart = (t) => (me === "seller" ? t.buyer.name : t.store?.name ?? "");
  const unreadOf = (t) => (me === "admin" ? 0 : t.unread[me] ?? 0);

  return (
    <div className="grid min-h-[32rem] overflow-hidden rounded-2xl border border-line bg-white md:grid-cols-[18rem_1fr]">
      <aside className={cn("flex flex-col border-line md:border-r", active && "hidden md:flex")}>
        <div className="border-b border-line p-3"><SearchInput onChange={setQuery} placeholder={M.SEARCH_THREADS} value={query} /></div>
        <ul aria-label={M.CONVERSATIONS} className="flex-1 divide-y divide-line overflow-y-auto">
          {loading && <li className="p-4 text-sm text-muted">{EN.COMMON.LOADING}</li>}
          {threads.map((t) => (
            <li key={t.id}>
              <button className={cn("w-full px-4 py-3 text-left hover:bg-slate-50", t.id === activeId && "bg-brand-50")} onClick={() => openThread(t.id)} type="button">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("truncate text-sm", unreadOf(t) ? "font-bold" : "font-medium")}>{counterpart(t)}</p>
                  {unreadOf(t) > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white">{unreadOf(t)}</span>}
                </div>
                <p className="truncate text-xs text-muted">{t.subject}</p>
                <p className="mt-0.5 truncate text-xs text-slate-400">{t.messages.at(-1)?.body}</p>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className={cn("flex min-w-0 flex-col", !active && "hidden md:flex")}>
        {!active ? (
          <p className="m-auto p-8 text-sm text-muted">{M.PICK_THREAD}</p>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-line px-4 py-3">
              <button className="text-sm font-semibold text-brand-700 md:hidden" onClick={() => setActiveId(null)} type="button">←</button>
              <div className="min-w-0">
                <p className="truncate font-semibold">{active.subject}</p>
                <p className="truncate text-xs text-muted">{counterpart(active)}{me === "seller" && active.buyer.city ? ` · ${active.buyer.city}` : ""}</p>
              </div>
              <Badge className="ml-auto shrink-0" tone="info">{M.THREAD_CONTEXT[active.context?.type] ?? active.context?.type}</Badge>
            </header>
            <ol className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
              {active.messages.map((m) => {
                const mine = m.from === me;
                return (
                  <li className={cn("flex", mine ? "justify-end" : "justify-start")} key={m.id}>
                    <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm", mine ? "rounded-br-sm bg-brand-600 text-white" : "rounded-bl-sm bg-white ring-1 ring-line")}>
                      <p className="whitespace-pre-line">{m.body}</p>
                      <p className={cn("mt-1 text-[11px]", mine ? "text-white/70" : "text-slate-400")}>{mine ? M.YOU : m.from === "seller" ? active.store?.name : active.buyer.name} · {formatDateTime(m.at)}</p>
                    </div>
                  </li>
                );
              })}
              <li ref={endRef} />
            </ol>
            {!readOnly && (
              <form className="flex gap-2 border-t border-line p-3" onSubmit={send}>
                <label className="sr-only" htmlFor="inbox-draft">{M.MESSAGE_PLACEHOLDER}</label>
                <input className="h-10 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" id="inbox-draft" onChange={(e) => setDraft(e.target.value)} placeholder={M.MESSAGE_PLACEHOLDER} value={draft} />
                <Button aria-label={M.SEND} loading={sending} type="submit"><Send aria-hidden className="size-4" /><span className="hidden sm:inline">{M.SEND}</span></Button>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}
