"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import type { ModoEmissao } from "@/lib/laser/tipos";
import {
  CincoParametros,
  COR,
  CorteColuna,
  CorteSpacing,
  MODO_DESCRICAO,
  VistaDeCima,
} from "./IlustracaoPele";

/**
 * Aula animada sobre os parâmetros do SmartXide Punto, para treinamento.
 *
 * Funciona como um vídeo, mas é desenhado na hora: cada cena tem uma duração
 * e um desenho que depende do tempo `t` (0 → 1), então dá para pausar, voltar
 * e pular sem perder nada. A narração usa a voz do próprio navegador
 * (speechSynthesis), desligada por padrão: quem dá o treinamento costuma
 * preferir falar por cima.
 *
 * Os textos seguem os trechos da base de conhecimento (param-*, premium-*).
 * Se a base mudar, revise aqui também. Os desenhos são esquemáticos, como os
 * de IlustracaoPele: mostram o sentido da mudança, não medidas reais.
 */

type Cena = {
  titulo: string;
  /** Em ms, sem narração. Com narração, a cena espera a fala terminar. */
  duracao: number;
  /** O que a narração diz; também aparece como legenda. */
  fala: string;
  desenho: (t: number) => ReactNode;
};

// ============================================================================
//  Utilidades de animação
// ============================================================================

const limitar = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const suave = (x: number) => x * x * (3 - 2 * x);
/** Progresso suavizado de t dentro da janela [ini, fim]. */
const fase = (t: number, ini = 0.08, fim = 0.85) => suave(limitar((t - ini) / (fim - ini)));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const arred = (v: number, passo: number) => Math.round(v / passo) * passo;

function Leitura({ itens }: { itens: { rotulo: string; valor: string; destaque?: boolean }[] }) {
  return (
    <div className="flex flex-wrap justify-center gap-2 mt-3">
      {itens.map((i) => (
        <div
          key={i.rotulo}
          className={
            i.destaque
              ? "border-2 border-accent px-3 py-1.5 text-center min-w-[96px]"
              : "border border-line px-3 py-1.5 text-center min-w-[96px]"
          }
        >
          <span className="block text-[11px] uppercase tracking-wide text-muted">{i.rotulo}</span>
          <span className="block font-display text-2xl text-ink tabular-nums">{i.valor}</span>
        </div>
      ))}
    </div>
  );
}

function LegendaCores() {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2 text-[11px] text-muted">
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3" style={{ background: COR.ablacao }} />
        Ablação (tecido vaporizado)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3" style={{ background: COR.coagulacao, opacity: 0.55 }} />
        Coagulação (calor)
      </span>
    </div>
  );
}

const fmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

// ============================================================================
//  Vista de cima animada (DOTs aparecendo) e ordens de varredura
// ============================================================================

const GRADE = 6;
type Ponto = { l: number; c: number };

const ORDEM_NORMAL: Ponto[] = Array.from({ length: GRADE * GRADE }, (_, i) => ({
  l: Math.floor(i / GRADE),
  c: i % GRADE,
}));

const ORDEM_INTERLACED: Ponto[] = [
  ...ORDEM_NORMAL.filter((p) => p.l % 2 === 0),
  ...ORDEM_NORMAL.filter((p) => p.l % 2 === 1),
];

/**
 * Ilustração do SmartTrack: a cada disparo, escolhe o ponto livre mais longe
 * dos últimos disparados. É a ideia descrita pela DEKA (nunca disparar
 * vizinhos em sequência), não o algoritmo real do aparelho.
 */
const ORDEM_SMARTTRACK: Ponto[] = (() => {
  const livres = [...ORDEM_NORMAL];
  const ordem: Ponto[] = [livres.splice(0, 1)[0]];
  while (livres.length) {
    const recentes = ordem.slice(-3);
    let melhor = 0;
    let melhorDist = -1;
    livres.forEach((p, i) => {
      const d = Math.min(...recentes.map((r) => Math.hypot(r.l - p.l, r.c - p.c)));
      if (d > melhorDist) {
        melhor = i;
        melhorDist = d;
      }
    });
    ordem.push(livres.splice(melhor, 1)[0]);
  }
  return ordem;
})();

