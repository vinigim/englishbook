"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copiar } from "@/components/copiar";
import { Alerta, Button, Card } from "@/components/ui";
import type { Materiais } from "@/lib/ai/materiais";
import { dataHora } from "@/lib/utils";

type Props = {
  vagaId: string;
  temCv: boolean;
  materiais: (Materiais & { cv_id: string | null; criado_em: string }) | null;
};

const ERROS: Record<string, string> = {
  cv_base_vazio: "Cadastre seu CV base (menu Meu CV) antes de gerar os materiais.",
  materiais_falhou: "Não foi possível gerar agora. Tente de novo em instantes.",
};

export function PainelMateriais({ vagaId, temCv, materiais }: Props) {
  const router = useRouter();
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gerar() {
    setGerando(true);
    setErro(null);
    const res = await fetch(`/api/vagas/${vagaId}/materiais`, { method: "POST" });
    setGerando(false);
    if (!res.ok) {
      const r = await res.json().catch(() => ({}));
      return setErro(r.mensagem ?? ERROS[r.error] ?? "Erro ao gerar os materiais.");
    }
    router.refresh();
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Materiais para esta candidatura</h2>
          <p className="text-xs text-slate-500">
            {materiais ? `Gerados em ${dataHora(materiais.criado_em)}` : "CV adaptado, carta, respostas e preparo para entrevista."}
          </p>
        </div>
        <Button onClick={gerar} disabled={gerando || !temCv} variante={materiais ? "secundario" : "primario"}>
          {gerando ? "Gerando… (até 1 min)" : materiais ? "Gerar de novo" : "✨ Gerar materiais"}
        </Button>
      </div>
      {!temCv && <Alerta>Cadastre seu CV base em <Link href="/cv" className="underline">Meu CV</Link> para gerar materiais.</Alerta>}
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {materiais && (
        <div className="space-y-5">
          <Secao titulo="Aderência">
            <div className="grid gap-3 sm:grid-cols-3">
              <Lista titulo="Pontos fortes" itens={materiais.aderencia.pontos_fortes} />
              <Lista titulo="Lacunas" itens={materiais.aderencia.lacunas} />
              <Lista titulo="Palavras-chave que faltam no CV" itens={materiais.aderencia.palavras_chave_faltando} />
            </div>
          </Secao>

          <Secao
            titulo={`CV adaptado (${materiais.idioma === "en" ? "inglês" : "português"})`}
            acao={materiais.cv_id && (
              <Link href={`/cv/imprimir/${materiais.cv_id}`} target="_blank" className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">
                Abrir para salvar em PDF
              </Link>
            )}
          >
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-600">
              {materiais.mudancas_no_cv.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </Secao>

          <Secao titulo="Carta de apresentação" acao={<Copiar texto={materiais.carta} />}>
            <p className="whitespace-pre-wrap text-sm">{materiais.carta}</p>
          </Secao>

          <Secao titulo="Mensagem para o recrutador (LinkedIn)" acao={<Copiar texto={materiais.mensagem_linkedin} />}>
            <p className="whitespace-pre-wrap text-sm">{materiais.mensagem_linkedin}</p>
          </Secao>

          <Secao titulo="Respostas para o formulário">
            <div className="space-y-3">
              {materiais.respostas.map((r) => (
                <div key={r.pergunta}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{r.pergunta}</p>
                    <Copiar texto={r.resposta} />
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{r.resposta}</p>
                </div>
              ))}
            </div>
          </Secao>

          <Secao titulo="Preparo para a entrevista">
            <div className="space-y-2">
              {materiais.preparo_entrevista.map((p) => (
                <details key={p.pergunta} className="rounded border border-slate-200 px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">{p.pergunta}</summary>
                  <p className="mt-1 text-sm text-slate-700">{p.dica}</p>
                </details>
              ))}
            </div>
          </Secao>
        </div>
      )}
    </Card>
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

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase text-slate-500">{titulo}</p>
      {itens.length === 0 ? (
        <p className="text-sm text-slate-400">—</p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-4 text-sm">{itens.map((i) => <li key={i}>{i}</li>)}</ul>
      )}
    </div>
  );
}
