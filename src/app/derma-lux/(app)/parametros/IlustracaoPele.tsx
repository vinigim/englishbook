import type { ModoEmissao } from "@/lib/laser/tipos";

/**
 * Cortes esquemáticos da pele para comparar opções de um parâmetro.
 *
 * É ILUSTRAÇÃO QUALITATIVA: mostra o sentido de cada mudança (mais fundo, mais
 * calor, mais denso), não profundidade real em micrômetros. As proporções
 * vêm de regras simples, derivadas da base de conhecimento:
 *
 * - energia por DOT = potência × dwell time; a profundidade cresce com ela e
 *   com o SmartStack;
 * - o halo de coagulação cresce com o dwell e com o modo (HP < SP < DP);
 * - mais stack estreita um pouco o canal (descrição da DEKA);
 * - o spacing é desenhado em vista de cima, com a contagem real de DOTs numa
 *   área de 2 × 2 mm, que é geometria pura.
 *
 * Nada aqui chama a IA: os desenhos saem dos números que ela já devolveu.
 */

export type PerfilBase = {
  potencia: number;
  dwell: number;
  stack: number;
  modo: ModoEmissao;
};

// Paleta fixa: os desenhos precisam ler igual em qualquer tela.
const COR = {
  epiderme: "#e8c7a3",
  dermePapilar: "#f2d9d0",
  dermeReticular: "#ebcfc3",
  hipoderme: "#f5e7c8",
  coagulacao: "#cf6f4f",
  ablacao: "#1a2b24",
  linha: "#b9a58f",
  texto: "#6f6a60",
} as const;

// Segundo o treinamento Premium (trecho "premium-pulsos"): calor HP < DP < SP,
// ablação SP < DP < HP. A cratera do SP é larga e rasa (U), a do DP é um V e a
// do HP é um V estreito e fundo — é o desenho do próprio documento.
const MODO_ABLACAO: Record<ModoEmissao, number> = { SP: 0.8, DP: 1, HP: 1.15 };
const MODO_HALO: Record<ModoEmissao, number> = { SP: 1.8, DP: 1, HP: 0.35 };
const MODO_LARGURA: Record<ModoEmissao, number> = { SP: 1.4, DP: 1, HP: 0.75 };
/** Largura do fundo da cratera, em fração da boca: U no SP, V nos outros. */
const MODO_FUNDO: Record<ModoEmissao, number> = { SP: 0.5, DP: 0.2, HP: 0.15 };
/** O HP não tem time ajustável; para o desenho, vale um pulso curto. */
const TIME_HP = 300;

export const MODO_DESCRICAO: Record<ModoEmissao, string> = {
  SP: "Maior dano térmico e menor ablação: cratera larga e rasa.",
  DP: "Menor dano térmico e maior ablação: cratera em V.",
  HP: "Muita ablação e dano térmico mínimo (pulso frio).",
};

// Geometria do corte, em unidades do viewBox.
const W = 120;
const H = 168;
const SUPERFICIE = 16;
const FIM_EPIDERME = 26;
const FIM_PAPILAR = 52;
const FIM_RETICULAR = 140;
const FUNDO_MAX = FIM_RETICULAR - SUPERFICIE;

type Coluna = { profundidade: number; largura: number; halo: number; fundo: number };

function coluna({ potencia, dwell, stack, modo }: PerfilBase): Coluna {
  // A profundidade usa a mesma energia nos três pulsos, para a comparação ser
  // justa; o calor do HP usa um pulso curto, porque nele o time não se ajusta.
  const dwellCalor = modo === "HP" ? TIME_HP : dwell;
  const energiaMj = (potencia * dwell) / 1000;
  const relativa = Math.sqrt(Math.max(energiaMj * stack, 0) / 60);
  // Exagerado de propósito: num esquema, diferenças reais de 20% somem.
  const profundidade = Math.min(1, (0.08 + 0.75 * relativa) * MODO_ABLACAO[modo]);
  const largura =
    13 *
    MODO_LARGURA[modo] *
    (1 - 0.06 * (stack - 1)) *
    (1 + 0.2 * Math.min(potencia / 30, 1.5));
  const halo =
    (2 + 14 * Math.min(dwellCalor / 1500, 1)) *
    MODO_HALO[modo] *
    (1 + 0.12 * (stack - 1));
  return { profundidade, largura, halo, fundo: MODO_FUNDO[modo] };
}

