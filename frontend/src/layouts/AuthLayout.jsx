import { CircleCheck } from "lucide-react";
import { Outlet } from "react-router-dom";

import { Logo } from "@/components";
import { EN } from "@/locales";

export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-brand-800 p-12 text-white lg:flex lg:flex-col">
        <span aria-hidden className="absolute -right-24 -top-24 size-96 rounded-full bg-brand-600/50 blur-3xl" />
        <span aria-hidden className="absolute -bottom-32 -left-16 size-96 rounded-full bg-accent-500/20 blur-3xl" />
        <Logo light />
        <div className="relative mt-auto">
          <h1 className="text-4xl font-extrabold leading-tight">{EN.APP.TAGLINE}</h1>
          <ul className="mt-8 space-y-3 text-white/85">
            {EN.AUTH.SIDE_POINTS.map((p) => <li className="flex items-center gap-3" key={p}><CircleCheck aria-hidden className="size-5 text-accent-400" />{p}</li>)}
          </ul>
        </div>
      </aside>
      <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 lg:hidden"><Logo /></div>
        <div className="w-full max-w-md"><Outlet /></div>
      </main>
    </div>
  );
}
