import { createClient } from "@/lib/supabase/server";
import {
  BASE_CONHECIMENTO,
  ORIGEM_LABEL,
} from "@/lib/laser/base-conhecimento";
import { listarConsultas, listarLocacoes } from "@/lib/laser/consultas";
import { ParametrosClient, type FonteInfo } from "./ParametrosClient";

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

  // Sem a migração 0021 a leitura falha e a tela segue sem histórico; sem a
  // 0022, segue sem vínculo com a locação.
  const [{ consultas: historico, erro, semVinculo }, locacoes] = await Promise.all([
    listarConsultas(supabase, { limite: 50 }),
    listarLocacoes(supabase),
  ]);

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
        locacoes={locacoes}
        fontes={fontes}
        semTabela={Boolean(erro)}
        semVinculo={!erro && semVinculo}
      />
    </div>
  );
}
