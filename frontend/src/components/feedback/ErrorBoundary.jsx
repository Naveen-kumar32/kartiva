import { TriangleAlert } from "lucide-react";
import { Component } from "react";

import { EN } from "@/locales";

// Catches render errors and failed lazy chunks so one broken page never blanks the whole app.
export class ErrorBoundary extends Component {
  state = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error) {
    return { error };
  }

  // Navigating to another page (new resetKey) clears the error.
  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error, info) {
    console.error("Page crashed:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunkFailed = /dynamically imported module|Failed to fetch|Importing a module script failed|does not provide an export/i.test(this.state.error.message);
    return (
      <div className="grid min-h-[60vh] place-items-center p-6" role="alert">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-card">
          <TriangleAlert aria-hidden className="mx-auto size-12 text-amber-500" />
          <h1 className="mt-4 text-xl font-bold">{EN.ERRORS.PAGE_CRASH_TITLE}</h1>
          <p className="mt-2 text-sm text-muted">{chunkFailed ? EN.ERRORS.CHUNK_FAILED : EN.ERRORS.PAGE_CRASH_BODY}</p>
          <p className="mt-3 break-words rounded-lg bg-slate-50 p-2 font-mono text-xs text-slate-500">{this.state.error.message}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button className="h-10 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700" onClick={() => window.location.reload()} type="button">{EN.ERRORS.RELOAD}</button>
            <a className="grid h-10 place-items-center rounded-lg border border-line px-4 text-sm font-semibold hover:border-brand-500" href="/">{EN.COMMON.HOME}</a>
          </div>
        </div>
      </div>
    );
  }
}