/** Canal afunilado com fundo arredondado, centrado em x. */
function caminhoCanal(
  x: number,
  largura: number,
  fundo: number,
  fracaoFundo = 0.22,
): string {
  const topo = largura / 2;
  const base = Math.max(largura * fracaoFundo, 1.5);
  return [
    `M ${x - topo} ${SUPERFICIE}`,
    `L ${x - base} ${fundo - base}`,
    `Q ${x} ${fundo + base} ${x + base} ${fundo - base}`,
    `L ${x + topo} ${SUPERFICIE}`,
    "Z",
  ].join(" ");
}

/** Nomes das camadas, só no primeiro painel de cada comparação. */
function RotulosCamadas() {
  const estilo = { fontSize: 6.5, fill: COR.texto } as const;
  return (
    <g>
      <text x={3} y={FIM_EPIDERME - 2.5} style={estilo}>epiderme</text>
      <text x={3} y={FIM_PAPILAR - 3} style={estilo}>derme papilar</text>
      <text x={3} y={FIM_RETICULAR - 3} style={estilo}>derme reticular</text>
      <text x={3} y={H - 17} style={estilo}>hipoderme</text>
    </g>
  );
}

function CamadasDaPele({ largura }: { largura: number }) {
  return (
    <g>
      <rect x={0} y={SUPERFICIE} width={largura} height={FIM_EPIDERME - SUPERFICIE} fill={COR.epiderme} />
      <rect x={0} y={FIM_EPIDERME} width={largura} height={FIM_PAPILAR - FIM_EPIDERME} fill={COR.dermePapilar} />
      <rect x={0} y={FIM_PAPILAR} width={largura} height={FIM_RETICULAR - FIM_PAPILAR} fill={COR.dermeReticular} />
      <rect x={0} y={FIM_RETICULAR} width={largura} height={H - FIM_RETICULAR - 14} fill={COR.hipoderme} />
      <line x1={0} x2={largura} y1={FIM_EPIDERME} y2={FIM_EPIDERME} stroke={COR.linha} strokeWidth={0.6} strokeDasharray="2 2" />
      <line x1={0} x2={largura} y1={FIM_PAPILAR} y2={FIM_PAPILAR} stroke={COR.linha} strokeWidth={0.6} strokeDasharray="2 2" />
      <line x1={0} x2={largura} y1={FIM_RETICULAR} y2={FIM_RETICULAR} stroke={COR.linha} strokeWidth={0.6} strokeDasharray="2 2" />
    </g>
  );
}

/** Seta com ponta, desenhada à mão: <marker> repetiria ids entre os SVGs da página. */
function Seta({
  x1,
  y1,
  x2,
  y2,
  duas = false,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  duas?: boolean;
}) {
  const ponta = (xa: number, ya: number, xb: number, yb: number) => {
    const ang = Math.atan2(yb - ya, xb - xa);
    const t = 3.2;
    const a1 = ang + Math.PI - 0.45;
    const a2 = ang + Math.PI + 0.45;
    return `${xb},${yb} ${xb + t * Math.cos(a1)},${yb + t * Math.sin(a1)} ${xb + t * Math.cos(a2)},${yb + t * Math.sin(a2)}`;
  };
  return (
    <g stroke={COR.ablacao} fill={COR.ablacao}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={0.7} />
      <polygon points={ponta(x1, y1, x2, y2)} stroke="none" />
      {duas ? <polygon points={ponta(x2, y2, x1, y1)} stroke="none" /> : null}
    </g>
  );
}

const ESTILO_ANOTACAO = { fontSize: 6.2, fill: COR.ablacao, fontWeight: 600 } as const;

/**
 * Setas no próprio corte, como na figura do treinamento Premium: a
 * profundidade é a ablação (watts), a faixa ao redor é o calor (time).
 */
