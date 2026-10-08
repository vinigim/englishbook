"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import {
  ComparaDwell,
  ComparaModo,
  ComparaPotencia,
  ComparaSpacing,
  ComparaStack,
  type PerfilBase,
} from "./IlustracaoPele";
import {
  DOWNTIMES,
  DOWNTIME_LABEL,
  FOTOTIPOS,
  FOTOTIPO_LABEL,
  GRAVIDADES,
  HISTORICOS,
  HISTORICO_LABEL,
  INDICACOES,
  INDICACAO_LABEL,
  REGIOES,
  REGIAO_LABEL,
  VIABILIDADE_LABEL,
  type EntradaConsulta,
  type Historico,
  type ParametroNumerico,
  type Recomendacao,
  type RespostaConsulta,
} from "@/lib/laser/tipos";

export type FonteInfo = { titulo: string; origem: string; url: string | null };

export type ConsultaGravada = {
  createdAt: string;
  entrada: EntradaConsulta;
  resposta: RespostaConsulta;
};

const ENTRADA_INICIAL: EntradaConsulta = {
  indicacao: "rejuvenescimento_moderado",
  regiao: "face_total",
  fototipo: "III",
  gravidade: "moderada",
  downtime: "moderado",
  sessao: "primeira",
  respostaAnterior: "",
  idade: null,
  historico: [],
  observacoes: "",
};

