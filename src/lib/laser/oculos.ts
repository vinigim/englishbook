import { randomInt } from "node:crypto";
import { LESOES_FOCAIS, num } from "./protocolo-premium";
import {
  INDICACAO_LABEL,
  REGIAO_LABEL,
  VIABILIDADE_LABEL,
  type ConsultaGravada,
  type ParametrosRealizados,
} from "./tipos";

/**
 * O que o óculos Even G2 recebe de uma locação.
 *
 * O texto sai pronto daqui, e o app do óculos (oculos-g2/) só pagina e
 * desenha. Assim, mudar o que aparece no óculos é um deploy do painel, sem
 * nova versão do app passando pela revisão do Even Hub. O formato é o
 * contrato com o app: mudou algo incompatível, sobe `versao` e trata no app.
 *
 * A tela do G2 é monocromática, 576×288, uma fonte só, e a fonte do
 * firmware não tem "µ". Por isso time e spacing vão sem unidade, como na
 * tabela do treinamento Premium.
 */

export type PaginaOculos = { titulo: string; linhas: string[] };

export type ConsultaOculos = {
  id: string;
  /** Uma linha na lista: indicação · região · fototipo. */
  titulo: string;
  paginas: PaginaOculos[];
};

export type RespostaOculos = {
  versao: 1;
  locacao: { medico: string; data: string; equipamento: string | null };
  consultas: ConsultaOculos[];
};

// ============================================================================
//  Código de acesso
// ============================================================================

/** Sem 0/O, 1/I/L, como o código das janelas: é digitado e às vezes ditado. */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODIGO_OCULOS = /^[A-HJKMNP-Z2-9]{8}$/;

/** Aleatório (31⁸ ≈ 850 bilhões): ao contrário do link da janela, não pode ser derivável. */
export function novoCodigoOculos(): string {
  let codigo = "";
  for (let i = 0; i < 8; i++) codigo += ALFABETO[randomInt(ALFABETO.length)];
  return codigo;
}