function Anotacoes({ c, x, fundo }: { c: Coluna; x: number; fundo: number }) {
  const borda = x + c.largura / 2 + c.halo;
  const xCota = Math.min(borda + 5, W - 12);
  const yMeio = SUPERFICIE + (fundo - SUPERFICIE) * 0.45;
  const xCanal = x + c.largura * 0.3;
  return (
    <g>
      <Seta x1={xCota} y1={SUPERFICIE + 1} x2={xCota} y2={fundo} duas />
      <text
        x={xCota + 3}
        y={(SUPERFICIE + fundo) / 2}
        style={ESTILO_ANOTACAO}
        transform={`rotate(90 ${xCota + 3} ${(SUPERFICIE + fundo) / 2})`}
        textAnchor="middle"
      >
        ablação · watts
      </text>
      {c.halo > 2.5 ? (
        <>
          <Seta x1={xCanal} y1={yMeio} x2={Math.min(borda, xCota - 2)} y2={yMeio} />
          <text x={x} y={Math.min(fundo + c.halo + 9, H - 16)} style={ESTILO_ANOTACAO} textAnchor="middle">
            calor · time
          </text>
        </>
      ) : null}
    </g>
  );
}

function CorteColuna({
  perfil,
  rotulo,
  comRotulos = false,
  anotar = false,
}: {
  perfil: PerfilBase;
  rotulo: string;
  comRotulos?: boolean;
  /** Setas de "ablação · watts" e "calor · time" dentro do desenho. */
  anotar?: boolean;
}) {
  const c = coluna(perfil);
  const fundo = SUPERFICIE + c.profundidade * FUNDO_MAX;
  const x = W / 2;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label={`Corte da pele: ${rotulo}`}
    >
      <CamadasDaPele largura={W} />
      {/* Zona de coagulação: o mesmo canal, alargado pelo halo. */}
      <path
        d={caminhoCanal(
          x,
          c.largura + 2 * c.halo,
          Math.min(fundo + c.halo * 0.8, FIM_RETICULAR + 10),
          c.fundo,
        )}
        fill={COR.coagulacao}
        fillOpacity={0.55}
      />
      <path d={caminhoCanal(x, c.largura, fundo, c.fundo)} fill={COR.ablacao} />
      {comRotulos ? <RotulosCamadas /> : null}
      {anotar ? <Anotacoes c={c} x={x} fundo={fundo} /> : null}
    </svg>
  );
}

// ============================================================================
//  Comparações
// ============================================================================

type Opcao = { rotulo: string; perfil: PerfilBase; recomendado: boolean; nota?: string };

function Painel({ opcoes, legenda }: { opcoes: Opcao[]; legenda: string }) {
  return (
    <div className="mt-3 border border-line bg-paper p-3">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }}
      >
        {opcoes.map((o, i) => (
          <figure
            key={o.rotulo}
            className={
              o.recomendado
                ? "border-2 border-accent p-1.5"
                : "border border-line p-1.5 opacity-80"
            }
          >
            <CorteColuna
              perfil={o.perfil}
              rotulo={o.rotulo}
              comRotulos={i === 0}
              anotar={o.recomendado}
            />
            <figcaption className="text-center mt-1">
              <span className="block text-sm font-medium text-ink">{o.rotulo}</span>
              {o.recomendado ? (
                <span className="block text-[11px] uppercase tracking-wide text-accent">
                  recomendado
                </span>
              ) : null}
              {o.nota ? (
                <span className="block text-[11px] text-muted leading-snug mt-0.5">
                  {o.nota}
                </span>
              ) : null}
            </figcaption>
          </figure>
        ))}
      </div>
      <Legenda />
      <p className="text-xs text-ink/80 mt-2">{legenda}</p>
    </div>
  );
}

function Legenda() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-muted">
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3" style={{ background: COR.ablacao }} />
        Ablação (tecido vaporizado)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3" style={{ background: COR.coagulacao, opacity: 0.55 }} />
        Coagulação (calor residual)
      </span>
      <span>Esquema sem escala — mostra o sentido da mudança, não a profundidade real.</span>
    </div>
  );
}

/** Três valores distintos e ordenados: mínimo da faixa, recomendado, máximo. */
function tresValores(min: number, valor: number, max: number): number[] {
  return Array.from(new Set([min, valor, max])).sort((a, b) => a - b);
}

