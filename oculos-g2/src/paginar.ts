import { getTextWidth, measureTextWrap, pxTruncate } from "@evenrealities/pretext";
import type { PaginaOculos } from "./contrato";

/**
 * Corta o texto vindo do painel em telas do óculos.
 *
 * O G2 não rola texto: o que passa da caixa some. Então cada página do
 * painel vira uma ou mais telas, medidas com a mesma métrica de fonte do
 * firmware (@evenrealities/pretext), e o médico passa de tela deslizando.
 */

/** Tela do G2: 576×288, linha de 27 px, fonte única. */
export const TELA = { largura: 576, altura: 288, linha: 27 } as const;

/** Cabeçalho de uma linha no topo, corpo no resto. */
// O cabeçalho precisa de altura útil ≥ 27 px (uma linha); com menos, o
// firmware desenha uma barra de rolagem.
export const CABECALHO = { y: 0, altura: 36, padding: 4 } as const;
export const CORPO = { y: 40, altura: TELA.altura - 40, padding: 8 } as const;

const LARGURA_UTIL = TELA.largura - 2 * CORPO.padding;
const LINHAS_POR_TELA = Math.floor((CORPO.altura - 2 * CORPO.padding) / TELA.linha);

/** O firmware recusa texto acima de 999 bytes por caixa e item de lista acima de 63. */
const BYTES_TEXTO = 990;
export const BYTES_ITEM = 63;

export type Tela = { titulo: string; texto: string };

const bytes = (s: string) => new TextEncoder().encode(s).length;
const linhasDe = (s: string) => measureTextWrap(s, LARGURA_UTIL).lineCount;

/** Quebra um parágrafo grande demais para uma tela inteira, por palavras. */
function partirParagrafo(p: string): string[] {
  const palavras = p.split(/\s+/);
  const partes: string[] = [];
  let atual = "";
  for (const w of palavras) {
    const tentativa = atual ? `${atual} ${w}` : w;
    if (atual && (linhasDe(tentativa) > LINHAS_POR_TELA || bytes(tentativa) > BYTES_TEXTO)) {
      partes.push(atual);
      atual = w;
    } else {
      atual = tentativa;
    }
  }
  if (atual) partes.push(atual);
  return partes;
}

/** Junta parágrafos numa tela enquanto couberem; o que sobra abre outra. */
export function paginar(paginas: PaginaOculos[]): Tela[] {
  const telas: Tela[] = [];
  for (const pagina of paginas) {
    const blocos = pagina.linhas.flatMap((l) =>
      linhasDe(l) > LINHAS_POR_TELA || bytes(l) > BYTES_TEXTO ? partirParagrafo(l) : [l],
    );
    let atual: string[] = [];
    const fechar = () => {
      if (atual.length) telas.push({ titulo: pagina.titulo, texto: atual.join("\n") });
      atual = [];
    };
    for (const b of blocos) {
      const tentativa = [...atual, b].join("\n");
      if (atual.length && (linhasDe(tentativa) > LINHAS_POR_TELA || bytes(tentativa) > BYTES_TEXTO)) {
        fechar();
      }
      atual.push(b);
    }
    fechar();
  }
  return telas;
}

/** Cabe numa linha do cabeçalho ou num item de lista (pixels e bytes). */
export function caberNaLinha(texto: string, larguraPx: number, maxBytes = BYTES_TEXTO): string {
  let t = getTextWidth(texto) > larguraPx ? pxTruncate(texto, larguraPx) : texto;
  while (bytes(t) > maxBytes) t = `${[...t].slice(0, -4).join("")}...`;
  return t;
}
