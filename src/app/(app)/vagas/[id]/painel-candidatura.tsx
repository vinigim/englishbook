"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { criarCandidatura, mudarStatus, salvarDetalhesCandidatura } from "@/app/actions";
import { Alerta, Button, Card } from "@/components/ui";
import { RESULTADO_LABEL, RESULTADOS, STATUS, STATUS_LABEL, type Resultado, type Status } from "@/lib/tipos";
import { dataHora } from "@/lib/utils";

type Evento = { id: string; tipo: string; de_status: string | null; para_status: string | null; texto: string | null; created_at: string };
type Candidatura = {
  id: string;
  status: Status;
  resultado: Resultado | null;
  aplicada_em: string | null;
  proximo_followup: string | null;
  contatos: string;
  notas: string;
  candidatura_eventos: Evento[];
};

export function PainelCandidatura({ vagaId, candidatura }: { vagaId: string; candidatura: Candidatura | null }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [f, setF] = useState({
    aplicada_em: candidatura?.aplicada_em ?? "",
    proximo_followup: candidatura?.proximo_followup ?? "",
    contatos: candidatura?.contatos ?? "",
    notas: candidatura?.notas ?? "",
    nova_nota: "",
  });

  const rodar = (fn: () => Promise<{ ok: boolean; error?: string }>, depois?: () => void) =>
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) return setErro(r.error ?? "Erro");
      setErro(null);
      depois?.();
      router.refresh();
    });

  if (!candidatura) {
    return (
      <Card className="h-fit space-y-3">
        <h2 className="font-semibold">Acompanhamento</h2>
        <p className="text-sm text-slate-500">Coloque a vaga no seu funil para acompanhar o status.</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={pendente} onClick={() => rodar(() => criarCandidatura(vagaId, "aplicado"))}>
            ✅ Já me candidatei
          </Button>
          <Button variante="secundario" disabled={pendente} onClick={() => rodar(() => criarCandidatura(vagaId, "interessado"))}>
            ⭐ Tenho interesse
          </Button>
        </div>
        {erro && <Alerta tipo="erro">{erro}</Alerta>}
      </Card>
    );
  }

  const eventos = [...candidatura.candidatura_eventos].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <Card className="h-fit space-y-3">
      <h2 className="font-semibold">Acompanhamento</h2>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Status</label>
          <select
            className="input"
            value={candidatura.status}
            disabled={pendente}
            onChange={(e) => rodar(() => mudarStatus({ id: candidatura.id, status: e.target.value as Status, resultado: candidatura.resultado }))}
          >
            {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        {candidatura.status === "encerrado" && (
          <div>
            <label className="label">Resultado</label>
            <select
              className="input"
              value={candidatura.resultado ?? ""}
              disabled={pendente}
              onChange={(e) => rodar(() => mudarStatus({ id: candidatura.id, status: "encerrado", resultado: (e.target.value || null) as Resultado | null }))}
            >
              <option value="">—</option>
              {RESULTADOS.map((r) => <option key={r} value={r}>{RESULTADO_LABEL[r]}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label">Aplicada em</label>
          <input type="date" className="input" value={f.aplicada_em} onChange={(e) => setF({ ...f, aplicada_em: e.target.value })} />
        </div>
        <div>
          <label className="label">Próximo follow-up</label>
          <input type="date" className="input" value={f.proximo_followup} onChange={(e) => setF({ ...f, proximo_followup: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="label">Contatos (recrutador, e-mail, LinkedIn)</label>
        <textarea className="input h-16" value={f.contatos} onChange={(e) => setF({ ...f, contatos: e.target.value })} />
      </div>
      <div>
        <label className="label">Notas gerais</label>
        <textarea className="input h-20" value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
      </div>
      <div>
        <label className="label">Registrar acontecimento na linha do tempo</label>
        <input className="input" placeholder="Ex.: recrutadora ligou, entrevista técnica marcada para 25/10" value={f.nova_nota} onChange={(e) => setF({ ...f, nova_nota: e.target.value })} />
      </div>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      <div className="flex items-center gap-2">
        <Button
          disabled={pendente}
          onClick={() =>
            rodar(
              () => salvarDetalhesCandidatura({
                id: candidatura.id,
                ...f,
                aplicada_em: f.aplicada_em || null,
                proximo_followup: f.proximo_followup || null,
              }),
              () => { setF((x) => ({ ...x, nova_nota: "" })); setSalvo(true); setTimeout(() => setSalvo(false), 2000); },
            )
          }
        >
          Salvar
        </Button>
        {salvo && <span className="text-xs text-emerald-600">Salvo ✓</span>}
      </div>

      <div className="border-t border-slate-100 pt-3">
        <p className="mb-2 text-xs font-medium uppercase text-slate-500">Linha do tempo</p>
        <ol className="space-y-2">
          {eventos.map((e) => (
            <li key={e.id} className="text-sm">
              <span className="text-xs text-slate-400">{dataHora(e.created_at)}</span>
              <p>
                {e.tipo === "status"
                  ? `${e.de_status ? `${STATUS_LABEL[e.de_status as Status]} → ` : ""}${STATUS_LABEL[e.para_status as Status]}${e.texto ? ` (${RESULTADO_LABEL[e.texto as Resultado] ?? e.texto})` : ""}`
                  : e.texto}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