export function ComparaModo({ base }: { base: PerfilBase }) {
  const modos: ModoEmissao[] = ["SP", "DP", "HP"];
  return (
    <Painel
      opcoes={modos.map((m) => ({
        rotulo: m,
        perfil: { ...base, modo: m },
        recomendado: m === base.modo,
        nota: MODO_DESCRICAO[m],
      }))}
      legenda="Mesma potência, time e stack; só a forma do pulso muda (no HP o time não se ajusta). Do SP ao HP a cratera fica mais estreita e mais funda e o calor ao redor diminui. O SP é o que mais aquece: mais retração e estímulo de colágeno, mais dias de eritema e mais risco de mancha."
    />
  );
}

export function ComparaStack({ base }: { base: PerfilBase }) {
  const inicio = Math.min(Math.max(base.stack - 1, 1), 3);
  const niveis = [inicio, inicio + 1, inicio + 2];
  return (
    <Painel
      opcoes={niveis.map((n) => ({
        rotulo: `Stack ${n}`,
        perfil: { ...base, stack: n },
        recomendado: n === base.stack,
      }))}
      legenda="Cada nível dispara mais um pulso no mesmo DOT: a coluna desce mais e fica um pouco mais estreita, mas o calor se acumula no mesmo ponto. É o jeito de ganhar profundidade sem espalhar calor para os lados."
    />
  );
}

export function ComparaPotencia({
  base,
  faixa,
}: {
  base: PerfilBase;
  faixa: { min: number; max: number };
}) {
  return (
    <Painel
      opcoes={tresValores(faixa.min, base.potencia, faixa.max).map((v) => ({
        rotulo: `${v} W`,
        perfil: { ...base, potencia: v },
        recomendado: v === base.potencia,
      }))}
      legenda="Mais potência = mais energia por DOT: a coluna fica mais funda e um pouco mais larga. O halo de calor muda pouco, porque quem manda nele é o dwell time."
    />
  );
}

export function ComparaDwell({
  base,
  faixa,
}: {
  base: PerfilBase;
  faixa: { min: number; max: number };
}) {
  return (
    <Painel
      opcoes={tresValores(faixa.min, base.dwell, faixa.max).map((v) => ({
        rotulo: `${v} µs`,
        perfil: { ...base, dwell: v },
        recomendado: v === base.dwell,
      }))}
      legenda="Mais dwell = o laser fica mais tempo em cada DOT: a coluna desce e, principalmente, o halo de calor engrossa. É o parâmetro que mais pesa no risco de mancha em fototipo alto."
    />
  );
}

// ============================================================================
//  Spacing: vista de cima
// ============================================================================

const LADO_MM = 2;
const LADO_UM = LADO_MM * 1000;
const VISTA = 120;

function VistaDeCima({ spacing, rotulo }: { spacing: number; rotulo: string }) {
  const escala = VISTA / LADO_UM;
  const raio = Math.max(150 * escala * 0.5, 3); // DOT desenhado em tamanho relativo
  const pontos: { x: number; y: number }[] = [];
  for (let y = spacing / 2; y < LADO_UM; y += spacing) {
    for (let x = spacing / 2; x < LADO_UM; x += spacing) {
      pontos.push({ x: x * escala, y: y * escala });
    }
  }
  return (
    <svg
      viewBox={`0 0 ${VISTA} ${VISTA}`}
      className="w-full h-auto"
      role="img"
      aria-label={`Vista de cima: ${rotulo}, ${pontos.length} DOTs em 2 por 2 milímetros`}
    >
      <rect x={0} y={0} width={VISTA} height={VISTA} fill={COR.epiderme} />
      {pontos.map((p) => (
        <g key={`${p.x}-${p.y}`}>
          <circle cx={p.x} cy={p.y} r={raio * 1.7} fill={COR.coagulacao} fillOpacity={0.45} />
          <circle cx={p.x} cy={p.y} r={raio} fill={COR.ablacao} />
        </g>
      ))}
    </svg>
  );
}

/**
 * O spacing visto de lado, como na figura do treinamento: colunas vizinhas na
 * mesma escala horizontal da vista de cima (2 mm), com a cota entre duas.
 */
