import Link from "next/link";
import { cn } from "@/lib/utils";

export type AgendaFilter = "upcoming" | "past" | "cancelled" | "all";

const filters: { value: AgendaFilter; label: string }[] = [
  { value: "upcoming", label: "Próximas" },
  { value: "past", label: "Anteriores" },
  { value: "cancelled", label: "Canceladas" },
  { value: "all", label: "Todas" },
];

export function AgendaFilters({ active }: { active: AgendaFilter }) {
  return (
    <nav className="flex flex-wrap gap-2 border-b border-line pb-4 mb-8">
      {filters.map((f) => (
        <Link
          key={f.value}
          href={
            f.value === "upcoming"
              ? "/professor/agenda"
              : `/professor/agenda?filter=${f.value}`
          }
          className={cn(
            "px-4 py-2 text-sm transition-colors",
            active === f.value
              ? "bg-ink text-paper"
              : "bg-paper text-muted hover:text-ink hover:bg-line"
          )}
        >
          {f.label}
        </Link>
      ))}
    </nav>
  );
}
