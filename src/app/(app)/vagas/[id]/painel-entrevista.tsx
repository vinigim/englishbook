"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copiar } from "@/components/copiar";
import { Alerta, Badge, Button, Card } from "@/components/ui";
import type { Preparo, PreparoBilingue } from "@/lib/ai/entrevista";
import { cn, dataHora } from "@/lib/utils";

type Idioma = "pt" | "en";

type Props = {
  vagaId: string;
  temCv: boolean;
  preparo: (PreparoBilingue & { criado_em: string }) | null;
};

const ERROS: Record<string, string> = {
  cv_base_vazio: "Cadastre seu CV base (menu Meu CV) antes de preparar a entrevista.",
  entrevista_falhou: "Não foi possível gerar agora. Tente de novo em instantes.",
};

// Os títulos acompanham o idioma escolhido, para o roteiro em inglês ser lido de ponta a ponta em inglês.
const T = {
  pt: {
    buscam: "O que a vaga busca",
    pitch: "Seu pitch (“fale sobre você”)",
    requisitos: "Requisitos × sua experiência",
    historias: "Histórias para contar (STAR)",
    tecnicas: "Perguntas técnicas prováveis",
    comportamentais: "Perguntas comportamentais",
    lacunas: "Lacunas e como abordar",
    fazer: "Perguntas para você fazer",
    cuidados: "Pontos de atenção",
    star: ["Situação", "Tarefa", "Ação", "Resultado"],
    aderencia: { forte: "Forte", parcial: "Parcial", lacuna: "Lacuna" } as Record<string, string>,
    evidencia: "No seu CV",
  },
  en: {
    buscam: "What they are looking for",
    pitch: "Your pitch (“tell me about yourself”)",
    requisitos: "Requirements × your experience",
    historias: "Stories to tell (STAR)",
    tecnicas: "Likely technical questions",
    comportamentais: "Behavioral questions",
    lacunas: "Gaps and how to address them",
    fazer: "Questions to ask them",
    cuidados: "Things to keep in mind",
    star: ["Situation", "Task", "Action", "Result"],
    aderencia: { forte: "Strong", parcial: "Partial", lacuna: "Gap" } as Record<string, string>,
    evidencia: "In your CV",
  },
};

const COR_ADERENCIA: Record<string, "verde" | "amarelo" | "vermelho"> = { forte: "verde", parcial: "amarelo", lacuna: "vermelho" };

function normalizarAderencia(a: string) {
  const s = a.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return /forte|strong/.test(s) ? "forte" : /parcial|partial/.test(s) ? "parcial" : "lacuna";
}

/** O roteiro inteiro em texto, para colar numa nota e revisar antes da entrevista. */
function comoTexto(p: Preparo, idioma: Idioma): string {
  const t = T[idioma];
  const blocos = [
    `${t.buscam}\n${p.o_que_buscam}`,
    `${t.pitch}\n${p.pitch}`,
    `${t.requisitos}\n${p.requisitos.map((r) => `- ${r.requisito} [${t.aderencia[normalizarAderencia(r.aderencia)]}]: ${r.como_falar}`).join("\n")}`,
    `${t.historias}\n${p.historias.map((h) => `• ${h.tema}\n  ${t.star[0]}: ${h.situacao}\n  ${t.star[1]}: ${h.tarefa}\n  ${t.star[2]}: ${h.acao}\n  ${t.star[3]}: ${h.resultado}`).join("\n")}`,
    `${t.tecnicas}\n${p.perguntas_tecnicas.map((q) => `- ${q.pergunta}\n  ${q.como_responder}`).join("\n")}`,
    `${t.comportamentais}\n${p.perguntas_comportamentais.map((q) => `- ${q.pergunta}\n  ${q.como_responder}`).join("\n")}`,
    `${t.lacunas}\n${p.lacunas.map((l) => `- ${l.lacuna}: ${l.como_abordar}`).join("\n")}`,
    `${t.fazer}\n${p.perguntas_para_fazer.map((q) => `- ${q}`).join("\n")}`,
    `${t.cuidados}\n${p.cuidados.map((c) => `- ${c}`).join("\n")}`,
  ];
  return blocos.join("\n\n");
}