const CORTE_SPACING_H = 62;
function CorteSpacing({ spacing }: { spacing: number }) {
  const escala = VISTA / LADO_UM;
  const sup = 12;
  const fimEpi = 17;
  const fimPap = 28;
  const fundo = 46;
  const xs: number[] = [];
  for (let x = spacing / 2; x < LADO_UM; x += spacing) xs.push(x * escala);
  return (
    <svg
      viewBox={`0 0 ${VISTA} ${CORTE_SPACING_H}`}
      className="w-full h-auto"
      role="img"
      aria-label={`Corte lateral: colunas a cada ${spacing} micrômetros`}
    >
      <rect x={0} y={sup} width={VISTA} height={fimEpi - sup} fill={COR.epiderme} />
      <rect x={0} y={fimEpi} width={VISTA} height={fimPap - fimEpi} fill={COR.dermePapilar} />
      <rect x={0} y={fimPap} width={VISTA} height={CORTE_SPACING_H - fimPap} fill={COR.dermeReticular} />
      {xs.map((x) => (
        <g key={x}>
          <path d={`M ${x - 5} ${sup} L ${x - 1.2} ${fundo + 3} Q ${x} ${fundo + 5.5} ${x + 1.2} ${fundo + 3} L ${x + 5} ${sup} Z`} fill={COR.coagulacao} fillOpacity={0.5} />
          <path d={`M ${x - 3} ${sup} L ${x - 0.6} ${fundo} Q ${x} ${fundo + 1.5} ${x + 0.6} ${fundo} L ${x + 3} ${sup} Z`} fill={COR.ablacao} />
        </g>
      ))}
      {xs.length > 1 ? (
        <>
          <Seta x1={xs[0]} y1={6} x2={xs[1]} y2={6} duas />
          <line x1={xs[0]} x2={xs[0]} y1={4} y2={sup} stroke={COR.ablacao} strokeWidth={0.4} strokeDasharray="1 1" />
          <line x1={xs[1]} x2={xs[1]} y1={4} y2={sup} stroke={COR.ablacao} strokeWidth={0.4} strokeDasharray="1 1" />
          <text x={(xs[0] + xs[1]) / 2} y={4} style={ESTILO_ANOTACAO} textAnchor="middle">
            spacing
          </text>
        </>
      ) : null}
    </svg>
  );
}

