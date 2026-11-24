"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatPhoneBR } from "../../../leads-shared";
import {
  acharLeadParaJuntar,
  juntarLeads,
  type LeadParaJuntar,
} from "../../../leads-actions";

/**
 * "Juntar com outro lead": a mesma pessoa em dois números, típico de quando a
 * recepção passa o particular do médico. Este lead entra no outro: conversa,
 * locações e número vão para lá, e este deixa de existir. Mensagem nova
 * neste número cai no outro lead (`telefones_anteriores`).
 *
 * Duas etapas: acha o lead pelo número e mostra quem é; só junta depois da
 * confirmação, porque não dá para desfazer.
 */
export function JuntarLead({ leadId, nomeAtual }: { leadId: string; nomeAtual: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [numero, setNumero] = useState("");
  const [achado, setAchado] = useState<LeadParaJuntar | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, start] = useTransition();

  function fechar() {
    setAberto(false);
    setNumero("");
    setAchado(null);
    setErro(null);
  }

  function procurar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAchado(null);
    start(async () => {
      const r = await acharLeadParaJuntar(leadId, numero);
      if (!r.ok || !r.lead) setErro(r.error ?? "Não achei.");
      else setAchado(r.lead);
    });
  }

  function juntar() {
    if (!achado) return;
    setErro(null);
    start(async () => {
      const r = await juntarLeads(leadId, achado.id);
      if (!r.ok) {
        setErro(r.error ?? "Não consegui juntar.");
        return;
      }
      // Este lead não existe mais: vai para o que ficou.
      router.replace(`/derma-lux/leads/${achado.id}`);
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-xs text-muted underline hover:text-ink"
      >
        Juntar com outro lead
      </button>
    );
  }

  return (
    <div className="text-xs text-muted mt-1.5 space-y-1.5 max-w-xs">
      {achado ? (
        <>
          <p className="text-ink">
            Juntar <strong>{nomeAtual}</strong> em{" "}
            <strong>{achado.nome}</strong> ({formatPhoneBR(achado.telefone)},{" "}
            {achado.mensagens} mensagens, {achado.locacoes} locações)?
          </p>
          <p>
            A conversa, as locações e o número deste lead passam para{" "}
            {achado.nome}, e este lead deixa de existir. Mensagem nova neste
            número cai lá. Não dá para desfazer.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={pendente} onClick={juntar}>
              {pendente ? "Juntando…" : "Juntar"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={fechar}>
              Cancelar
            </Button>
          </div>
        </>
      ) : (
        <form onSubmit={procurar} className="space-y-1.5">
          <Input
            type="tel"
            inputMode="tel"
            autoFocus
            placeholder="Número do outro lead, com DDD"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            className="h-9 text-sm"
          />
          <p>Ex.: na ficha do número da clínica, digite o particular do médico.</p>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pendente || !numero.trim()}>
              {pendente ? "Procurando…" : "Procurar"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={fechar}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
      {erro ? <p className="text-accent font-medium">{erro}</p> : null}
    </div>
  );
}