/** "k7m2-qx9p " → "K7M2QX9P". */
export function normalizarCodigo(bruto: string): string {
  return bruto.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** "K7M2QX9P" → "K7M2-QX9P", para mostrar. */
export function formatarCodigo(codigo: string): string {
  return `${codigo.slice(0, 4)}-${codigo.slice(4)}`;
}

/**
 * O código só abre a locação da véspera até dois dias depois dela.
 *
 * Fora disso não há motivo para o óculos ler os parâmetros, e um código
 * esquecido num celular deixa de valer sozinho.
 */
export const DIAS_ANTES = 1;
export const DIAS_DEPOIS = 2;

/** "2026-10-08" → "08/10/2026", sem passar por Date (que mudaria o dia pelo fuso). */
export function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function dentroDaJanela(dataLocacao: string, agora = new Date()): boolean {
  const hoje = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const dias = (Date.parse(hoje) - Date.parse(dataLocacao)) / 86_400_000;
  return dias >= -DIAS_ANTES && dias <= DIAS_DEPOIS;
}

// ============================================================================
//  Texto das páginas
// ============================================================================

function tituloDaConsulta(c: ConsultaGravada): string {
  const e = c.entrada;
  const lesao = e.lesaoFocal ? LESOES_FOCAIS.find((l) => l.id === e.lesaoFocal) : null;
  const indicacao = lesao
    ? lesao.nome
    : e.indicacao === "outra"
      ? "Outra indicação"
      : INDICACAO_LABEL[e.indicacao];
  return [indicacao, REGIAO_LABEL[e.regiao], `fototipo ${e.fototipo}`]
    .map(semParenteses)
    .join(" · ");
}

/** "Região malar (bochechas)" → "Região malar": a linha do óculos é curta. */
function semParenteses(t: string): string {
  return t.replace(/\s*\([^)]*\)/g, "");
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

function paginaParametros(c: ConsultaGravada, avisos: number): PaginaOculos {
  const { recomendacao: rec, bloqueadoPor } = c.resposta;

  if (bloqueadoPor) {
    return { titulo: "Não tratar", linhas: [bloqueadoPor] };
  }
  if (rec.viabilidade === "nao_recomendado") {
    return { titulo: VIABILIDADE_LABEL.nao_recomendado, linhas: [rec.resumo] };
  }

  const linhas: string[] = [];
  const p = rec.parametros;
  const f = rec.parametros_focada;
  let titulo = "Parâmetros";
  if (p) {
    linhas.push(`${p.modo_emissao.valor} · ${num(p.potencia_w.valor)} W`);
    linhas.push(
      [
        p.dwell_time_us ? `Time ${num(p.dwell_time_us.valor)}` : "Time: não se ajusta no HP",
        `Spacing ${num(p.spacing_um.valor)}`,
      ].join(" · "),
    );
    linhas.push(`SmartStack ${num(p.smartstack.valor)} · ${p.modo_varredura.valor}`);
    linhas.push(`${p.forma_area.valor} · ${plural(p.passadas.valor, "passada", "passadas")}`);
  } else if (f) {
    titulo = "Peça focada";
    linhas.push(`${f.modo} · ${num(f.potencia_w)} W`);
    linhas.push(f.frequencia_hz == null ? "Contínuo (CW)" : `${num(f.frequencia_hz)} Hz`);
  } else {
    linhas.push(rec.resumo);
  }

  if (rec.viabilidade === "indicado_com_ressalvas") linhas.push("Indicado com ressalvas.");
  if (avisos > 0) {
    linhas.push(`! ${plural(avisos, "alerta", "alertas")} na próxima página`);
  }
  return { titulo, linhas };
}

function paginaRealizado(r: ParametrosRealizados): PaginaOculos {
  const partes = [
    r.modo,
    r.potencia != null ? `${num(r.potencia)} W` : null,
    r.dwell != null ? `Time ${num(r.dwell)}` : null,
    r.spacing != null ? `Spacing ${num(r.spacing)}` : null,
    r.stack != null ? `SmartStack ${r.stack}` : null,
    r.varredura,
    r.passadas != null ? plural(r.passadas, "passada", "passadas") : null,
  ].filter((x): x is string => Boolean(x));
  const linhas = [partes.join(" · ")];
  if (r.notas) linhas.push(r.notas);
  return { titulo: "Registrado como usado", linhas };
}

/**
 * Código pessoal: a lista mistura locações e dias, então cada linha começa
 * pela data (a da locação, ou a da consulta quando não há locação) e a
 * primeira tela diz de quem era.
 */
export function consultaParaOculosPessoal(c: ConsultaGravada): ConsultaOculos {
  const base = consultaParaOculos(c);
  const loc = c.resposta.locacao;
  const dia = loc
    ? dataBR(loc.data).slice(0, 5)
    : DIA_MES.format(new Date(c.createdAt));
  const [primeira, ...resto] = base.paginas;
  const quem = loc
    ? [loc.medico, loc.equipamento].filter(Boolean).join(" · ")
    : "Sem locação";
  return {
    ...base,
    titulo: `${dia} · ${base.titulo}`,
    paginas: [{ ...primeira, linhas: [quem, ...primeira.linhas] }, ...resto],
  };
}

const DIA_MES = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
});

export function consultaParaOculos(c: ConsultaGravada): ConsultaOculos {
  const { recomendacao: rec, verificacoes, bloqueadoPor, realizado } = c.resposta;
  const avisos = bloqueadoPor ? [] : [...rec.alertas, ...verificacoes];

  const paginas: PaginaOculos[] = [paginaParametros(c, avisos.length)];
  if (avisos.length > 0) {
    paginas.push({ titulo: "Alertas", linhas: avisos.map((a) => `• ${a}`) });
  }
  if (realizado) paginas.push(paginaRealizado(realizado));
  if (!bloqueadoPor && rec.viabilidade !== "nao_recomendado") {
    paginas.push({
      titulo: "Protocolo",
      linhas: [
        `Sessões: ${rec.protocolo.sessoes}`,
        `Intervalo: ${rec.protocolo.intervalo}`,
        `Teste: ${rec.protocolo.teste_previo}`,
        `Próxima: ${rec.protocolo.como_progredir}`,
      ],
    });
    paginas.push({ titulo: "Resumo", linhas: [rec.resumo] });
  }

  return { id: c.resposta.id ?? "", titulo: tituloDaConsulta(c), paginas };
}
