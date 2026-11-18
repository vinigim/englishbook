"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export type LeadTeste = {
  id: string;
  grupo: "IA achou" | "Dono achou" | "Ninguém achou";
  nome: string;
  gabarito: string | null;
};

type Variante = "basicas" | "filtragem";

type Resultado = {
  candidatos: string[];
  acertou: boolean | null;
  descartados: number;
  pesquisas: number;
  custo: number;
  tokens: number;
  segundos: number;
  erro?: string;
};

const VARIANTES: Variante[] = ["basicas", "filtragem"];
const NOME: Record<Variante, string> = { basicas: "Hoje", filtragem: "Filtragem" };

async function buscar(id: string, ferramentas: Variante, gabarito: string | null): Promise<Resultado> {
  const t0 = Date.now();
  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    const r = await fetch(`/api/leads/${id}/buscar-instagram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teste: true, ferramentas }),
    });
    // Limite por minuto: espera e tenta uma vez de novo.
    if (r.status === 429 && tentativa === 0) {
      await new Promise((ok) => setTimeout(ok, 65_000));
      continue;
    }
    const j = await r.json().catch(() => null);
    const segundos = Math.round((Date.now() - t0) / 1000);
    if (!r.ok || !j) {
      return { candidatos: [], acertou: null, descartados: 0, pesquisas: 0, custo: 0, tokens: 0, segundos, erro: j?.message ?? `HTTP ${r.status}` };
    }
    const handles: string[] = (j.candidatos ?? []).map((c: { handle: string }) => c.handle);
    return {
      candidatos: (j.candidatos ?? []).map((c: { handle: string; confianca: string }) => `@${c.handle} (${c.confianca})`),
      acertou: gabarito ? handles.includes(gabarito) : null,
      descartados: j.descartados ?? 0,
      pesquisas: j.pesquisas ?? 0,
      custo: j.custoUsd ?? 0,
      tokens: (j.tokens?.entrada ?? 0) + (j.tokens?.saida ?? 0),
      segundos,
    };
  }
  return { candidatos: [], acertou: null, descartados: 0, pesquisas: 0, custo: 0, tokens: 0, segundos: 0, erro: "limite de uso" };
}

export function TesteBuscaClient({ leads }: { leads: LeadTeste[] }) {
  const [res, setRes] = useState<Record<string, Partial<Record<Variante, Resultado>>>>({});
  const [rodando, setRodando] = useState<string | null>(null);

  async function rodar() {
    for (const lead of leads) {
      for (const v of VARIANTES) {
        if (res[lead.id]?.[v] && !res[lead.id]?.[v]?.erro) continue;
        setRodando(`${lead.id}:${v}`);
        const r = await buscar(lead.id, v, lead.gabarito);
        setRes((atual) => ({ ...atual, [lead.id]: { ...atual[lead.id], [v]: r } }));
      }
    }
    setRodando(null);
  }

  const resumo = VARIANTES.map((v) => {
    const feitos = leads.map((l) => res[l.id]?.[v]).filter((r): r is Resultado => Boolean(r && !r.erro));
    const comGabarito = leads.filter((l) => l.gabarito && res[l.id]?.[v] && !res[l.id]?.[v]?.erro);
    return {
      v,
      feitos: feitos.length,
      acertos: comGabarito.filter((l) => res[l.id]?.[v]?.acertou).length,
      comGabarito: comGabarito.length,
      custo: feitos.reduce((t, r) => t + r.custo, 0),
      tokens: feitos.length ? Math.round(feitos.reduce((t, r) => t + r.tokens, 0) / feitos.length) : 0,
      segundos: feitos.length ? Math.round(feitos.reduce((t, r) => t + r.segundos, 0) / feitos.length) : 0,
      descartados: feitos.reduce((t, r) => t + r.descartados, 0),
    };
  });

  return (
    <div className="space-y-4">
      <Button onClick={rodar} disabled={rodando !== null}>
        {rodando ? "Rodando…" : Object.keys(res).length ? "Continuar / refazer os que falharam" : "Rodar teste (~US$ 4)"}
      </Button>

      <div className="grid gap-2 sm:grid-cols-2">
        {resumo.map((s) => (
          <div key={s.v} className="border border-line p-3 text-sm">
            <p className="font-medium">{NOME[s.v]}</p>
            <p>Acertou o @: {s.acertos} de {s.comGabarito} · buscas feitas: {s.feitos}</p>
            <p>Custo total: US$ {s.custo.toFixed(3)} · média de tokens: {s.tokens.toLocaleString("pt-BR")}</p>
            <p>Tempo médio: {s.segundos}s · @ descartados pela trava: {s.descartados}</p>
          </div>
        ))}
      </div>

      <ul className="space-y-2">
        {leads.map((l) => (
          <li key={l.id} className="border border-line p-3 text-sm space-y-1">
            <p className="font-medium">{l.nome}</p>
            <p className="text-muted">{l.grupo} · gabarito: {l.gabarito ? `@${l.gabarito}` : "nenhum"}</p>
            {VARIANTES.map((v) => {
              const r = res[l.id]?.[v];
              const agora = rodando === `${l.id}:${v}`;
              return (
                <p key={v}>
                  <span className="font-medium">{NOME[v]}:</span>{" "}
                  {agora
                    ? "buscando…"
                    : !r
                      ? "—"
                      : r.erro
                        ? `erro: ${r.erro}`
                        : `${r.acertou === true ? "✅" : r.acertou === false ? "❌" : "·"} ${r.candidatos.join(", ") || "nenhum candidato"} · US$ ${r.custo.toFixed(3)} · ${r.tokens.toLocaleString("pt-BR")} tokens · ${r.segundos}s${r.descartados ? ` · ${r.descartados} descartado(s)` : ""}`}
                </p>
              );
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}