function GradeVarredura({ ordem, t, nome }: { ordem: Ponto[]; t: number; nome: string }) {
  const lado = 100;
  const passo = lado / GRADE;
  const disparados = Math.floor(fase(t, 0.05, 0.9) * ordem.length);
  // Calor que ainda não dissipou: os últimos disparos brilham.
  const QUENTES = 5;
  return (
    <figure className="border border-line p-1.5">
      <svg viewBox={`0 0 ${lado} ${lado}`} className="w-full h-auto" role="img" aria-label={`Varredura ${nome}`}>
        <rect width={lado} height={lado} fill={COR.epiderme} />
        {ordem.slice(0, disparados).map((p, i) => {
          const idade = disparados - 1 - i;
          const quente = idade < QUENTES;
          const cx = (p.c + 0.5) * passo;
          const cy = (p.l + 0.5) * passo;
          return (
            <g key={`${p.l}-${p.c}`}>
              {quente ? (
                <circle cx={cx} cy={cy} r={passo * 0.62} fill={COR.coagulacao} fillOpacity={0.55 - idade * 0.09} />
              ) : null}
              <circle cx={cx} cy={cy} r={passo * 0.18} fill={COR.ablacao} />
            </g>
          );
        })}
      </svg>
      <figcaption className="text-center text-sm font-medium text-ink mt-1">{nome}</figcaption>
    </figure>
  );
}

function DotsAparecendo({ k }: { k: number }) {
  const lado = 120;
  const passo = lado / GRADE;
  const n = Math.floor(k * ORDEM_SMARTTRACK.length);
  return (
    <svg viewBox={`0 0 ${lado} ${lado}`} className="w-full h-auto" role="img" aria-label="Vista de cima: DOTs na pele">
      <rect width={lado} height={lado} fill={COR.epiderme} />
      {ORDEM_SMARTTRACK.slice(0, n).map((p) => (
        <g key={`${p.l}-${p.c}`}>
          <circle cx={(p.c + 0.5) * passo} cy={(p.l + 0.5) * passo} r={passo * 0.3} fill={COR.coagulacao} fillOpacity={0.45} />
          <circle cx={(p.c + 0.5) * passo} cy={(p.l + 0.5) * passo} r={passo * 0.16} fill={COR.ablacao} />
        </g>
      ))}
    </svg>
  );
}

// ============================================================================
//  Formas da área de scan
// ============================================================================

function Forma({ tipo, visivel }: { tipo: string; visivel: boolean }) {
  const contorno: Record<string, ReactNode> = {
    Quadrado: <rect x={8} y={8} width={44} height={44} />,
    Hexágono: <polygon points="30,6 51,18 51,42 30,54 9,42 9,18" />,
    Triângulo: <polygon points="30,7 54,50 6,50" />,
    Elipse: <ellipse cx={30} cy={30} rx={24} ry={15} />,
    Ponto: <circle cx={30} cy={30} r={4} />,
  };
  return (
    <figure
      className="border border-line p-1.5 transition-opacity duration-500"
      style={{ opacity: visivel ? 1 : 0.15 }}
    >
      <svg viewBox="0 0 60 60" className="w-full h-auto" aria-hidden>
        <rect width={60} height={60} fill={COR.epiderme} />
        <g fill={COR.coagulacao} fillOpacity={0.35} stroke={COR.ablacao} strokeWidth={1}>
          {contorno[tipo]}
        </g>
      </svg>
      <figcaption className="text-center text-xs text-ink mt-1">{tipo}</figcaption>
    </figure>
  );
}