export function ComparaSpacing({
  valor,
  faixa,
}: {
  valor: number;
  faixa: { min: number; max: number };
}) {
  const valores = tresValores(faixa.min, valor, faixa.max);
  return (
    <div className="mt-3 border border-line bg-paper p-3">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${valores.length}, minmax(0, 1fr))` }}
      >
        {valores.map((v) => {
          const porLado = Math.ceil(LADO_UM / v - 0.5);
          const total = porLado * porLado;
          return (
            <figure
              key={v}
              className={
                v === valor ? "border-2 border-accent p-1.5" : "border border-line p-1.5 opacity-80"
              }
            >
              <CorteSpacing spacing={v} />
              <VistaDeCima spacing={v} rotulo={`${v} µm`} />
              <figcaption className="text-center mt-1">
                <span className="block text-sm font-medium text-ink">{v} µm</span>
                {v === valor ? (
                  <span className="block text-[11px] uppercase tracking-wide text-accent">
                    recomendado
                  </span>
                ) : null}
                <span className="block text-[11px] text-muted">
                  ≈ {total} DOTs em 2 × 2 mm
                </span>
              </figcaption>
            </figure>
          );
        })}
      </div>
      <p className="text-[11px] text-muted mt-3">
        Em cima, o corte lateral; embaixo, a vista de cima de um quadrado de
        2 × 2 mm. A contagem de DOTs é exata para o spacing; o tamanho das
        colunas é ilustrativo.
      </p>
      <p className="text-xs text-ink/80 mt-2">
        A densidade cai com o quadrado do spacing: abrir de 500 para 1.000 µm
        deixa um quarto dos DOTs. Mais pele íntegra entre as colunas significa
        cicatrização mais rápida e menos risco de mancha.
      </p>
    </div>
  );
}

// ============================================================================
//  Os 5 parâmetros — adaptado da figura do treinamento Premium
// ============================================================================
/**
 * Um desenho só, com as cinco grandezas apontando para a parte da coluna que
 * cada uma controla. Mesma lógica da página 1 do material da Premium
 * (autorizada DEKA): pulso = formato, watts = ablação, time = calor ao redor,
 * spacing = densidade, stack = aprofundar ablação e calor.
 */
export function CincoParametros() {
  const LW = 330;
  const LH = 150;
  const sup = 22;
  const fimEpi = 32;
  const fimPap = 56;
  const fimRet = 134;
  const xa = 50;
  const xb = 110;
  const fundo = 96;
  const meiaHalo = 19;
  const xCota = xb + meiaHalo + 8;
  const yCalor = 72;
  const canal = (x: number, meia: number, f: number, base: number) =>
    `M ${x - meia} ${sup} L ${x - base} ${f - base} Q ${x} ${f + base} ${x + base} ${f - base} L ${x + meia} ${sup} Z`;
  // Na mesma ordem vertical das partes que apontam: as linhas não se cruzam.
  const rotulos: { y: number; titulo: string; texto: string; ax: number; ay: number }[] = [
    { y: 12, titulo: "Spacing = densidade", texto: "distância entre os pontos", ax: (xa + xb) / 2 + 12, ay: 12 },
    { y: 38, titulo: "Pulso = formato", texto: "SP em U, DP em V, HP em V estreito", ax: xb + 9, ay: sup + 2 },
    { y: 64, titulo: "Watts = ablação", texto: "profundidade do canal vaporizado", ax: xCota, ay: 52 },
    { y: 90, titulo: "Time = calor ao redor", texto: "espessura da faixa de coagulação", ax: xb + meiaHalo - 4, ay: yCalor },
    { y: 116, titulo: "Stack = aprofundar", texto: "pulsos repetidos no mesmo ponto", ax: xb + 1, ay: fundo + 11 },
  ];
  return (
    <svg
      viewBox={`0 0 ${LW} ${LH}`}
      className="w-full h-auto"
      role="img"
      aria-label="Os cinco parâmetros: spacing é a densidade, pulso o formato, watts a ablação, time o calor ao redor, stack aprofunda"
    >
      <rect x={0} y={sup} width={160} height={fimEpi - sup} fill={COR.epiderme} />
      <rect x={0} y={fimEpi} width={160} height={fimPap - fimEpi} fill={COR.dermePapilar} />
      <rect x={0} y={fimPap} width={160} height={fimRet - fimPap} fill={COR.dermeReticular} />
      <rect x={0} y={fimRet} width={160} height={LH - fimRet} fill={COR.hipoderme} />
      {[xa, xb].map((x) => (
        <g key={x}>
          <path d={canal(x, meiaHalo, fundo + 8, 5)} fill={COR.coagulacao} fillOpacity={0.55} />
          <path d={canal(x, 8, fundo, 2.2)} fill={COR.ablacao} />
        </g>
      ))}
      {/* stack: o pulso a mais desce além do fundo */}
      <path
        d={`M ${xb - 1.8} ${fundo} L ${xb} ${fundo + 12} L ${xb + 1.8} ${fundo} Z`}
        fill={COR.ablacao}
        fillOpacity={0.45}
      />
      {/* spacing: cota entre os dois centros */}
      <Seta x1={xa} y1={12} x2={xb} y2={12} duas />
      <line x1={xa} x2={xa} y1={9} y2={sup} stroke={COR.ablacao} strokeWidth={0.4} strokeDasharray="1 1" />
      <line x1={xb} x2={xb} y1={9} y2={sup} stroke={COR.ablacao} strokeWidth={0.4} strokeDasharray="1 1" />
      {/* watts: cota de profundidade, fora da coluna */}
      <Seta x1={xCota} y1={sup + 1} x2={xCota} y2={fundo} duas />
      <line x1={xb} x2={xCota + 2} y1={fundo} y2={fundo} stroke={COR.ablacao} strokeWidth={0.4} strokeDasharray="1 1" />
      {/* time: do canal até a borda da coagulação */}
      <Seta x1={xb + 4} y1={yCalor} x2={xb + meiaHalo - 4} y2={yCalor} />
      {rotulos.map((r) => (
        <g key={r.titulo}>
          <line x1={r.ax} y1={r.ay} x2={176} y2={r.y - 3} stroke={COR.linha} strokeWidth={0.7} />
          <circle cx={r.ax} cy={r.ay} r={1.3} fill={COR.ablacao} />
          <text x={180} y={r.y - 1} style={{ fontSize: 8, fontWeight: 600, fill: COR.ablacao }}>
            {r.titulo}
          </text>
          <text x={180} y={r.y + 8} style={{ fontSize: 6.8, fill: COR.texto }}>
            {r.texto}
          </text>
        </g>
      ))}
    </svg>
  );
}
