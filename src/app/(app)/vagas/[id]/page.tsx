import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, NotaBadge } from "@/components/ui";
import type { Materiais } from "@/lib/ai/materiais";
import { createClient } from "@/lib/supabase/server";
import { FONTE_LABEL, NIVEL_LABEL, type Fonte, type Triagem } from "@/lib/tipos";
import { dataCurta, dataHora } from "@/lib/utils";
import { AcoesVaga } from "./acoes-vaga";
import { PainelCandidatura } from "./painel-candidatura";
import { PainelMateriais } from "./painel-materiais";

export const dynamic = "force-dynamic";

export default async function VagaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: vaga } = await supabase.from("vagas").select("*").eq("id", id).maybeSingle();
  if (!vaga) notFound();

  const [{ data: candidatura }, { data: materiais }, { data: cvBase }] = await Promise.all([
    supabase.from("candidaturas").select("*, candidatura_eventos(*)").eq("vaga_id", id).maybeSingle(),
    supabase.from("materiais").select("id, conteudo, created_at").eq("vaga_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("cvs").select("id, conteudo").eq("base", true).maybeSingle(),
  ]);
  const t = vaga.triagem as Triagem | null;
  const temCv = Boolean(cvBase?.conteudo?.experiencias?.length);

  return (
    <div className="space-y-4">
      <Link href="/vagas" className="text-sm text-slate-500 hover:underline">← Vagas</Link>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{vaga.titulo}</h1>
            <p className="text-slate-600">
              {vaga.empresa || "Empresa não informada"}
              {vaga.local && ` · ${vaga.local}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <NotaBadge nota={vaga.nota} />
            <a href={vaga.url} target="_blank" rel="noreferrer" className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              Abrir vaga e candidatar ↗
            </a>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {t?.nivel && <Badge cor="azul">{NIVEL_LABEL[t.nivel]}</Badge>}
          <Badge>{vaga.modelo}</Badge>
          {t?.internacional && <Badge cor="amarelo">Internacional</Badge>}
          {t?.salario && <Badge cor="verde">{t.salario}</Badge>}
          {t && !t.eh_mainframe && <Badge cor="vermelho">IA: não parece mainframe</Badge>}
          <Badge>{FONTE_LABEL[vaga.fonte as Fonte] ?? vaga.fonte}</Badge>
          <span className="text-xs text-slate-400">
            encontrada em {dataHora(vaga.encontrada_em)}
            {vaga.publicada_em && ` · publicada em ${dataCurta(vaga.publicada_em)}`}
          </span>
        </div>
        {t && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-sm">{t.resumo}</p>
              {t.tecnologias.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.tecnologias.map((x) => <Badge key={x}>{x}</Badge>)}
                </div>
              )}
            </div>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-600">
              {t.motivos.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </div>
        )}
        <AcoesVaga id={vaga.id} arquivada={vaga.arquivada} descartada={vaga.triagem_status === "descartada"} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <PainelMateriais
            vagaId={vaga.id}
            temCv={temCv}
            materiais={materiais ? { ...(materiais.conteudo as Materiais & { cv_id: string | null }), criado_em: materiais.created_at } : null}
          />
          <Card>
            <h2 className="mb-2 font-semibold">Descrição da vaga</h2>
            {vaga.descricao ? (
              <div className="whitespace-pre-wrap text-sm text-slate-700">{vaga.descricao}</div>
            ) : (
              <p className="text-sm text-slate-500">
                Esta vaga veio de um alerta e não tem descrição. Abra o link e, se quiser materiais melhores,
                adicione-a de novo como “Vaga manual” colando o texto.
              </p>
            )}
          </Card>
        </div>
        <PainelCandidatura vagaId={vaga.id} candidatura={candidatura} />
      </div>
    </div>
  );
}
