"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import {
  ASSOCIACOES,
  ASSOCIACAO_LABEL,
  CARACTERISTICAS_PELE,
  CARACTERISTICA_PELE_LABEL,
  DOWNTIMES,
  DOWNTIME_LABEL,
  EXPOSICOES_SOLARES,
  EXPOSICAO_SOLAR_LABEL,
  EXTENSOES,
  EXTENSAO_LABEL,
  FOTOTIPOS,
  FOTOTIPO_LABEL,
  HISTORICOS,
  HISTORICO_LABEL,
  IDADES_CICATRIZ,
  IDADE_CICATRIZ_LABEL,
  INDICACOES,
  INDICACAO_LABEL,
  REGIOES,
  REGIAO_LABEL,
  RESULTADOS_ANTERIORES,
  RESULTADO_ANTERIOR_LABEL,
  SESSAO_ANTERIOR_VAZIA,
  TIPOS_MELASMA,
  TIPO_MELASMA_LABEL,
  ESCALAS,
  ehCicatriz,
  ehMelasma,
  type EntradaConsulta,
  type SessaoAnterior,
} from "@/lib/laser/tipos";

const CAMPO =
  "w-full h-11 px-3 bg-paper border border-line text-ink focus:outline-none focus:border-ink";

/**
 * O formulário do caso, em quatro blocos: o caso, o paciente, a sessão e o
 * planejamento. Perguntas que só valem para uma indicação (melasma,
 * cicatriz) ou para sessão subsequente aparecem só quando se aplicam; o que
 * fica escondido é zerado por `normalizarEntrada` antes de ir para a IA.
 */
