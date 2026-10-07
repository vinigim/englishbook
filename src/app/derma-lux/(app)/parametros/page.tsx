import { createClient } from "@/lib/supabase/server";
import {
  BASE_CONHECIMENTO,
  ORIGEM_LABEL,
} from "@/lib/laser/base-conhecimento";
import { recomendacaoSchema } from "@/lib/laser/schema";
import type { EntradaConsulta, RespostaConsulta } from "@/lib/laser/tipos";
import { ParametrosClient, type ConsultaGravada, type FonteInfo } from "./ParametrosClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Parâmetros CO2 — Lux Derma",
};

/**
 * Recomendador de parâmetros do SmartXide Punto.
 *
 * A base de conhecimento fica no servidor: a tela recebe só título, origem e
 * link de cada trecho, para mostrar de onde veio cada recomendação.
 */
export default async function ParametrosPage() {
  const supabase = await createClient();

  // Sem a migração 0021 a consulta falha; a tela segue sem histórico.
  const { data, error } = await supabase
    .from("laser_consultas")
    .select(
      "id, created_at, entrada, recomendacao, verificacoes, bloqueado_por, model, cost_usd",
    )
    .order("created_at", { ascending: false })
    .limit(30);

  const historico: ConsultaGravada[] = [];
  for (const row of data ?? []) {
    const rec = recomendacaoSchema.safeParse(row.recomendacao);
    if (!rec.success) continue;
    const resposta: RespostaConsulta = {
      id: row.id as string,
      recomendacao: rec.data,
      verificacoes: (row.verificacoes as string[] | null) ?? [],
      bloqueadoPor: (row.bloqueado_por as string | null) ?? null,
      reaproveitada: true,
      model: (row.model as string | null) ?? null,
      costUsd: Number(row.cost_usd ?? 0),
    };
    historico.push({
      createdAt: row.created_at as string,
      entrada: row.entrada as EntradaConsulta,
      resposta,
    });
  }

  const fontes: Record<string, FonteInfo> = Object.fromEntries(
    BASE_CONHECIMENTO.map((t) => [
      t.id,
      {
        titulo: t.titulo,
        origem: ORIGEM_LABEL[t.origem],
        url: t.fonte?.url ?? null,
      },
    ]),
  );

  const gastoTotal = historico.reduce((s, c) => s + c.resposta.costUsd, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-ink tracking-tight">
          Parâmetros do laser de CO2
        </h1>
        <p className="text-muted text-sm mt-1 max-w-2xl">
          SmartXide Punto (DEKA) com scanner DOT. Descreva o caso e a IA
          sugere cada parâmetro com o motivo e a fonte. A decisão final é do
          médico: confira no manual do aparelho e comece pelo teste.
          {historico.length > 0
            ? ` · US$ ${gastoTotal.toFixed(2)} gastos nas últimas ${historico.length} consultas`
            : ""}
        </p>
      </div>

      <ParametrosClient
        historico={historico}
        fontes={fontes}
        semTabela={Boolean(error)}
      />
    </div>
  );
}
