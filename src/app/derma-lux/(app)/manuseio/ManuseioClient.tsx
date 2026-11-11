"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { PROCEDIMENTOS, type Procedimento } from "./procedimentos";

const CHAVE = (id: string) => `lux-manuseio:${id}`;

// O progresso é só uma conveniência de quem está com o celular na mão: fica
// no navegador e some sem prejuízo (aba anônima, dados apagados).
function ler(id: string): string[] {
  try {
    const bruto = localStorage.getItem(CHAVE(id));
    const lista: unknown = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function gravar(id: string, feitos: string[]) {
  try {
    if (feitos.length) localStorage.setItem(CHAVE(id), JSON.stringify(feitos));
    else localStorage.removeItem(CHAVE(id));
  } catch {
    // sem armazenamento: o checklist funciona, só não lembra
  }
}

export type LocacaoOpcao = {
  id: string;
  cliente: string;
  endereco: string;
  data: string; // AAAA-MM-DD
  equipamento: string | null;
};

export function ManuseioClient({
  locacoes,
  hoje,
}: {
  locacoes: LocacaoOpcao[];
  hoje: string;
}) {
  const [ativo, setAtivo] = useState(PROCEDIMENTOS[0].id);
  const [feitos, setFeitos] = useState<Record<string, string[]>>({});

  useEffect(() => {
    setFeitos(Object.fromEntries(PROCEDIMENTOS.map((p) => [p.id, ler(p.id)])));
  }, []);

  const proc = PROCEDIMENTOS.find((p) => p.id === ativo) ?? PROCEDIMENTOS[0];

  function alternar(passoId: string) {
    setFeitos((atual) => {
      const lista = atual[proc.id] ?? [];
      const nova = lista.includes(passoId)
        ? lista.filter((x) => x !== passoId)
        : [...lista, passoId];
      gravar(proc.id, nova);
      return { ...atual, [proc.id]: nova };
    });
  }

  function recomecar() {
    gravar(proc.id, []);
    setFeitos((atual) => ({ ...atual, [proc.id]: [] }));
  }

  return (
    <div className="max-w-2xl">
      <div className="flex gap-2 mb-5" role="tablist">
        {PROCEDIMENTOS.map((p) => {
          const { feitos: n, total } = contar(p, feitos[p.id] ?? []);
          return (
            <button
              key={p.id}
              role="tab"
              aria-selected={p.id === ativo}
              onClick={() => setAtivo(p.id)}
              className={cn(
                "flex-1 px-4 py-3 text-left border transition-colors",
                p.id === ativo
                  ? "bg-brand text-paper border-brand"
                  : "bg-paper text-ink border-line hover:border-brand/40",
              )}
            >
              <span className="block font-medium">{p.titulo}</span>
              <span
                className={cn(
                  "block text-xs mt-0.5",
                  p.id === ativo ? "text-paper/70" : "text-muted",
                )}
              >
                {n === total ? "Concluído" : `${n} de ${total} passos`}
              </span>
            </button>
          );
        })}
      </div>

      <Checklist
        proc={proc}
        feitos={feitos[proc.id] ?? []}
        onAlternar={alternar}
        onRecomecar={recomecar}
        locacoes={locacoes}
        hoje={hoje}
      />
    </div>
  );
}

function contar(p: Procedimento, feitos: string[]) {
  const ids = p.etapas.flatMap((e) => e.passos.map((x) => x.id));
  return { feitos: ids.filter((id) => feitos.includes(id)).length, total: ids.length };
}

function Checklist({
  proc,
  feitos,
  onAlternar,
  onRecomecar,
  locacoes,
  hoje,
}: {
  proc: Procedimento;
  feitos: string[];
  onAlternar: (id: string) => void;
  onRecomecar: () => void;
  locacoes: LocacaoOpcao[];
  hoje: string;
}) {
  const { feitos: n, total } = contar(proc, feitos);
  const proximo = useMemo(
    () =>
      proc.etapas
        .flatMap((e) => e.passos)
        .find((x) => !feitos.includes(x.id))?.id,
    [proc, feitos],
  );
  let numero = 0;

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-2">
        <p className="text-sm text-muted">{proc.resumo}</p>
        {n > 0 && (
          <button
            onClick={onRecomecar}
            className="text-sm text-accent hover:underline shrink-0"
          >
            Recomeçar
          </button>
        )}
      </div>
      <div className="h-2 bg-line mb-6" aria-hidden>
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${(n / total) * 100}%` }}
        />
      </div>

      {proc.etapas.map((etapa) => (
        <section key={etapa.titulo} className="mb-6">
          <h2 className="text-xs uppercase tracking-wider text-muted font-medium mb-2">
            {etapa.titulo}
          </h2>
          <ol className="space-y-2">
            {etapa.passos.map((passo) => {
              numero += 1;
              const feito = feitos.includes(passo.id);
              const eProximo = passo.id === proximo;
              return (
                <li key={passo.id}>
                  <button
                    onClick={() => onAlternar(passo.id)}
                    aria-pressed={feito}
                    className={cn(
                      "w-full flex items-start gap-3 p-3 text-left border transition-colors",
                      feito
                        ? "bg-paper border-line opacity-60"
                        : eProximo
                          ? "bg-paper border-brand shadow-[3px_3px_0_0_rgba(28,61,49,0.15)]"
                          : "bg-paper border-line hover:border-brand/40",
                      passo.seguranca && !feito && "border-l-4 border-l-accent",
                    )}
                  >
                    <span
                      className={cn(
                        "w-7 h-7 shrink-0 grid place-items-center border text-sm font-medium",
                        feito
                          ? "bg-brand border-brand text-paper"
                          : "border-ink/30 text-muted",
                      )}
                    >
                      {feito ? "✓" : numero}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span
                        className={cn(
                          "block text-ink",
                          feito && "line-through decoration-muted",
                        )}
                      >
                        {passo.texto}
                      </span>
                      {passo.nota && (
                        <span className="block text-sm text-muted mt-0.5">
                          {passo.nota}
                        </span>
                      )}
                      {passo.seguranca && (
                        <span className="inline-block mt-1 text-[11px] uppercase tracking-wider font-medium text-accent">
                          ⚠ Segurança
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {n === total && (
        <div className="bg-brand text-paper">
          <div className="p-4">
            <p className="font-medium">{proc.titulo} concluída ✓</p>
            <p className="text-sm text-paper/70 mt-0.5">
              Todos os {total} passos conferidos.
            </p>
          </div>
          <Enviar proc={proc} locacoes={locacoes} hoje={hoje} />
        </div>
      )}
    </div>
  );
}

function dataCurta(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function rotuloLocacao(l: LocacaoOpcao) {
  const partes = [l.cliente, l.endereco, l.equipamento].filter(Boolean);
  return `${dataCurta(l.data)} · ${partes.join(" · ")}`;
}

/** Texto do checklist preenchido, no formato do WhatsApp (*negrito*). */
function montarMensagem(
  proc: Procedimento,
  locacao: LocacaoOpcao | null,
  obs: string,
) {
  const agora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  const linhas = [`*Checklist de ${proc.titulo} do laser concluído ✅*`];
  if (locacao) {
    linhas.push(`Locação: ${locacao.cliente} (${dataCurta(locacao.data)})`);
    if (locacao.endereco) linhas.push(`Local: ${locacao.endereco}`);
    if (locacao.equipamento) linhas.push(`Equipamento: ${locacao.equipamento}`);
  }
  linhas.push(`Concluído em ${agora.replace(", ", " às ")}`);
  for (const etapa of proc.etapas) {
    linhas.push("", `*${etapa.titulo}*`);
    for (const p of etapa.passos) {
      linhas.push(`✅ ${p.texto}${p.seguranca ? " ⚠️" : ""}`);
    }
  }
  if (obs.trim()) linhas.push("", `*Observações:* ${obs.trim()}`);
  return linhas.join("\n");
}

function Enviar({
  proc,
  locacoes,
  hoje,
}: {
  proc: Procedimento;
  locacoes: LocacaoOpcao[];
  hoje: string;
}) {
  // Sugere a locação de hoje; se não houver, a primeira da janela.
  const padrao =
    locacoes.find((l) => l.data === hoje)?.id ?? locacoes[0]?.id ?? "";
  const [locacaoId, setLocacaoId] = useState(padrao);
  const [obs, setObs] = useState("");
  const [copiado, setCopiado] = useState(false);

  const locacao = locacoes.find((l) => l.id === locacaoId) ?? null;

  function enviar() {
    const texto = encodeURIComponent(montarMensagem(proc, locacao, obs));
    // Sem número: o WhatsApp pede o contato. No celular, whatsapp:// abre o
    // app (e a escolha entre WhatsApp e Business), como na tela de leads.
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      window.location.href = `whatsapp://send?text=${texto}`;
    } else {
      window.open(`https://wa.me/?text=${texto}`, "_blank");
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(montarMensagem(proc, locacao, obs));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // navegador sem permissão de área de transferência
    }
  }

  return (
    <div className="border-t border-paper/15 p-4 space-y-3">
      <label className="block">
        <span className="block text-xs uppercase tracking-wider text-paper/70 mb-1">
          Locação
        </span>
        <select
          value={locacaoId}
          onChange={(e) => setLocacaoId(e.target.value)}
          className="w-full bg-paper text-ink px-3 py-2 text-base"
        >
          <option value="">Sem vincular a uma locação</option>
          {locacoes.map((l) => (
            <option key={l.id} value={l.id}>
              {rotuloLocacao(l)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block text-xs uppercase tracking-wider text-paper/70 mb-1">
          Observações (opcional)
        </span>
        <textarea
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          rows={2}
          placeholder="Ex.: usamos a extensão; ponteira cirúrgica"
          className="w-full bg-paper text-ink px-3 py-2 text-base"
        />
      </label>
      <div className="flex gap-2">
        <button
          onClick={enviar}
          className="flex-1 bg-accent text-paper font-medium px-4 py-3 hover:brightness-110"
        >
          Enviar no WhatsApp
        </button>
        <button
          onClick={copiar}
          className="px-4 py-3 border border-paper/30 text-paper text-sm hover:border-paper"
        >
          {copiado ? "Copiado ✓" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