export function FormularioCaso({
  entrada,
  setEntrada,
  onEnviar,
  carregando,
  topo,
}: {
  entrada: EntradaConsulta;
  setEntrada: (f: (e: EntradaConsulta) => EntradaConsulta) => void;
  onEnviar: () => void;
  carregando: boolean;
  /** Seletor de locação; fica fora de `entrada` porque não muda a recomendação. */
  topo?: React.ReactNode;
}) {
  function set<K extends keyof EntradaConsulta>(k: K, v: EntradaConsulta[K]) {
    setEntrada((e) => ({ ...e, [k]: v }));
  }

  function alternar<K extends "historico" | "caracteristicasPele" | "associacoes">(
    k: K,
    item: EntradaConsulta[K][number],
  ) {
    setEntrada((e) => {
      const lista = e[k] as string[];
      const nova = lista.includes(item)
        ? lista.filter((x) => x !== item)
        : [...lista, item];
      return { ...e, [k]: nova };
    });
  }

  function setAnterior<K extends keyof SessaoAnterior>(k: K, v: SessaoAnterior[K]) {
    setEntrada((e) => ({
      ...e,
      sessaoAnterior: { ...(e.sessaoAnterior ?? SESSAO_ANTERIOR_VAZIA), [k]: v },
    }));
  }

  const anterior = entrada.sessaoAnterior ?? SESSAO_ANTERIOR_VAZIA;

  return (
    <Card variant="bordered" className="space-y-6 h-fit">
      {topo ? <Secao titulo="Médico e locação">{topo}</Secao> : null}
      {/* ------------------------------------------------------------------ */}
      <Secao titulo="O caso">
        <Selecao
          id="indicacao"
          rotulo="Indicação"
          valor={entrada.indicacao}
          opcoes={INDICACOES}
          rotulos={INDICACAO_LABEL}
          onChange={(v) => set("indicacao", v)}
        />

        <EscolhaGrau
          indicacao={entrada.indicacao}
          valor={entrada.grau}
          onChange={(v) => set("grau", v)}
        />

        {ehMelasma(entrada.indicacao) ? (
          <div className="border-l-2 border-accent pl-3 space-y-3">
            <Selecao
              id="melasmaTipo"
              rotulo="Tipo de melasma"
              valor={entrada.melasmaTipo ?? "nao_sei"}
              opcoes={TIPOS_MELASMA}
              rotulos={TIPO_MELASMA_LABEL}
              onChange={(v) => set("melasmaTipo", v)}
            />
            <SimNao
              rotulo="Já fez 3 meses ou mais de tratamento tópico adequado, sem resposta?"
              nome="melasmaRefratario"
              valor={entrada.melasmaRefratario ?? false}
              onChange={(v) => set("melasmaRefratario", v)}
            />
          </div>
        ) : null}

        {ehCicatriz(entrada.indicacao) ? (
          <div className="border-l-2 border-accent pl-3">
            <Selecao
              id="idadeCicatriz"
              rotulo="Há quanto tempo existe a cicatriz?"
              valor={entrada.idadeCicatriz ?? ""}
              opcoes={IDADES_CICATRIZ}
              rotulos={IDADE_CICATRIZ_LABEL}
              vazio="Não sei"
              onChange={(v) => set("idadeCicatriz", v || null)}
            />
          </div>
        ) : null}

        <Selecao
          id="regiao"
          rotulo="Região"
          valor={entrada.regiao}
          opcoes={REGIOES}
          rotulos={REGIAO_LABEL}
          onChange={(v) => set("regiao", v)}
        />

        <Radios
          rotulo="O que vai ser tratado"
          nome="extensao"
          valor={entrada.extensao}
          opcoes={EXTENSOES}
          rotulos={EXTENSAO_LABEL}
          onChange={(v) => set("extensao", v)}
        />

      </Secao>

      {/* ------------------------------------------------------------------ */}
      <Secao titulo="O paciente">
        <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
          <Selecao
            id="fototipo"
            rotulo="Fototipo (Fitzpatrick)"
            valor={entrada.fototipo}
            opcoes={FOTOTIPOS}
            rotulos={FOTOTIPO_LABEL}
            onChange={(v) => set("fototipo", v)}
          />
          <div>
            <Label htmlFor="idade">Idade</Label>
            <Input
              id="idade"
              type="number"
              min={12}
              max={100}
              placeholder="anos"
              value={entrada.idade ?? ""}
              onChange={(e) =>
                set("idade", e.target.value ? Number(e.target.value) : null)
              }
            />
          </div>
        </div>

        <Caixas
          rotulo="A pele na área"
          opcoes={CARACTERISTICAS_PELE}
          rotulos={CARACTERISTICA_PELE_LABEL}
          marcados={entrada.caracteristicasPele}
          onAlternar={(v) => alternar("caracteristicasPele", v)}
        />

        <Caixas
          rotulo="Histórico e medicações"
          opcoes={HISTORICOS}
          rotulos={HISTORICO_LABEL}
          marcados={entrada.historico}
          onAlternar={(v) => alternar("historico", v)}
        />
      </Secao>

      {/* ------------------------------------------------------------------ */}
      <Secao titulo="A sessão">
        <Radios
          rotulo="Já fez CO2 nesta área?"
          nome="sessao"
          valor={entrada.sessao}
          opcoes={["primeira", "subsequente"] as const}
          rotulos={{ primeira: "Não, é a primeira", subsequente: "Sim" }}
          onChange={(v) => set("sessao", v)}
        />

        {entrada.sessao === "subsequente" ? (
          <div className="border-l-2 border-accent pl-3 space-y-3">
            <p className="text-xs text-muted">
              Parâmetros da última sessão. Deixe em branco o que não tiver
              registrado.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Numero rotulo="Potência (W)" valor={anterior.potencia} onChange={(v) => setAnterior("potencia", v)} />
              <Numero rotulo="Dwell (µs)" valor={anterior.dwell} onChange={(v) => setAnterior("dwell", v)} />
              <Numero rotulo="Spacing (µm)" valor={anterior.spacing} onChange={(v) => setAnterior("spacing", v)} />
              <Numero rotulo="SmartStack" valor={anterior.stack} onChange={(v) => setAnterior("stack", v)} />
              <Numero rotulo="Dias de eritema" valor={anterior.diasEritema} onChange={(v) => setAnterior("diasEritema", v)} />
              <Selecao
                id="resultadoAnterior"
                rotulo="Resultado"
                valor={anterior.resultado ?? ""}
                opcoes={RESULTADOS_ANTERIORES}
                rotulos={RESULTADO_ANTERIOR_LABEL}
                vazio="—"
                onChange={(v) => setAnterior("resultado", v || null)}
              />
            </div>
            <SimNao
              rotulo="Teve mancha (hiperpigmentação pós-inflamatória)?"
              nome="teveHpi"
              valor={anterior.teveHpi}
              onChange={(v) => setAnterior("teveHpi", v)}
            />
            <textarea
              className={cn(CAMPO, "h-16 py-2 text-sm")}
              placeholder="Algo mais sobre a sessão anterior (opcional)"
              value={entrada.respostaAnterior}
              maxLength={1000}
              onChange={(e) => set("respostaAnterior", e.target.value)}
            />
          </div>
        ) : null}

        <Caixas
          rotulo="Vai combinar com algo na mesma sessão?"
          opcoes={ASSOCIACOES}
          rotulos={ASSOCIACAO_LABEL}
          marcados={entrada.associacoes}
          onAlternar={(v) => alternar("associacoes", v)}
        />
      </Secao>

      {/* ------------------------------------------------------------------ */}
      <Secao titulo="Depois da sessão">
        <Selecao
          id="downtime"
          rotulo="Dias de recuperação que o paciente aceita"
          valor={entrada.downtime}
          opcoes={DOWNTIMES}
          rotulos={DOWNTIME_LABEL}
          onChange={(v) => set("downtime", v)}
        />
        <Selecao
          id="exposicaoSolar"
          rotulo="Exposição solar nas próximas 4–6 semanas"
          valor={entrada.exposicaoSolar}
          opcoes={EXPOSICOES_SOLARES}
          rotulos={EXPOSICAO_SOLAR_LABEL}
          onChange={(v) => set("exposicaoSolar", v)}
        />
        <div>
          <Label htmlFor="observacoes">Observações</Label>
          <textarea
            id="observacoes"
            className={cn(CAMPO, "h-24 py-2 text-sm")}
            placeholder="Detalhes do caso. Não escreva o nome do paciente."
            value={entrada.observacoes}
            maxLength={2000}
            onChange={(e) => set("observacoes", e.target.value)}
          />
        </div>
      </Secao>

      <div>
        <Button className="w-full" loading={carregando} onClick={onEnviar}>
          {carregando ? "Analisando o caso…" : "Recomendar parâmetros"}
        </Button>
        {carregando ? (
          <p className="text-xs text-muted mt-2">
            A IA lê a base inteira sobre o aparelho antes de responder. Leva até
            1 minuto.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

// ============================================================================
//  Peças do formulário
// ============================================================================

/**
 * O grau na escala da indicação, com a descrição de cada nível à vista.
 * Some quando a indicação não tem escala.
 */
function EscolhaGrau({
  indicacao,
  valor,
  onChange,
}: {
  indicacao: EntradaConsulta["indicacao"];
  valor: string | null;
  onChange: (v: string | null) => void;
}) {
  const escala = ESCALAS[indicacao];
  if (!escala) return null;
  return (
    <div>
      <Label>{escala.pergunta}</Label>
      <div className="space-y-1.5">
        {escala.opcoes.map((o) => {
          const marcado = valor === o.valor;
          return (
            <label
              key={o.valor}
              className={cn(
                "flex items-start gap-2 border px-3 py-2 cursor-pointer text-sm",
                marcado ? "border-ink bg-line/40" : "border-line",
              )}
            >
              <input
                type="radio"
                name="grau"
                className="mt-1"
                checked={marcado}
                onChange={() => onChange(o.valor)}
              />
              <span>
                <span className="block font-medium text-ink">{o.rotulo}</span>
                <span className="block text-xs text-muted">{o.descricao}</span>
              </span>
            </label>
          );
        })}
        {valor ? (
          <button
            type="button"
            className="text-xs text-muted underline hover:text-ink"
            onClick={() => onChange(null)}
          >
            Não sei / limpar
          </button>
        ) : null}
      </div>
    </div>
  );
}
function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="font-display text-lg text-ink tracking-tight border-b border-line w-full pb-1 mb-3">
        {titulo}
      </legend>
      {children}
    </fieldset>
  );
}

function Selecao<T extends string>({
  id,
  rotulo,
  valor,
  opcoes,
  rotulos,
  vazio,
  onChange,
}: {
  id: string;
  rotulo: string;
  valor: T | "";
  opcoes: readonly T[];
  rotulos: Record<T, string>;
  /** Texto da opção "sem resposta"; ausente = a pergunta é obrigatória. */
  vazio?: string;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{rotulo}</Label>
      <select
        id={id}
        className={CAMPO}
        value={valor}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {vazio != null ? <option value="">{vazio}</option> : null}
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {rotulos[o]}
          </option>
        ))}
      </select>
    </div>
  );
}