const SELECT_CLASS =
  "w-full h-11 px-3 bg-paper border border-line text-ink focus:outline-none focus:border-ink";

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function ParametrosClient({
  historico,
  fontes,
  semTabela,
}: {
  historico: ConsultaGravada[];
  fontes: Record<string, FonteInfo>;
  semTabela: boolean;
}) {
  const router = useRouter();
  const [entrada, setEntrada] = useState<EntradaConsulta>(ENTRADA_INICIAL);
  const [resposta, setResposta] = useState<RespostaConsulta | null>(null);
  const [entradaDaResposta, setEntradaDaResposta] =
    useState<EntradaConsulta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function set<K extends keyof EntradaConsulta>(k: K, v: EntradaConsulta[K]) {
    setEntrada((e) => ({ ...e, [k]: v }));
  }

  function alternarHistorico(h: Historico) {
    setEntrada((e) => ({
      ...e,
      historico: e.historico.includes(h)
        ? e.historico.filter((x) => x !== h)
        : [...e.historico, h],
    }));
  }

  async function consultar(forcar = false) {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/laser/recomendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entrada, forcar }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(
          res.status === 403
            ? "Seu usuário não está liberado na equipe (lux_staff)."
            : (json.message ?? json.error ?? "Falha ao consultar a IA."),
        );
        return;
      }
      setResposta(json as RespostaConsulta);
      setEntradaDaResposta(entrada);
      router.refresh();
    } catch {
      setErro("Falha de rede ao consultar a IA. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  }

  function abrirDoHistorico(c: ConsultaGravada) {
    setEntrada(c.entrada);
    setResposta(c.resposta);
    setEntradaDaResposta(c.entrada);
    setErro(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-8">
      {semTabela ? (
        <Alert variant="warning" title="Histórico desligado">
          Rode a migração <code>0021_laser_consultas.sql</code> no Supabase para
          gravar as consultas e reaproveitar casos repetidos sem pagar de novo.
        </Alert>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* ------------------------------------------------------------ */}
        {/*  Formulário                                                   */}
        {/* ------------------------------------------------------------ */}
        <Card variant="bordered" className="space-y-4 h-fit">
          <div>
            <Label htmlFor="indicacao">Indicação</Label>
            <select
              id="indicacao"
              className={SELECT_CLASS}
              value={entrada.indicacao}
              onChange={(e) =>
                set("indicacao", e.target.value as EntradaConsulta["indicacao"])
              }
            >
              {INDICACOES.map((i) => (
                <option key={i} value={i}>
                  {INDICACAO_LABEL[i]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="regiao">Região</Label>
            <select
              id="regiao"
              className={SELECT_CLASS}
              value={entrada.regiao}
              onChange={(e) =>
                set("regiao", e.target.value as EntradaConsulta["regiao"])
              }
            >
              {REGIOES.map((r) => (
                <option key={r} value={r}>
                  {REGIAO_LABEL[r]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="fototipo">Fototipo (Fitzpatrick)</Label>
            <select
              id="fototipo"
              className={SELECT_CLASS}
              value={entrada.fototipo}
              onChange={(e) =>
                set("fototipo", e.target.value as EntradaConsulta["fototipo"])
              }
            >
              {FOTOTIPOS.map((f) => (
                <option key={f} value={f}>
                  {FOTOTIPO_LABEL[f]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="gravidade">Gravidade</Label>
              <select
                id="gravidade"
                className={SELECT_CLASS}
                value={entrada.gravidade}
                onChange={(e) =>
                  set("gravidade", e.target.value as EntradaConsulta["gravidade"])
                }
              >
                {GRAVIDADES.map((g) => (
                  <option key={g} value={g}>
                    {g[0].toUpperCase() + g.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="idade">Idade</Label>
              <Input
                id="idade"
                type="number"
                min={12}
                max={100}
                placeholder="opcional"
                value={entrada.idade ?? ""}
                onChange={(e) =>
                  set("idade", e.target.value ? Number(e.target.value) : null)
                }
              />
            </div>
          </div>

          <div>
            <Label htmlFor="downtime">Downtime aceito</Label>
            <select
              id="downtime"
              className={SELECT_CLASS}
              value={entrada.downtime}
              onChange={(e) =>
                set("downtime", e.target.value as EntradaConsulta["downtime"])
              }
            >
              {DOWNTIMES.map((d) => (
                <option key={d} value={d}>
                  {DOWNTIME_LABEL[d]}
                </option>
              ))}
            </select>
          </div>

          <fieldset>
            <Label>Sessão</Label>
            <div className="flex gap-4 text-sm text-ink">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="sessao"
                  checked={entrada.sessao === "primeira"}
                  onChange={() => set("sessao", "primeira")}
                />
                Primeira
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="sessao"
                  checked={entrada.sessao === "subsequente"}
                  onChange={() => set("sessao", "subsequente")}
                />
                Já fez sessão antes
              </label>
            </div>
            {entrada.sessao === "subsequente" ? (
              <textarea
                className={cn(SELECT_CLASS, "h-20 py-2 mt-2 text-sm")}
                placeholder="Parâmetros usados e como a pele respondeu (dias de eritema, mancha, resultado)"
                value={entrada.respostaAnterior}
                maxLength={1000}
                onChange={(e) => set("respostaAnterior", e.target.value)}
              />
            ) : null}
          </fieldset>

          <fieldset>
            <Label>Histórico e fatores de risco</Label>
            <div className="space-y-1.5 text-sm text-ink">
              {HISTORICOS.map((h) => (
                <label key={h} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={entrada.historico.includes(h)}
                    onChange={() => alternarHistorico(h)}
                  />
                  <span>{HISTORICO_LABEL[h]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <Label htmlFor="observacoes">Observações</Label>
            <textarea
              id="observacoes"
              className={cn(SELECT_CLASS, "h-24 py-2 text-sm")}
              placeholder="Detalhes do caso. Não escreva o nome do paciente."
              value={entrada.observacoes}
              maxLength={2000}
              onChange={(e) => set("observacoes", e.target.value)}
            />
          </div>

          <Button
            className="w-full"
            loading={carregando}
            onClick={() => consultar(false)}
          >
            {carregando ? "Analisando o caso…" : "Recomendar parâmetros"}
          </Button>
          {carregando ? (
            <p className="text-xs text-muted">
              A IA lê a base inteira sobre o aparelho antes de responder. Leva
              até 1 minuto.
            </p>
          ) : null}
        </Card>

        {/* ------------------------------------------------------------ */}
        {/*  Resultado                                                    */}
        {/* ------------------------------------------------------------ */}
        <div className="min-w-0 space-y-4">
          {erro ? (
            <Alert variant="danger" title="Não deu certo">
              {erro}
            </Alert>
          ) : null}

          {resposta && entradaDaResposta ? (
            <Resultado
              resposta={resposta}
              entrada={entradaDaResposta}
              fontes={fontes}
              carregando={carregando}
              onRefazer={() => consultar(true)}
              formularioMudou={
                JSON.stringify(entrada) !== JSON.stringify(entradaDaResposta)
              }
            />
          ) : !erro ? (
            <Card variant="bordered" className="text-sm text-muted">
              Preencha o caso ao lado. A resposta traz o modo de emissão,
              potência, dwell time, spacing, SmartStack, varredura e área, cada
              um com a faixa aceitável, o motivo e a fonte na base de
              conhecimento.
            </Card>
          ) : null}
        </div>
      </div>

      {/* -------------------------------------------------------------- */}
      {/*  Histórico                                                      */}
      {/* -------------------------------------------------------------- */}
      {historico.length > 0 ? (
        <section>
          <h2 className="font-display text-xl text-ink tracking-tight mb-3">
            Consultas anteriores
          </h2>
          <ul className="divide-y divide-line border border-line bg-paper">
            {historico.map((c) => (
              <li key={c.resposta.id ?? c.createdAt}>
                <button
                  type="button"
                  onClick={() => abrirDoHistorico(c)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-line/50 transition-colors",
                    "flex flex-wrap items-center gap-x-3 gap-y-1 text-sm",
                    resposta?.id === c.resposta.id && "bg-line/50",
                  )}
                >
                  <span className="text-muted tabular-nums">
                    {DATA_HORA.format(new Date(c.createdAt))}
                  </span>
                  <span className="text-ink font-medium">
                    {INDICACAO_LABEL[c.entrada.indicacao]}
                  </span>
                  <span className="text-muted">
                    {REGIAO_LABEL[c.entrada.regiao]} · fototipo{" "}
                    {c.entrada.fototipo}
                  </span>
                  <BadgeViabilidade v={c.resposta.recomendacao.viabilidade} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

// ============================================================================
//  Resultado
// ============================================================================
function BadgeViabilidade({ v }: { v: Recomendacao["viabilidade"] }) {
  const variant =
    v === "indicado" ? "success" : v === "nao_recomendado" ? "danger" : "warning";
  return <Badge variant={variant}>{VIABILIDADE_LABEL[v]}</Badge>;
}

function Resultado({
  resposta,
  entrada,
  fontes,
  carregando,
  onRefazer,
  formularioMudou,
}: {
  resposta: RespostaConsulta;
  entrada: EntradaConsulta;
  fontes: Record<string, FonteInfo>;
  carregando: boolean;
  onRefazer: () => void;
  formularioMudou: boolean;
}) {
  const r = resposta.recomendacao;
  const p = r.parametros;
  // Os desenhos variam um parâmetro por vez e mantêm os outros no recomendado.
  const base: PerfilBase | null = p
    ? {
        potencia: p.potencia_w.valor,
        dwell: p.dwell_time_us.valor,
        stack: Math.round(p.smartstack.valor),
        modo: p.modo_emissao.valor,
      }
    : null;

  return (
    <div className="space-y-4">
      <Card variant="elevated" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <BadgeViabilidade v={r.viabilidade} />
          <Badge variant="neutral">Confiança {r.confianca}</Badge>
          {resposta.reaproveitada ? (
            <Badge variant="info">Consulta gravada · sem custo</Badge>
          ) : resposta.model ? (
            <span className="text-xs text-muted">
              {resposta.model} · US$ {resposta.costUsd.toFixed(3)}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted">
          {INDICACAO_LABEL[entrada.indicacao]} · {REGIAO_LABEL[entrada.regiao]} ·
          fototipo {entrada.fototipo} · {entrada.sessao === "primeira" ? "1ª sessão" : "sessão subsequente"}
        </p>
        <p className="text-ink">{r.resumo}</p>
        {formularioMudou ? (
          <p className="text-xs text-accent">
            O formulário mudou desde esta resposta. Clique em “Recomendar
            parâmetros” para consultar o caso novo.
          </p>
        ) : null}
      </Card>

      {resposta.verificacoes.length > 0 ? (
        <Alert variant="danger" title="Verificação automática do sistema">
          <ul className="list-disc list-inside space-y-1">
            {resposta.verificacoes.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {r.alertas.length > 0 && !resposta.bloqueadoPor ? (
        <Alert variant="warning" title="Atenção neste caso">
          <ul className="list-disc list-inside space-y-1">
            {r.alertas.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {p ? (
        <Card variant="bordered" className="p-0">
          <h3 className="font-display text-xl text-ink tracking-tight px-6 pt-5 pb-3">
            Parâmetros
          </h3>
          <dl className="divide-y divide-line border-t border-line">
            <LinhaTexto
              nome="Modo de emissão"
              valor={p.modo_emissao.valor}
              motivo={p.modo_emissao.motivo}
              ilustracao={<ComparaModo base={base!} />}
            />
            <LinhaNumero
              nome="Potência"
              unidade="W"
              param={p.potencia_w}
              ilustracao={
                <ComparaPotencia
                  base={base!}
                  faixa={{ min: p.potencia_w.faixa_min, max: p.potencia_w.faixa_max }}
                />
              }
            />
            <LinhaNumero
              nome="Dwell time"
              unidade="µs"
              param={p.dwell_time_us}
              ilustracao={
                <ComparaDwell
                  base={base!}
                  faixa={{ min: p.dwell_time_us.faixa_min, max: p.dwell_time_us.faixa_max }}
                />
              }
            />
            <LinhaNumero
              nome="Spacing (DOT pitch)"
              unidade="µm"
              param={p.spacing_um}
              ilustracao={
                <ComparaSpacing
                  valor={p.spacing_um.valor}
                  faixa={{ min: p.spacing_um.faixa_min, max: p.spacing_um.faixa_max }}
                />
              }
            />
            <LinhaNumero
              nome="SmartStack"
              unidade=""
              param={p.smartstack}
              ilustracao={<ComparaStack base={base!} />}
            />
            <LinhaTexto nome="Varredura" valor={p.modo_varredura.valor} motivo={p.modo_varredura.motivo} />
            <LinhaTexto nome="Forma da área" valor={p.forma_area.valor} motivo={p.forma_area.motivo} />
            <LinhaTexto
              nome="Passadas"
              valor={String(p.passadas.valor)}
              motivo={p.passadas.motivo}
            />
          </dl>
        </Card>
      ) : null}

      {!resposta.bloqueadoPor ? (
        <Card variant="bordered" className="space-y-4 text-sm">
          <Bloco titulo="Protocolo">
            <ul className="space-y-1">
              <li><b>Sessões:</b> {r.protocolo.sessoes}</li>
              <li><b>Intervalo:</b> {r.protocolo.intervalo}</li>
              <li><b>Teste prévio:</b> {r.protocolo.teste_previo}</li>
              <li><b>Na próxima sessão:</b> {r.protocolo.como_progredir}</li>
            </ul>
          </Bloco>
          <Lista titulo="Antes da sessão" itens={r.cuidados_pre} />
          <Lista titulo="Depois da sessão" itens={r.cuidados_pos} />
          <Lista titulo="Alternativas e combinações" itens={r.alternativas} />
        </Card>
      ) : null}

      <Card variant="bordered" className="space-y-2 text-sm">
        <h3 className="font-display text-lg text-ink tracking-tight">
          De onde veio
        </h3>
        <p className="text-muted">{r.motivo_confianca}</p>
        <ul className="space-y-1">
          {r.fontes.map((id) => {
            const f = fontes[id];
            if (!f) return null;
            return (
              <li key={id} className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral">{f.origem}</Badge>
                {f.url ? (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-ink hover:text-accent"
                  >
                    {f.titulo}
                  </a>
                ) : (
                  <span className="text-ink">{f.titulo}</span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {resposta.reaproveitada && !resposta.bloqueadoPor ? (
        <Button variant="secondary" size="sm" loading={carregando} onClick={onRefazer}>
          Perguntar de novo à IA
        </Button>
      ) : null}
    </div>
  );
}

function LinhaNumero({
  nome,
  unidade,
  param,
  ilustracao,
}: {
  nome: string;
  unidade: string;
  param: ParametroNumerico;
  ilustracao?: React.ReactNode;
}) {
  const u = unidade ? ` ${unidade}` : "";
  return (
    <div className="px-6 py-3 grid gap-1 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted">{nome}</dt>
      <dd>
        <p className="text-ink">
          <span className="font-display text-xl">
            {param.valor}
            {u}
          </span>
          <span className="text-xs text-muted ml-2">
            faixa {param.faixa_min}–{param.faixa_max}
            {u}
          </span>
        </p>
        <p className="text-sm text-ink/80 mt-0.5">{param.motivo}</p>
        {ilustracao ? <VerNaPele>{ilustracao}</VerNaPele> : null}
      </dd>
    </div>
  );
}

function LinhaTexto({
  nome,
  valor,
  motivo,
  ilustracao,
}: {
  nome: string;
  valor: string;
  motivo: string;
  ilustracao?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-3 grid gap-1 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted">{nome}</dt>
      <dd>
        <p className="font-display text-xl text-ink">{valor}</p>
        <p className="text-sm text-ink/80 mt-0.5">{motivo}</p>
        {ilustracao ? <VerNaPele>{ilustracao}</VerNaPele> : null}
      </dd>
    </div>
  );
}

/**
 * Fechado por padrão: com cinco desenhos abertos, a lista de parâmetros vira
 * uma rolagem longa no celular, e o valor é o que se consulta primeiro.
 */
function VerNaPele({ children }: { children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="mt-1.5 text-xs font-medium text-accent hover:text-ink underline"
      >
        {aberto ? "Esconder desenho" : "Ver na pele"}
      </button>
      {aberto ? children : null}
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-display text-lg text-ink tracking-tight mb-1">{titulo}</h3>
      <div className="text-ink">{children}</div>
    </div>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (itens.length === 0) return null;
  return (
    <Bloco titulo={titulo}>
      <ul className="list-disc list-inside space-y-1">
        {itens.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </Bloco>
  );
}
