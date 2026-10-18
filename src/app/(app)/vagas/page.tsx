import Link from "next/link";
import { Badge, Card, NotaBadge } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import {
  FONTE_LABEL, NIVEL_LABEL, NIVEIS, STATUS_LABEL,
  type Fonte, type Nivel, type Status, type Triagem,
} from "@/lib/tipos";
import { cn, dataCurta, dataHora } from "@/lib/utils";
import { BotaoBuscar } from "./botao-buscar";
import { NovaVaga } from "./nova-vaga";

export const dynamic = "force-dynamic";

const ABAS = [
  { id: "relevantes", label: "Relevantes" },
  { id: "pendentes", label: "Aguardando triagem" },
  { id: "descartadas", label: "Descartadas" },
  { id: "arquivadas", label: "Arquivadas" },
] as const;

const MODELO_LABEL: Record<string, string> = {
  remoto: "Remoto", hibrido: "Híbrido", presencial: "Presencial", desconhecido: "Modelo n/d",
};

type Busca = { aba?: string; nivel?: string; modelo?: string; q?: string; internacional?: string; ordem?: string };

export default async function VagasPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const sp = await searchParams;
  const aba = ABAS.some((a) => a.id === sp.aba) ? sp.aba! : "relevantes";
  const supabase = await createClient();

  let consulta = supabase
    .from("vagas")
    .select("id, fonte, url, titulo, empresa, local, modelo, pais, nota, triagem, triagem_status, encontrada_em, publicada_em, candidaturas(status)")
    .limit(200);

  if (aba === "arquivadas") consulta = consulta.eq("arquivada", true);
  else {
    consulta = consulta.eq("arquivada", false);
    consulta = consulta.eq("triagem_status", aba === "relevantes" ? "relevante" : aba === "pendentes" ? "pendente" : "descartada");
  }
  if (sp.modelo) consulta = consulta.eq("modelo", sp.modelo);
  if (sp.nivel && (NIVEIS as readonly string[]).includes(sp.nivel)) consulta = consulta.eq("triagem->>nivel", sp.nivel);
  if (sp.internacional === "sim") consulta = consulta.eq("triagem->>internacional", "true");
  if (sp.internacional === "nao") consulta = consulta.eq("triagem->>internacional", "false");
  if (sp.q) {
    const q = sp.q.replace(/[%,()]/g, " ").trim();
    if (q) consulta = consulta.or(`titulo.ilike.%${q}%,empresa.ilike.%${q}%,descricao.ilike.%${q}%`);
  }
  consulta =
    sp.ordem === "recentes"
      ? consulta.order("encontrada_em", { ascending: false })
      : consulta.order("nota", { ascending: false, nullsFirst: false }).order("encontrada_em", { ascending: false });

  const [{ data: vagas, error }, { data: ultima }] = await Promise.all([
    consulta,
    supabase.from("execucoes_busca").select("iniciada_em, terminada_em, resumo, origem").order("iniciada_em", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const novasHoje = (vagas ?? []).filter((v) => Date.now() - new Date(v.encontrada_em).getTime() < 86_400_000).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Vagas</h1>
          <p className="text-sm text-slate-500">
            Última busca: {ultima ? `${dataHora(ultima.iniciada_em)} (${ultima.origem})` : "nenhuma ainda"}
            {aba === "relevantes" && novasHoje > 0 && <> · <strong>{novasHoje} nova(s) nas últimas 24h</strong></>}
          </p>
        </div>
        <div className="flex gap-2">
          <NovaVaga />
          <BotaoBuscar />
        </div>
      </div>

      {ultima?.resumo?.fontes && <ResumoFontes fontes={ultima.resumo.fontes} />}

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {ABAS.map((a) => (
          <Link
            key={a.id}
            href={`/vagas?aba=${a.id}`}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              aba === a.id ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {a.label}
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap items-end gap-2" action="/vagas">
        <input type="hidden" name="aba" value={aba} />
        <div className="min-w-48 flex-1">
          <label className="label">Buscar</label>
          <input name="q" defaultValue={sp.q} placeholder="título, empresa, tecnologia…" className="input" />
        </div>
        <div>
          <label className="label">Nível</label>
          <select name="nivel" defaultValue={sp.nivel ?? ""} className="input">
            <option value="">Todos</option>
            {NIVEIS.map((n) => <option key={n} value={n}>{NIVEL_LABEL[n]}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Modelo</label>
          <select name="modelo" defaultValue={sp.modelo ?? ""} className="input">
            <option value="">Todos</option>
            <option value="remoto">Remoto</option>
            <option value="hibrido">Híbrido</option>
            <option value="presencial">Presencial</option>
          </select>
        </div>
        <div>
          <label className="label">Região</label>
          <select name="internacional" defaultValue={sp.internacional ?? ""} className="input">
            <option value="">Todas</option>
            <option value="nao">Brasil</option>
            <option value="sim">Internacional</option>
          </select>
        </div>
        <div>
          <label className="label">Ordem</label>
          <select name="ordem" defaultValue={sp.ordem ?? ""} className="input">
            <option value="">Maior nota</option>
            <option value="recentes">Mais recentes</option>
          </select>
        </div>
        <button className="rounded-md bg-slate-800 px-3 py-2 text-sm text-white">Filtrar</button>
      </form>

      {error && <p className="text-sm text-red-600">Erro ao carregar: {error.message}</p>}
      {vagas?.length === 0 && (
        <Card className="text-center text-sm text-slate-500">
          Nenhuma vaga aqui. {aba === "relevantes" && "Clique em “Buscar agora” ou ajuste as fontes em Perfil."}
        </Card>
      )}

      <div className="space-y-2">
        {vagas?.map((v) => {
          const t = v.triagem as Triagem | null;
          const cand = (v.candidaturas as { status: Status }[] | null)?.[0];
          return (
            <Card key={v.id} className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/vagas/${v.id}`} className="font-medium text-slate-900 hover:text-indigo-700">
                    {v.titulo}
                  </Link>
                  {cand && <Badge cor="roxo">{STATUS_LABEL[cand.status]}</Badge>}
                </div>
                <p className="text-sm text-slate-600">
                  {v.empresa || "Empresa não informada"}
                  {v.local && ` · ${v.local}`}
                </p>
                {t?.resumo && <p className="mt-1 text-sm text-slate-500">{t.resumo}</p>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {t?.nivel && <Badge cor="azul">{NIVEL_LABEL[t.nivel as Nivel]}</Badge>}
                  <Badge>{MODELO_LABEL[v.modelo] ?? v.modelo}</Badge>
                  {t?.internacional && <Badge cor="amarelo">Internacional</Badge>}
                  {t?.salario && <Badge cor="verde">{t.salario}</Badge>}
                  <Badge>{FONTE_LABEL[v.fonte as Fonte] ?? v.fonte}</Badge>
                  <span className="text-xs text-slate-400">encontrada em {dataCurta(v.encontrada_em)}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                <NotaBadge nota={v.nota} />
                <a href={v.url} target="_blank" rel="noreferrer" className="text-sm text-indigo-700 hover:underline">
                  Abrir vaga ↗
                </a>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ResumoFontes({ fontes }: { fontes: Record<string, { trazidas?: number; novas?: number; erro?: string }> }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
      {Object.entries(fontes).map(([nome, r]) => (
        <span key={nome} className={cn("rounded border px-2 py-0.5", r.erro ? "border-red-200 text-red-600" : "border-slate-200")}>
          {nome}:{" "}
          {r.erro
            ? r.erro === "nao_configurado" ? "não configurado" : `erro (${r.erro})`
            : `${r.trazidas} vistas, ${r.novas} novas`}
        </span>
      ))}
    </div>
  );
}