function Sobreposicao({ k }: { k: number }) {
  // O segundo disparo desliza até encostar; no fim, invade um pouco o primeiro.
  const x2 = lerp(120, 66, k);
  const invade = Math.max(0, 70 - x2);
  return (
    <svg viewBox="0 0 140 70" className="w-full h-auto" role="img" aria-label="Disparos lado a lado e sobrepostos">
      <rect width={140} height={70} fill={COR.epiderme} />
      <rect x={10} y={10} width={60} height={50} fill={COR.coagulacao} fillOpacity={0.3} stroke={COR.ablacao} strokeWidth={0.8} />
      <rect x={x2} y={10} width={60} height={50} fill={COR.coagulacao} fillOpacity={0.3} stroke={COR.ablacao} strokeWidth={0.8} />
      {invade > 0 ? (
        <>
          <rect x={x2} y={10} width={invade} height={50} fill="#b3261e" fillOpacity={0.75} />
          <text x={x2 + invade / 2} y={67} textAnchor="middle" style={{ fontSize: 6, fill: "#b3261e", fontWeight: 700 }}>
            dose dobrada
          </text>
        </>
      ) : null}
    </svg>
  );
}

// ============================================================================
//  Peça focada: trem de pulsos
// ============================================================================

function TremDePulsos({ hz, t }: { hz: number; t: number }) {
  const L = 300;
  const janela = 1; // 1 segundo na tela
  const largura = L / (hz * janela);
  const cursor = (t * 3 % 1) * L;
  const pulsos = Array.from({ length: Math.floor(hz * janela) }, (_, i) => i * largura);
  return (
    <svg viewBox={`0 0 ${L} 92`} className="w-full h-auto" role="img" aria-label={`Contínuo e pulsado a ${Math.round(hz)} Hz`}>
      <text x={0} y={9} style={{ fontSize: 8, fontWeight: 600, fill: COR.ablacao }}>CW — contínuo</text>
      <rect x={0} y={14} width={L} height={18} fill={COR.coagulacao} fillOpacity={0.75} />
      <text x={0} y={51} style={{ fontSize: 8, fontWeight: 600, fill: COR.ablacao }}>
        Pulsado — {Math.round(hz)} disparos por segundo ({Math.round(hz)} Hz)
      </text>
      {pulsos.map((x) => (
        <rect key={x} x={x + largura * 0.1} y={56} width={Math.max(largura * 0.25, 1.5)} height={18} fill={COR.ablacao} />
      ))}
      <line x1={0} x2={L} y1={74} y2={74} stroke={COR.linha} strokeWidth={0.6} />
      <text x={L} y={86} textAnchor="end" style={{ fontSize: 7, fill: COR.texto }}>1 segundo →</text>
      <line x1={cursor} x2={cursor} y1={12} y2={76} stroke="#b3261e" strokeWidth={0.8} />
    </svg>
  );
}

// ============================================================================
//  Cenas
// ============================================================================

const MODOS: ModoEmissao[] = ["SP", "DP", "HP"];

