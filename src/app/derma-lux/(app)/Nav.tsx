"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { dlLogout } from "../auth-actions";

const LINKS = [
  { href: "/derma-lux", label: "Agenda" },
  { href: "/derma-lux/disponibilidade", label: "Disponibilidade" },
  { href: "/derma-lux/equipamentos", label: "Equipamentos" },
];

export function DermaLuxNav({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <header className="bg-brand text-paper sticky top-0 z-20">
      <div className="mx-auto px-6 md:px-10 max-w-7xl w-full flex items-center gap-4 h-16 flex-wrap">
        <Link href="/derma-lux" className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 bg-accent text-paper grid place-items-center font-display text-base font-semibold">
            DL
          </div>
          <span className="font-display text-lg tracking-tight hidden sm:block text-paper">
            Lux Derma
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map((l) => {
            const active =
              l.href === "/derma-lux"
                ? pathname === "/derma-lux"
                : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "px-3 py-2 text-sm font-medium tracking-tight transition-colors",
                  active
                    ? "text-paper border-b-2 border-accent"
                    : "text-paper/60 hover:text-paper border-b-2 border-transparent"
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        <div className="flex items-center gap-3 text-sm text-paper/70">
          <span className="hidden md:inline max-w-[180px] truncate">{email}</span>
          <form action={dlLogout}>
            <button
              type="submit"
              className="text-paper hover:text-accent transition-colors font-medium"
            >
              Sair
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
