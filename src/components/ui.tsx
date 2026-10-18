import { cn } from "@/lib/utils";

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-slate-200 bg-white p-4 shadow-sm", className)} {...p} />;
}

type Variante = "primario" | "secundario" | "perigo" | "fantasma";
const VARIANTES: Record<Variante, string> = {
  primario: "bg-indigo-600 text-white hover:bg-indigo-700",
  secundario: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  perigo: "bg-red-600 text-white hover:bg-red-700",
  fantasma: "text-slate-600 hover:bg-slate-100",
};

export function botao(variante: Variante = "primario", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTES[variante],
    className,
  );
}

export function Button({
  variante = "primario",
  className,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return <button className={botao(variante, className)} {...p} />;
}

const CORES = {
  cinza: "bg-slate-100 text-slate-700",
  azul: "bg-indigo-100 text-indigo-800",
  verde: "bg-emerald-100 text-emerald-800",
  amarelo: "bg-amber-100 text-amber-800",
  vermelho: "bg-red-100 text-red-800",
  roxo: "bg-purple-100 text-purple-800",
} as const;

export function Badge({ cor = "cinza", children }: { cor?: keyof typeof CORES; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", CORES[cor])}>
      {children}
    </span>
  );
}

export function NotaBadge({ nota }: { nota: number | null }) {
  if (nota == null) return <Badge>sem nota</Badge>;
  const cor = nota >= 75 ? "verde" : nota >= 50 ? "amarelo" : "vermelho";
  return <Badge cor={cor}>{nota}/100</Badge>;
}

export function Alerta({ tipo = "info", children }: { tipo?: "info" | "erro" | "ok"; children: React.ReactNode }) {
  const cls = {
    info: "border-indigo-200 bg-indigo-50 text-indigo-900",
    erro: "border-red-200 bg-red-50 text-red-900",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[tipo];
  return <div className={cn("rounded-md border px-3 py-2 text-sm", cls)}>{children}</div>;
}
