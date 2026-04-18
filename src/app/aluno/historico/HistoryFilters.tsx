import Link from "next/link";
import { cn } from "@/lib/utils";

export type HistoryFilter = "all" | "upcoming" | "past" | "cancelled";

const filters: { value: HistoryFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "upcoming", label: "Próximas" },
  { value: "past", label: "Concluídas" },
  { value: "cancelled", label: "Canceladas" },
];

export function HistoryFilters({ active }: { active: HistoryFilter }) {
  return (
    <nav className="flex flex-wrap gap-2 border-b border-line pb-4 mb-8">
      {filters.map((f) => (
        <Link
          key={f.value}
          href={f.value === "all" ? "/aluno/historico" : `/aluno/historico?status=${f.value}`}
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
