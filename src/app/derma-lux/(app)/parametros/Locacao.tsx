"use client";

import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import {
  MODOS_EMISSAO,
  MODOS_VARREDURA,
  realizadoAPartirDe,
  type ConsultaGravada,
  type ParametrosRealizados,
  type RespostaConsulta,
  type VinculoLocacao,
} from "@/lib/laser/tipos";

const CAMPO =
  "w-full h-11 px-3 bg-paper border border-line text-ink focus:outline-none focus:border-ink";

/** "2026-10-08" → "08/10/2026", sem passar por Date (que mudaria o dia pelo fuso). */
export function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function rotuloLocacao(l: VinculoLocacao): string {
  return [dataBR(l.data), l.medico, l.equipamento].filter(Boolean).join(" · ");
}

/** Equipamento de CO2, pelo nome cadastrado na agenda. */
function ehCo2(l: VinculoLocacao): boolean {
  return /co2|co₂|smartxide|punto/i.test(l.equipamento ?? "");
}

// ============================================================================
//  Seletor de locação
// ============================================================================
export function SeletorLocacao({
  locacoes,
  valor,
  onChange,
  id = "locacao",
}: {
  locacoes: VinculoLocacao[];
  valor: string | null;
  onChange: (id: string | null) => void;
  id?: string;
}) {
  const [busca, setBusca] = useState("");
  const temCo2 = locacoes.some(ehCo2);
  const [soCo2, setSoCo2] = useState(temCo2);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return locacoes.filter(
      (l) =>
        (!soCo2 || ehCo2(l) || l.id === valor) &&
        (!termo || l.medico.toLowerCase().includes(termo) || l.id === valor),
    );
  }, [locacoes, busca, soCo2, valor]);

  if (locacoes.length === 0) {
    return (
      <p className="text-xs text-muted">
        Nenhuma locação entre os últimos 90 dias e os próximos 60.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        placeholder="Buscar médico"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        aria-label="Buscar médico na lista de locações"
      />
      <select
        id={id}
        className={CAMPO}
        value={valor ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Sem locação</option>
        {filtradas.map((l) => (
          <option key={l.id} value={l.id}>
            {rotuloLocacao(l)}
          </option>
        ))}
      </select>
      {temCo2 ? (
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={soCo2} onChange={(e) => setSoCo2(e.target.checked)} />
          Só locações de CO2
        </label>
      ) : null}
    </div>
  );
}

// ============================================================================
//  Chamadas à rota de atualização
// ============================================================================
async function atualizar(
  id: string,
  corpo: { rentalId?: string | null; realizado?: ParametrosRealizados | null },
): Promise<{ ok: true; consulta: ConsultaGravada } | { ok: false; erro: string }> {
  try {
    const res = await fetch(`/api/laser/consultas/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.consulta) {
      return { ok: false, erro: json.message ?? json.error ?? "Falha ao salvar." };
    }
    return { ok: true, consulta: json.consulta as ConsultaGravada };
  } catch {
    return { ok: false, erro: "Falha de rede ao salvar." };
  }
}

// ============================================================================
//  Vínculo no resultado
// ============================================================================
export function VinculoDaConsulta({
  resposta,
  locacoes,
  onAtualizada,
}: {
  resposta: RespostaConsulta;
  locacoes: VinculoLocacao[];
  onAtualizada: (c: ConsultaGravada) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [escolha, setEscolha] = useState<string | null>(resposta.locacao?.id ?? null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!resposta.id) return null;

  // A locação ligada pode estar fora da janela do seletor (consulta antiga).
  const opcoes =
    resposta.locacao && !locacoes.some((l) => l.id === resposta.locacao!.id)
      ? [resposta.locacao, ...locacoes]
      : locacoes;

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await atualizar(resposta.id!, { rentalId: escolha });
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    setEditando(false);
    onAtualizada(r.consulta);
  }

  return (
    <div className="text-sm">
      {!editando ? (
        <p className="text-ink">
          <span className="text-muted">Locação: </span>
          {resposta.locacao ? rotuloLocacao(resposta.locacao) : "não ligada"}
          <button
            type="button"
            className="ml-2 text-xs text-accent underline hover:text-ink"
            onClick={() => {
              setEscolha(resposta.locacao?.id ?? null);
              setEditando(true);
            }}
          >
            {resposta.locacao ? "Trocar" : "Ligar a uma locação"}
          </button>
        </p>
      ) : (
        <div className="space-y-2">
          <SeletorLocacao
            id="locacao-resultado"
            locacoes={opcoes}
            valor={escolha}
            onChange={setEscolha}
          />
          <div className="flex gap-2">
            <Button size="sm" loading={salvando} onClick={salvar}>
              Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {erro ? <p className="text-xs text-accent mt-1">{erro}</p> : null}
    </div>
  );
}

// ============================================================================
//  Parâmetros realizados
// ============================================================================
const REGISTRADO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function ParametrosRealizadosCard({
  resposta,
  onAtualizada,
}: {
  resposta: RespostaConsulta;
  onAtualizada: (c: ConsultaGravada) => void;
}) {
  const [rascunho, setRascunho] = useState<ParametrosRealizados | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!resposta.id || resposta.bloqueadoPor || !resposta.recomendacao.parametros) {
    return null;
  }

  const r = resposta.realizado;
  const recomendado = realizadoAPartirDe(resposta.recomendacao);

  async function salvar(valor: ParametrosRealizados | null) {
    setSalvando(true);
    setErro(null);
    const res = await atualizar(resposta.id!, { realizado: valor });
    setSalvando(false);
    if (!res.ok) return setErro(res.erro);
    setRascunho(null);
    onAtualizada(res.consulta);
  }

  // --- Editando ---------------------------------------------------------------
  if (rascunho) {
    const set = <K extends keyof ParametrosRealizados>(k: K, v: ParametrosRealizados[K]) =>
      setRascunho((x) => (x ? { ...x, [k]: v } : x));
    const num = (v: string) => (v === "" ? null : Number(v));
    return (
      <div className="border border-line p-4 space-y-3 text-sm">
        <h3 className="font-display text-lg text-ink tracking-tight">O que foi usado</h3>
        <p className="text-xs text-muted">
          Já vem com o recomendado. Corrija só o que o médico mudou.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs mb-1">Modo</Label>
            <select className={CAMPO} value={rascunho.modo ?? ""} onChange={(e) => set("modo", (e.target.value || null) as ParametrosRealizados["modo"])}>
              <option value="">—</option>
              {MODOS_EMISSAO.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <Campo rotulo="Potência (W)" valor={rascunho.potencia} onChange={(v) => set("potencia", num(v))} />
          <Campo rotulo="Dwell (µs)" valor={rascunho.dwell} onChange={(v) => set("dwell", num(v))} />
          <Campo rotulo="Spacing (µm)" valor={rascunho.spacing} onChange={(v) => set("spacing", num(v))} />
          <Campo rotulo="SmartStack" valor={rascunho.stack} onChange={(v) => set("stack", num(v))} />
          <div>
            <Label className="text-xs mb-1">Varredura</Label>
            <select className={CAMPO} value={rascunho.varredura ?? ""} onChange={(e) => set("varredura", (e.target.value || null) as ParametrosRealizados["varredura"])}>
              <option value="">—</option>
              {MODOS_VARREDURA.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <Campo rotulo="Passadas" valor={rascunho.passadas} onChange={(v) => set("passadas", num(v))} />
        </div>
        <textarea
          className={cn(CAMPO, "h-16 py-2 text-sm")}
          placeholder="Notas: como a pele reagiu na hora, por que mudou algo (opcional)"
          value={rascunho.notas}
          maxLength={1000}
          onChange={(e) => set("notas", e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" loading={salvando} onClick={() => salvar(rascunho)}>
            Salvar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRascunho(null)}>
            Cancelar
          </Button>
          {r ? (
            <Button size="sm" variant="danger" loading={salvando} onClick={() => salvar(null)}>
              Apagar registro
            </Button>
          ) : null}
        </div>
        {erro ? <Alert variant="danger">{erro}</Alert> : null}
      </div>
    );
  }

  // --- Sem registro -------------------------------------------------------------
  if (!r) {
    return (
      <div className="border border-dashed border-line p-4 text-sm flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">
          Depois da sessão, registre o que o médico usou. É isso que você vai
          rever na próxima vez.
        </p>
        <Button size="sm" variant="secondary" onClick={() => setRascunho(recomendado)}>
          Registrar o que foi usado
        </Button>
        {erro ? <p className="text-xs text-accent w-full">{erro}</p> : null}
      </div>
    );
  }

  // --- Registro existente, comparado com o recomendado -----------------------
  const linhas: [string, string | number | null, string | number | null, string][] = [
    ["Modo", r.modo, recomendado.modo, ""],
    ["Potência", r.potencia, recomendado.potencia, " W"],
    ["Dwell", r.dwell, recomendado.dwell, " µs"],
    ["Spacing", r.spacing, recomendado.spacing, " µm"],
    ["SmartStack", r.stack, recomendado.stack, ""],
    ["Varredura", r.varredura, recomendado.varredura, ""],
    ["Passadas", r.passadas, recomendado.passadas, ""],
  ];
  return (
    <div className="border border-ink p-4 text-sm space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-ink tracking-tight">O que foi usado</h3>
        {r.registradoEm ? (
          <span className="text-xs text-muted">
            registrado em {REGISTRADO.format(new Date(r.registradoEm))}
          </span>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
        {linhas.map(([nome, usado, rec, u]) => {
          const mudou = usado != null && rec != null && usado !== rec;
          return (
            <div key={nome}>
              <dt className="text-xs text-muted">{nome}</dt>
              <dd className={cn("text-ink", mudou && "font-semibold text-accent")}>
                {usado != null ? `${usado}${u}` : "—"}
                {mudou ? (
                  <span className="block text-[11px] font-normal text-muted">
                    recomendado {rec}
                    {u}
                  </span>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
      {r.notas ? <p className="text-ink/80">{r.notas}</p> : null}
      <button
        type="button"
        className="text-xs text-accent underline hover:text-ink"
        onClick={() => setRascunho(r)}
      >
        Editar
      </button>
      {erro ? <p className="text-xs text-accent">{erro}</p> : null}
    </div>
  );
}

function Campo({
  rotulo,
  valor,
  onChange,
}: {
  rotulo: string;
  valor: number | null;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs mb-1">{rotulo}</Label>
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        value={valor ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
