import type { SupabaseClient } from "@supabase/supabase-js";
import { entradaSchema, realizadoSchema, recomendacaoSchema } from "./schema";
import {
  normalizarEntrada,
  type ConsultaGravada,
  type ParametrosRealizados,
  type VinculoLocacao,
} from "./tipos";

/**
 * Leitura das consultas gravadas, com a locação ligada.
 *
 * Tudo aqui tolera a migração 0022 ainda não rodada: sem as colunas novas, a
 * leitura cai para o formato antigo, sem locação nem parâmetros realizados,
 * em vez de deixar a tela vazia.
 */

const TABELA = "laser_consultas";

const CAMPOS_BASE =
  "id, created_at, entrada, recomendacao, verificacoes, bloqueado_por, model, cost_usd";

const LOCACAO = "id, client, date, specialty, equipment:equipment(name)";

type LinhaLocacao = {
  id: string;
  client: string;
  date: string;
  specialty: string | null;
  // O PostgREST devolve objeto para FK muitos-para-um, mas os tipos gerados
  // às vezes dizem array; aceitar os dois evita um cast cego.
  equipment: { name: string } | { name: string }[] | null;
};

export function paraVinculo(r: LinhaLocacao | null | undefined): VinculoLocacao | null {
  if (!r) return null;
  const equip = Array.isArray(r.equipment) ? r.equipment[0] : r.equipment;
  return {
    id: r.id,
    medico: r.client,
    data: r.date,
    equipamento: equip?.name ?? null,
    especialidade: r.specialty ?? null,
  };
}

type LinhaConsulta = {
  id: string;
  created_at: string;
  entrada: unknown;
  recomendacao: unknown;
  verificacoes: unknown;
  bloqueado_por: string | null;
  model: string | null;
  cost_usd: number | string | null;
  parametros_realizados?: unknown;
  reaproveitada_de?: string | null;
  rental?: LinhaLocacao | LinhaLocacao[] | null;
};

export function paraConsulta(row: LinhaConsulta): ConsultaGravada | null {
  const rec = recomendacaoSchema.safeParse(row.recomendacao);
  // Consultas antigas não têm os campos novos; o schema completa e converte.
  const entrada = entradaSchema.safeParse(row.entrada);
  if (!rec.success || !entrada.success) return null;

  const realizado = row.parametros_realizados
    ? realizadoSchema.safeParse(row.parametros_realizados)
    : null;
  const rental = Array.isArray(row.rental) ? row.rental[0] : row.rental;

  return {
    createdAt: row.created_at,
    entrada: normalizarEntrada(entrada.data),
    resposta: {
      id: row.id,
      locacao: paraVinculo(rental),
      realizado: realizado?.success ? (realizado.data as ParametrosRealizados) : null,
      recomendacao: rec.data,
      verificacoes: Array.isArray(row.verificacoes) ? (row.verificacoes as string[]) : [],
      bloqueadoPor: row.bloqueado_por ?? null,
      reaproveitada: Boolean(row.reaproveitada_de),
      model: row.model ?? null,
      costUsd: Number(row.cost_usd ?? 0),
    },
  };
}

/**
 * Lista as consultas mais recentes, ou só as de um médico.
 *
 * A busca por médico olha o nome gravado na locação (rentals.client), que é
 * texto livre: "Dra. Ana", "Ana Souza" e "Clínica Ana" são o mesmo médico só
 * se o texto digitado aparecer nos três.
 */
export async function listarConsultas(
  supabase: SupabaseClient,
  opcoes: { limite?: number; medico?: string } = {},
): Promise<{ consultas: ConsultaGravada[]; erro: string | null; semVinculo: boolean }> {
  const limite = opcoes.limite ?? 50;
  const medico = opcoes.medico?.trim();

  // `!inner` faz o filtro pela locação excluir as consultas sem locação.
  const juncao = medico ? `rental:rentals!inner(${LOCACAO})` : `rental:rentals(${LOCACAO})`;
  let consulta = supabase
    .from(TABELA)
    .select(`${CAMPOS_BASE}, parametros_realizados, reaproveitada_de, ${juncao}`)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (medico) consulta = consulta.ilike("rental.client", `%${escaparLike(medico)}%`);

  const { data, error } = await consulta;
  if (!error) {
    return {
      consultas: ((data ?? []) as unknown as LinhaConsulta[])
        .map(paraConsulta)
        .filter((c): c is ConsultaGravada => c !== null),
      erro: null,
      semVinculo: false,
    };
  }

  // Sem a 0022: lê do jeito antigo. Busca por médico não tem como funcionar.
  console.error("[laser-consultas] leitura com locação falhou", error.message);
  if (medico) return { consultas: [], erro: error.message, semVinculo: true };

  const antigo = await supabase
    .from(TABELA)
    .select(CAMPOS_BASE)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (antigo.error) return { consultas: [], erro: antigo.error.message, semVinculo: true };
  return {
    consultas: ((antigo.data ?? []) as unknown as LinhaConsulta[])
      .map(paraConsulta)
      .filter((c): c is ConsultaGravada => c !== null),
    erro: null,
    semVinculo: true,
  };
}

export async function lerConsulta(
  supabase: SupabaseClient,
  id: string,
): Promise<ConsultaGravada | null> {
  const { data, error } = await supabase
    .from(TABELA)
    .select(`${CAMPOS_BASE}, parametros_realizados, reaproveitada_de, rental:rentals(${LOCACAO})`)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return paraConsulta(data as unknown as LinhaConsulta);
}

/**
 * Locações que podem ser ligadas a uma consulta: dos últimos 90 dias aos
 * próximos 60, as mais próximas de hoje primeiro.
 */
export async function listarLocacoes(
  supabase: SupabaseClient,
): Promise<VinculoLocacao[]> {
  const hoje = new Date();
  const dia = (deslocamento: number) => {
    const d = new Date(hoje);
    d.setDate(d.getDate() + deslocamento);
    return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  };

  const { data, error } = await supabase
    .from("rentals")
    .select(LOCACAO)
    .gte("date", dia(-90))
    .lte("date", dia(60))
    .order("date", { ascending: false })
    .limit(400);
  if (error) {
    console.error("[laser-consultas] falha ao listar locações", error.message);
    return [];
  }

  const hojeIso = dia(0);
  const distancia = (d: string) =>
    Math.abs(new Date(d).getTime() - new Date(hojeIso).getTime());
  return ((data ?? []) as unknown as LinhaLocacao[])
    .map(paraVinculo)
    .filter((v): v is VinculoLocacao => v !== null)
    .sort((a, b) => distancia(a.data) - distancia(b.data));
}

export async function lerLocacao(
  supabase: SupabaseClient,
  id: string,
): Promise<VinculoLocacao | null> {
  const { data } = await supabase.from("rentals").select(LOCACAO).eq("id", id).maybeSingle();
  return paraVinculo(data as unknown as LinhaLocacao | null);
}

/** `%` e `_` digitados pelo usuário são letras, não curingas. */
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}