function Radios<T extends string>({
  rotulo,
  nome,
  valor,
  opcoes,
  rotulos,
  onChange,
}: {
  rotulo: string;
  nome: string;
  valor: T;
  opcoes: readonly T[];
  rotulos: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <Label>{rotulo}</Label>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink">
        {opcoes.map((o) => (
          <label key={o} className="flex items-center gap-2">
            <input
              type="radio"
              name={nome}
              checked={valor === o}
              onChange={() => onChange(o)}
            />
            {rotulos[o]}
          </label>
        ))}
      </div>
    </div>
  );
}

function SimNao({
  rotulo,
  nome,
  valor,
  onChange,
}: {
  rotulo: string;
  nome: string;
  valor: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Radios
      rotulo={rotulo}
      nome={nome}
      valor={valor ? "sim" : "nao"}
      opcoes={["sim", "nao"] as const}
      rotulos={{ sim: "Sim", nao: "Não" }}
      onChange={(v) => onChange(v === "sim")}
    />
  );
}

function Caixas<T extends string>({
  rotulo,
  opcoes,
  rotulos,
  marcados,
  onAlternar,
}: {
  rotulo: string;
  opcoes: readonly T[];
  rotulos: Record<T, string>;
  marcados: readonly T[];
  onAlternar: (v: T) => void;
}) {
  return (
    <div>
      <Label>{rotulo}</Label>
      <div className="space-y-1.5 text-sm text-ink">
        {opcoes.map((o) => (
          <label key={o} className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={marcados.includes(o)}
              onChange={() => onAlternar(o)}
            />
            <span>{rotulos[o]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  onChange,
}: {
  rotulo: string;
  valor: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div>
      <Label className="text-xs mb-1">{rotulo}</Label>
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        value={valor ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      />
    </div>
  );
}
