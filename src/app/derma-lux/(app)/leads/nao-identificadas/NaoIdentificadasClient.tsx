"use client";

import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export type LeadOpcao = {
  id: string;
  nome: string;
  detalhe: string;
  /** Tudo que dá para digitar para achar o lead, já em minúsculas. */
  busca: string;
};

type Conversa = {
  lid: string;
  total: number;
  recebidas: number;
  enviadas: number;
  primeira: string | null;
  ultima: string | null;
  nome: string | null;
  trechos: { fromMe: boolean; sentAt: string; texto: string | null }[];
};

type Lista = { conversas: Conversa[]; paginas: number; chegouAoFim: boolean };

const DATA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

function quando(iso: string | null): string {
  return iso ? DATA.format(new Date(iso)) : "—";
}

export function NaoIdentificadasClient({ leads }: { leads: LeadOpcao[] }) {
  const [carregando, setCarregando] = useState(false);
  const [lista, setLista] = useState<Lista | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [vinculadas, setVinculadas] = useState<Record<string, string>>({});

  async function procurar() {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/whatsapp/nao-identificadas");
      const json = await res.json().catch(() => null);
      if (!res.ok) setErro(json?.message ?? json?.error ?? `Erro ${res.status}`);
      else setLista(json as Lista);
    } catch {
      setErro("A resposta não chegou. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  }

  const pendentes = lista?.conversas.filter((c) => !vinculadas[c.lid]) ?? [];

  return (
    <div>
      <Button onClick={procurar} loading={carregando}>
        {lista ? "Procurar de novo" : "Procurar conversas"}
      </Button>
      {carregando ? (
        <p className="text-xs text-muted mt-2">
          Lendo o histórico inteiro do WhatsApp — leva até um minuto.
        </p>
      ) : null}
      {erro ? (
        <Alert variant="danger" className="mt-4">
          {erro}
        </Alert>
      ) : null}

      {lista ? (
        <div className="mt-6">
          <p className="text-sm text-muted mb-3">
            {pendentes.length === 0
              ? "Nenhuma conversa sem identificação."
              : `${pendentes.length} conversa(s) sem identificação, da mais recente para a mais antiga.`}
            {lista.chegouAoFim
              ? ""
              : " A leitura parou pelo tempo antes do fim do histórico — procure de novo depois de vincular estas."}
          </p>

          {Object.entries(vinculadas).length > 0 ? (
            <Alert variant="info" className="mb-4">
              {Object.values(vinculadas).map((texto, i) => (
                <p key={i}>{texto}</p>
              ))}
            </Alert>
          ) : null}

          <ul className="space-y-3">
            {pendentes.map((c) => (
              <ConversaItem
                key={c.lid}
                conversa={c}
                leads={leads}
                aoVincular={(texto) =>
                  setVinculadas((v) => ({ ...v, [c.lid]: texto }))
                }
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ConversaItem({
  conversa: c,
  leads,
  aoVincular,
}: {
  conversa: Conversa;
  leads: LeadOpcao[];
  aoVincular: (texto: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<LeadOpcao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const opcoes = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (termo.length < 2) return [];
    return leads.filter((l) => l.busca.includes(termo)).slice(0, 8);
  }, [busca, leads]);

  async function vincular() {
    if (!escolhido) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/whatsapp/nao-identificadas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lid: c.lid, leadId: escolhido.id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(json?.message ?? json?.error ?? `Erro ${res.status}`);
        return;
      }
      aoVincular(
        json?.aviso ??
          `${escolhido.nome}: vinculada — ${json?.gravadas ?? 0} mensagem(ns) trazida(s)${
            json?.completo ? "" : " (o resto chega no próximo \"Reler tudo\")"
          }.`,
      );
    } catch {
      setErro("A resposta não chegou. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <li className="bg-paper border border-line p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-lg text-ink tracking-tight">
          {c.nome ?? "Contato sem nome"}
        </span>
        <span className="text-xs text-muted shrink-0">{quando(c.ultima)}</span>
      </div>
      <p className="text-xs text-muted mt-0.5">
        {c.enviadas} enviada(s) por você · {c.recebidas} recebida(s) · desde{" "}
        {quando(c.primeira)}
      </p>

      {c.trechos.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {c.trechos.map((t, i) => (
            <li
              key={i}
              className={cn(
                "text-sm px-2 py-1 border",
                t.fromMe ? "bg-brand/5 border-brand/20" : "bg-line/40 border-line",
              )}
            >
              <span className="text-xs text-muted">
                {t.fromMe ? "Você" : "Contato"} · {quando(t.sentAt)} —{" "}
              </span>
              {t.texto}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted mt-2">Só mídia, sem texto.</p>
      )}

      <div className="mt-3">
        {escolhido ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">
              Vincular a <strong>{escolhido.nome}</strong>
              {escolhido.detalhe ? (
                <span className="text-muted"> ({escolhido.detalhe})</span>
              ) : null}
              ?
            </span>
            <Button size="sm" onClick={vincular} loading={salvando}>
              Confirmar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEscolhido(null)}
              disabled={salvando}
            >
              Trocar
            </Button>
          </div>
        ) : (
          <>
            {/* text-base no celular: abaixo de 16px o Safari dá zoom no foco. */}
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="A qual lead pertence? Digite nome, clínica, cidade ou telefone"
              className="w-full px-3 py-2 text-base sm:text-sm bg-paper border border-line focus:border-ink focus:outline-none"
            />
            {opcoes.length > 0 ? (
              <ul className="mt-1 border border-line divide-y divide-line">
                {opcoes.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => setEscolhido(l)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-line/40"
                    >
                      {l.nome}
                      {l.detalhe ? (
                        <span className="text-muted"> · {l.detalhe}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
        {erro ? <p className="text-sm text-accent mt-2">{erro}</p> : null}
      </div>
    </li>
  );
}
