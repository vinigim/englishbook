"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { dlLogout } from "../auth-actions";

const LINKS = [
  { href: "/derma-lux", label: "Agenda" },
  { href: "/derma-lux/disponibilidade", label: "Disponibilidade Locação" },
  {
    href: "/derma-lux/disponibilidade-clinica",
    label: "Disponibilidade Clínica Dra Gabriella",
  },
  { href: "/derma-lux/equipamentos", label: "Equipamentos" },
];

export function DermaLuxNav({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <header className="bg-brand text-paper sticky top-0 z-20">
      <div className="mx-auto px-6 md:px-10 max-w-7xl w-full py-2.5">
        <div className="flex items-center gap-4">
          <Link href="/derma-lux" className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 bg-accent text-paper grid place-items-center font-display text-base font-semibold">
              LD
            </div>
            <span className="font-display text-lg tracking-tight text-paper">
              Lux Derma
            </span>
          </Link>

          <div className="flex-1" />

          <div className="flex items-center gap-3 text-sm text-paper/70">
            <span className="hidden md:inline max-w-[180px] truncate">
              {email}
            </span>
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

        <nav className="flex items-center gap-1 mt-1 overflow-x-auto">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium tracking-tight transition-colors whitespace-nowrap",
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
      </div>
    </header>
  );
}