const CENAS: Cena[] = [
  {
    titulo: "Como o laser fracionado age",
    duracao: 14000,
    fala:
      "O scanner do SmartXide dispara o laser em pontos, os DOTs. Cada ponto vaporiza uma coluna fina de pele, a ablação, e deixa ao redor uma faixa aquecida, a coagulação, que estimula colágeno e retração. A pele que fica íntegra entre os pontos é o que faz a cicatrização ser rápida.",
    desenho: (t) => {
      const k = fase(t, 0.05, 0.6);
      return (
        <div>
          <div className="grid grid-cols-2 gap-4 max-w-xl mx-auto">
            <figure className="border border-line p-1.5">
              <DotsAparecendo k={k} />
              <figcaption className="text-center text-xs text-muted mt-1">Vista de cima: os DOTs</figcaption>
            </figure>
            <figure className="border border-line p-1.5">
              <CorteColuna
                perfil={{ potencia: lerp(1, 15, k), dwell: 800, stack: 1, modo: "SP" }}
                rotulo="uma coluna"
                comRotulos
              />
              <figcaption className="text-center text-xs text-muted mt-1">De lado: uma coluna</figcaption>
            </figure>
          </div>
          <LegendaCores />
        </div>
      );
    },
  },
  {
    titulo: "Os cinco parâmetros do scanner",
    duracao: 16000,
    fala:
      "Cinco ajustes controlam cada coluna. O pulso define o formato. Os watts, a profundidade da ablação. O time, a faixa de calor ao redor. O spacing, a distância entre os pontos, ou seja, a densidade. E o stack repete o disparo no mesmo ponto para aprofundar. Vamos ver um por um.",
    desenho: () => (
      <div className="max-w-2xl mx-auto">
        <CincoParametros />
      </div>
    ),
  },
  {
    titulo: "1. Modo de emissão: SP, DP e HP",
    duracao: 18000,
    fala:
      "O modo de emissão é a forma do pulso, e decide a relação entre ablação e calor. O SP, Smart Pulse, é o que mais aquece e menos vaporiza: cratera larga e rasa, ótimo para retração e colágeno, como no rejuvenescimento suave e nas pálpebras. O DP, Deka Pulse, vaporiza mais com menos calor: cratera em V, usado em cicatrizes de acne e rejuvenescimento intenso. O HP, High Pulse, é o pulso frio: muita ablação e quase nenhum calor, para manchas e opções com pouco downtime. No HP o time não se ajusta.",
    desenho: (t) => {
      const ativo = Math.min(2, Math.floor(limitar(t) * 3));
      return (
        <div>
          <div className="grid grid-cols-3 gap-3 max-w-2xl mx-auto">
            {MODOS.map((m, i) => (
              <figure
                key={m}
                className={
                  i === ativo
                    ? "border-2 border-accent p-1.5 transition-opacity duration-500"
                    : "border border-line p-1.5 transition-opacity duration-500"
                }
                style={{ opacity: i <= ativo ? 1 : 0.15 }}
              >
                <CorteColuna perfil={{ potencia: 15, dwell: 800, stack: 1, modo: m }} rotulo={m} comRotulos={i === 0} />
                <figcaption className="text-center mt-1">
                  <span className="block font-display text-xl text-ink">{m}</span>
                  <span className="block text-[11px] text-muted leading-snug">{MODO_DESCRICAO[m]}</span>
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="text-center text-xs text-muted mt-2">Calor: HP &lt; DP &lt; SP · Ablação: SP &lt; DP &lt; HP</p>
          <LegendaCores />
        </div>
      );
    },
  },
  {
    titulo: "2. Potência (W) = ablação",
    duracao: 16000,
    fala:
      "A potência, em watts, é a ablação: quanto mais watts, mais funda a coluna vaporizada. A energia de cada ponto é a potência vezes o time; por exemplo, dez watts com seiscentos microssegundos dá seis milijoules. Leia sempre a potência junto com o time. No protocolo Premium, para a mesma indicação, a potência cai à medida que o fototipo sobe.",
    desenho: (t) => {
      const w = arred(lerp(6, 30, fase(t)), 1);
      const dwell = 800;
      return (
        <div>
          <div className="max-w-[240px] mx-auto border border-line p-1.5">
            <CorteColuna perfil={{ potencia: w, dwell, stack: 1, modo: "SP" }} rotulo={`${w} W`} comRotulos anotar />
          </div>
          <Leitura
            itens={[
              { rotulo: "Potência", valor: `${w} W`, destaque: true },
              { rotulo: "Time (fixo)", valor: `${dwell} µs` },
              { rotulo: "Energia/DOT", valor: `${fmt.format((w * dwell) / 1000)} mJ` },
            ]}
          />
          <LegendaCores />
        </div>
      );
    },
  },
  {
    titulo: "3. Dwell time (µs) = calor ao redor",
    duracao: 17000,
    fala:
      "O dwell time, ou só time, é quanto tempo o laser fica em cada ponto, em microssegundos. É o principal controle do calor residual: repare como a faixa de coagulação engrossa. Time curto, perto de trezentos, serve para manchas; médio, de seiscentos a novecentos, para pálpebras e cicatrizes; longo, até mil e cem, para rejuvenescimento em fototipo baixo. É o parâmetro que mais pesa no risco de mancha em pele morena.",
    desenho: (t) => {
      const dwell = arred(lerp(300, 1500, fase(t)), 50);
      const w = 15;
      return (
        <div>
          <div className="max-w-[240px] mx-auto border border-line p-1.5">
            <CorteColuna perfil={{ potencia: w, dwell, stack: 1, modo: "SP" }} rotulo={`${dwell} µs`} comRotulos anotar />
          </div>
          <Leitura
            itens={[
              { rotulo: "Potência (fixa)", valor: `${w} W` },
              { rotulo: "Time", valor: `${fmt.format(dwell)} µs`, destaque: true },
              { rotulo: "Energia/DOT", valor: `${fmt.format((w * dwell) / 1000)} mJ` },
            ]}
          />
          <LegendaCores />
        </div>
      );
    },
  },
  {
    titulo: "4. Spacing (µm) = densidade",
    duracao: 17000,
    fala:
      "O spacing é a distância entre o centro de dois pontos vizinhos. Ele define a densidade, e a densidade cai com o quadrado do spacing: abrir de quinhentos para mil micrômetros deixa só um quarto dos pontos. Spacing fechado, de duzentos a trezentos e cinquenta, é para manchas e cicatrizes; de seiscentos a oitocentos, face e pálpebras; acima disso, corpo. Em pele morena, abrir o spacing protege mais do que baixar a potência.",
    desenho: (t) => {
      const spacing = arred(lerp(1000, 300, fase(t)), 50);
      const porLado = Math.ceil(2000 / spacing - 0.5);
      return (
        <div>
          <div className="max-w-[220px] mx-auto border border-line p-1.5">
            <CorteSpacing spacing={spacing} />
            <VistaDeCima spacing={spacing} rotulo={`${spacing} µm`} />
          </div>
          <Leitura
            itens={[
              { rotulo: "Spacing", valor: `${fmt.format(spacing)} µm`, destaque: true },
              { rotulo: "DOTs em 2 × 2 mm", valor: `≈ ${porLado * porLado}` },
            ]}
          />
        </div>
      );
    },
  },
  {
    titulo: "5. SmartStack (1 a 3) = aprofundar",
    duracao: 15000,
    fala:
      "O SmartStack dispara de um a três pulsos seguidos no mesmo ponto; no nosso aparelho, o máximo é três. A coluna desce mais e fica um pouco mais estreita, então é o jeito de ganhar profundidade sem espalhar calor para os lados. Stack um é superficial; dois é o mais usado em rejuvenescimento, cicatrizes e estrias; três, o máximo, fica para cicatriz profunda e pele espessa. Para aprofundar, subir o stack é mais seguro do que subir o time.",
    desenho: (t) => {
      const stack = 1 + Math.min(2, Math.floor(fase(t, 0.05, 0.8) * 3));
      return (
        <div>
          <div className="max-w-[240px] mx-auto border border-line p-1.5">
            <CorteColuna perfil={{ potencia: 15, dwell: 600, stack, modo: "DP" }} rotulo={`Stack ${stack}`} comRotulos anotar />
          </div>
          <Leitura itens={[{ rotulo: "SmartStack", valor: String(stack), destaque: true }]} />
          <LegendaCores />
        </div>
      );
    },
  },
  {
    titulo: "6. Modo de varredura",
    duracao: 16000,
    fala:
      "O modo de varredura é a ordem em que os pontos são disparados. No Normal, linha a linha, o calor de um ponto soma com o do vizinho. O Interlaced intercala as linhas. O SmartTrack nunca dispara vizinhos em sequência, então o calor tem tempo de sair: menos dor e menos risco de mancha. É o padrão, e obrigatório com time longo, stack três ou mais, ou fototipo quatro a seis.",
    desenho: (t) => (
      <div>
        <div className="grid grid-cols-3 gap-3 max-w-xl mx-auto">
          <GradeVarredura ordem={ORDEM_NORMAL} t={t} nome="Normal" />
          <GradeVarredura ordem={ORDEM_INTERLACED} t={t} nome="Interlaced" />
          <GradeVarredura ordem={ORDEM_SMARTTRACK} t={t} nome="SmartTrack" />
        </div>
        <p className="text-center text-xs text-muted mt-2">
          O brilho laranja é o calor dos últimos disparos. Ilustração da ideia, não o caminho exato do aparelho.
        </p>
      </div>
    ),
  },
  {
    titulo: "7. Forma da área e passadas",
    duracao: 16000,
    fala:
      "A área de cada disparo pode ser quadrada, hexagonal, triangular, elíptica ou um ponto só. Áreas grandes e planas pedem quadrado ou hexágono; contornos como nariz, lábio e pálpebra, triângulo, elipse ou área pequena; cicatriz isolada, o ponto. Encaixe os disparos lado a lado sem sobrepor: a faixa sobreposta recebe dose dobrada e é causa comum de mancha e cicatriz em linha. Uma segunda passada também soma densidade.",
    desenho: (t) => {
      const formas = ["Quadrado", "Hexágono", "Triângulo", "Elipse", "Ponto"];
      const vistas = Math.ceil(fase(t, 0.02, 0.45) * formas.length);
      return (
        <div className="max-w-xl mx-auto">
          <div className="grid grid-cols-5 gap-2">
            {formas.map((f, i) => (
              <Forma key={f} tipo={f} visivel={i < vistas} />
            ))}
          </div>
          <div className="mt-3 border border-line p-1.5">
            <Sobreposicao k={fase(t, 0.5, 0.92)} />
          </div>
        </div>
      );
    },
  },
  {
    titulo: "8. Peça focada (sem scanner)",
    duracao: 15000,
    fala:
      "Com a peça de mão focada não há scanner, então spacing, stack e time não se aplicam. Ajusta-se o modo, a potência e a frequência, que é quantos disparos por segundo. Os modos pulsados vaporizam lesões isoladas com controle. O contínuo, CW, é para corte e vaporização e produz muito calor: nunca é usado em tratamento fracionado.",
    desenho: (t) => {
      const hz = lerp(3, 15, fase(t, 0.1, 0.8));
      return (
        <div className="max-w-xl mx-auto">
          <div className="border border-line p-2">
            <TremDePulsos hz={hz} t={t} />
          </div>
          <Leitura
            itens={[
              { rotulo: "Modo", valor: "SP · HP · CW" },
              { rotulo: "Frequência", valor: `${Math.round(hz)} Hz`, destaque: true },
            ]}
          />
        </div>
      );
    },
  },
  {
    titulo: "Resumo e regras de segurança",
    duracao: 18000,
    fala:
      "Resumindo: profundidade vem de potência, time e stack. Calor vem do time, do modo de pulso e da varredura. Densidade vem do spacing e das passadas. Mude um parâmetro por vez entre sessões, de dez a vinte por cento, e só se a anterior cicatrizou sem mancha. Em fototipo alto, menos watts, menos time e spacing maior, juntos. Comece sempre pelo teste. A recomendação da ferramenta é um ponto de partida: a decisão final é do médico.",
    desenho: (t) => {
      const grupos = [
        { titulo: "Profundidade", itens: "Potência · Time · Stack" },
        { titulo: "Calor", itens: "Time · Pulso (HP < DP < SP) · Varredura" },
        { titulo: "Densidade", itens: "Spacing · Passadas" },
      ];
      const regras = [
        "Mude um parâmetro por vez, 10–20% por sessão",
        "Fototipo alto: menos W, menos time, spacing maior",
        "Pele fina: reduza potência e densidade juntas",
        "Comece pelo teste; a decisão final é do médico",
      ];
      const k = fase(t, 0.02, 0.8);
      const nGrupos = Math.ceil(k * 2 * grupos.length);
      const nRegras = Math.max(0, Math.ceil((k * 2 - 1) * regras.length));
      return (
        <div className="max-w-2xl mx-auto">
          <div className="grid sm:grid-cols-3 gap-3">
            {grupos.map((g, i) => (
              <div
                key={g.titulo}
                className="border border-line p-3 transition-opacity duration-500"
                style={{ opacity: i < nGrupos ? 1 : 0.1 }}
              >
                <p className="font-display text-xl text-ink">{g.titulo}</p>
                <p className="text-sm text-muted mt-1">{g.itens}</p>
              </div>
            ))}
          </div>
          <ul className="mt-4 space-y-1.5">
            {regras.map((r, i) => (
              <li
                key={r}
                className="text-sm text-ink border-l-2 border-accent pl-3 transition-opacity duration-500"
                style={{ opacity: i < nRegras ? 1 : 0.1 }}
              >
                {r}
              </li>
            ))}
          </ul>
        </div>
      );
    },
  },
];

// ============================================================================
//  Narração (voz do navegador)
// ============================================================================

function vozPortugues(): SpeechSynthesisVoice | null {
  const vozes = window.speechSynthesis.getVoices();
  return (
    vozes.find((v) => v.lang === "pt-BR") ??
    vozes.find((v) => v.lang.toLowerCase().startsWith("pt")) ??
    null
  );
}

/**
 * Fala o texto em frases separadas: o Chrome corta utterances longas por
 * volta de 15 s em algumas vozes.
 */
function falar(texto: string, aoTerminar: () => void) {
  const sintese = window.speechSynthesis;
  sintese.cancel();
  const frases = texto.match(/[^.!?]+[.!?]*/g)?.map((f) => f.trim()).filter(Boolean) ?? [texto];
  const voz = vozPortugues();
  frases.forEach((frase, i) => {
    const u = new SpeechSynthesisUtterance(frase);
    u.lang = "pt-BR";
    if (voz) u.voice = voz;
    u.rate = 1.02;
    if (i === frases.length - 1) u.onend = aoTerminar;
    sintese.speak(u);
  });
}

// ============================================================================
//  Player
// ============================================================================

export function AulaParametros() {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setAberta(true)}>
        ▶ Aula: entenda cada parâmetro
      </Button>
      {aberta ? <Player onClose={() => setAberta(false)} /> : null}
    </>
  );
}

function Player({ onClose }: { onClose: () => void }) {
  const [indice, setIndice] = useState(0);
  const [t, setT] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [narracao, setNarracao] = useState(false);
  const [temVoz, setTemVoz] = useState(false);
  const falaAcabou = useRef(true);
  const raiz = useRef<HTMLDivElement>(null);
  const cena = CENAS[indice];

  useEffect(() => {
    setTemVoz(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  const irPara = useCallback((i: number) => {
    setIndice(limitar(i, 0, CENAS.length - 1));
    setT(0);
  }, []);

  // Fala da cena: começa quando a cena entra (ou quando dá play/liga a voz).
  useEffect(() => {
    if (!temVoz) return;
    if (tocando && narracao) {
      falaAcabou.current = false;
      falar(CENAS[indice].fala, () => {
        falaAcabou.current = true;
      });
    } else {
      window.speechSynthesis.cancel();
      falaAcabou.current = true;
    }
  }, [indice, tocando, narracao, temVoz]);

  // Relógio da cena.
  useEffect(() => {
    if (!tocando) return;
    let anterior = performance.now();
    let quadro = 0;
    const passo = () => {
      // Limita o salto: com a aba em segundo plano o rAF para e, na volta,
      // um dt de minutos pularia a cena inteira.
      const agora = performance.now();
      const dt = Math.min(Math.max(agora - anterior, 0), 100);
      anterior = agora;
      setT((v) => Math.min(1, v + dt / CENAS[indice].duracao));
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [tocando, indice]);

  // Fim da cena: avança quando o tempo acabou e a fala (se houver) terminou.
  useEffect(() => {
    if (!tocando || t < 1) return;
    const id = window.setInterval(() => {
      if (!falaAcabou.current) return;
      window.clearInterval(id);
      if (indice < CENAS.length - 1) {
        irPara(indice + 1);
      } else {
        setTocando(false);
      }
    }, 150);
    return () => window.clearInterval(id);
  }, [t, tocando, indice, irPara]);

  const alternar = useCallback(() => {
    // No fim da última cena, reproduzir de novo começa do início.
    if (!tocando && t >= 1 && indice === CENAS.length - 1) irPara(0);
    setTocando(!tocando);
  }, [tocando, t, indice, irPara]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === " ") {
        e.preventDefault();
        alternar();
      } else if (e.key === "ArrowRight") irPara(indice + 1);
      else if (e.key === "ArrowLeft") irPara(indice - 1);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [alternar, irPara, indice, onClose]);

  function telaCheia() {
    const el = raiz.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/60 flex items-start justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={raiz}
        role="dialog"
        aria-modal="true"
        aria-label="Aula sobre os parâmetros do laser"
        className="bg-paper w-full max-w-4xl border border-line flex flex-col overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <p className="text-[11px] uppercase tracking-wide text-muted">
            Aula · SmartXide Punto · cena {indice + 1} de {CENAS.length}
          </p>
          <div className="flex gap-1">
            <button type="button" onClick={telaCheia} className="text-sm px-2 py-1 hover:bg-line" title="Tela cheia">
              ⛶
            </button>
            <button type="button" onClick={onClose} className="text-sm px-2 py-1 hover:bg-line" title="Fechar (Esc)">
              ✕
            </button>
          </div>
        </div>

        <h2 className="font-display text-2xl sm:text-3xl text-ink tracking-tight px-4 mt-1">{cena.titulo}</h2>

        <div className="px-4 py-4 flex-1">{cena.desenho(t)}</div>

        <p className="px-4 text-sm text-ink/80 leading-relaxed">{cena.fala}</p>

        {/* Linha do tempo: um segmento por cena, clicável. */}
        <div className="flex gap-1 px-4 mt-4">
          {CENAS.map((c, i) => (
            <button
              key={c.titulo}
              type="button"
              onClick={() => irPara(i)}
              title={c.titulo}
              className="flex-1 h-2 bg-line relative overflow-hidden"
              aria-label={`Ir para: ${c.titulo}`}
            >
              <span
                className="absolute inset-y-0 left-0 bg-accent"
                style={{ width: `${i < indice ? 100 : i === indice ? t * 100 : 0}%` }}
              />
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => irPara(indice - 1)} disabled={indice === 0}>
              ◀ Anterior
            </Button>
            <Button size="sm" onClick={alternar}>
              {tocando ? "❚❚ Pausar" : "▶ Reproduzir"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => irPara(indice + 1)}
              disabled={indice === CENAS.length - 1}
            >
              Próxima ▶
            </Button>
          </div>
          <div className="flex items-center gap-3">
            {temVoz ? (
              <label className="flex items-center gap-1.5 text-sm text-ink cursor-pointer">
                <input type="checkbox" checked={narracao} onChange={(e) => setNarracao(e.target.checked)} />
                🔊 Narração
              </label>
            ) : null}
            <span className="text-[11px] text-muted hidden sm:inline">Espaço pausa · ← → trocam a cena</span>
          </div>
        </div>
      </div>
    </div>
  );
}