export function PainelEntrevista({ vagaId, temCv, preparo }: Props) {
  const router = useRouter();
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [idioma, setIdioma] = useState<Idioma>("pt");

  async function gerar() {
    setGerando(true);
    setErro(null);
    const res = await fetch(`/api/vagas/${vagaId}/entrevista`, { method: "POST" });
    setGerando(false);
    if (!res.ok) {
      const r = await res.json().catch(() => ({}));
      return setErro(r.mensagem ?? ERROS[r.error] ?? "Erro ao preparar a entrevista.");
    }
    router.refresh();
  }

  const p = preparo?.[idioma];
  const t = T[idioma];

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Preparo para a entrevista</h2>
          <p className="text-xs text-slate-500">
            {preparo
              ? `Gerado em ${dataHora(preparo.criado_em)}`
              : "A IA cruza os requisitos da vaga com o seu CV: pitch, histórias, perguntas prováveis e lacunas, em português e inglês."}
          </p>
        </div>
        <Button onClick={gerar} disabled={gerando || !temCv} variante={preparo ? "secundario" : "primario"}>
          {gerando ? "Preparando… (até 3 min)" : preparo ? "Gerar de novo" : "🎤 Preparar para a entrevista"}
        </Button>
      </div>
      {!temCv && <Alerta>Cadastre seu CV base em <Link href="/cv" className="underline">Meu CV</Link> para preparar a entrevista.</Alerta>}
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {p && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-md border border-slate-300 p-0.5 text-sm">
              {(["pt", "en"] as const).map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIdioma(i)}
                  className={cn("rounded px-3 py-1", idioma === i ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100")}
                >
                  {i === "pt" ? "🇧🇷 Português" : "🇺🇸 English"}
                </button>
              ))}
            </div>
            <Copiar texto={comoTexto(p, idioma)} rotulo={idioma === "pt" ? "Copiar roteiro inteiro" : "Copy full script"} />
          </div>

          <Secao titulo={t.buscam}>
            <p className="text-sm text-slate-700">{p.o_que_buscam}</p>
          </Secao>

          <Secao titulo={t.pitch} acao={<Copiar texto={p.pitch} />}>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{p.pitch}</p>
          </Secao>

          <Secao titulo={t.requisitos}>
            <div className="space-y-2">
              {p.requisitos.map((r) => {
                const a = normalizarAderencia(r.aderencia);
                return (
                  <div key={r.requisito} className="rounded border border-slate-200 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{r.requisito}</p>
                      <Badge cor={COR_ADERENCIA[a]}>{t.aderencia[a]}</Badge>
                    </div>
                    {r.evidencia && <p className="mt-1 text-xs text-slate-500">{t.evidencia}: {r.evidencia}</p>}
                    <p className="mt-1 text-sm text-slate-700">{r.como_falar}</p>
                  </div>
                );
              })}
            </div>
          </Secao>

          <Secao titulo={t.historias}>
            <div className="space-y-2">
              {p.historias.map((h) => (
                <details key={h.tema} className="rounded border border-slate-200 px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">{h.tema}</summary>
                  <dl className="mt-2 space-y-1 text-sm">
                    {[h.situacao, h.tarefa, h.acao, h.resultado].map((texto, i) => (
                      <div key={t.star[i]}>
                        <dt className="inline font-medium text-slate-800">{t.star[i]}: </dt>
                        <dd className="inline text-slate-700">{texto}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              ))}
            </div>
          </Secao>

          <Secao titulo={t.tecnicas}>
            <Perguntas itens={p.perguntas_tecnicas} />
          </Secao>

          <Secao titulo={t.comportamentais}>
            <Perguntas itens={p.perguntas_comportamentais} />
          </Secao>

          {p.lacunas.length > 0 && (
            <Secao titulo={t.lacunas}>
              <ul className="space-y-1.5 text-sm">
                {p.lacunas.map((l) => (
                  <li key={l.lacuna}>
                    <span className="font-medium">{l.lacuna}:</span> <span className="text-slate-700">{l.como_abordar}</span>
                  </li>
                ))}
              </ul>
            </Secao>
          )}

          <Secao titulo={t.fazer}>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
              {p.perguntas_para_fazer.map((q) => <li key={q}>{q}</li>)}
            </ul>
          </Secao>

          <Secao titulo={t.cuidados}>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
              {p.cuidados.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </Secao>
        </div>
      )}
    </Card>
  );
}

function Perguntas({ itens }: { itens: { pergunta: string; como_responder: string }[] }) {
  return (
    <div className="space-y-2">
      {itens.map((q) => (
        <details key={q.pergunta} className="rounded border border-slate-200 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">{q.pergunta}</summary>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{q.como_responder}</p>
        </details>
      ))}
    </div>
  );
}

function Secao({ titulo, acao, children }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}
