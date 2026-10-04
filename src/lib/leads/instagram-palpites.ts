import { toInstagramHandle } from "./instagram";

/**
 * Palpites de @ a partir do nome da planilha — código puro, sem rede, usado
 * nos dois lados: a busca com IA recebe como pistas, e a ficha mostra como
 * links para o dono abrir no próprio Instagram (logado, que não é barrado).
 *
 * Contra os 229 pares nome → @ da planilha de prospecção, o @ real está entre
 * os palpites em 129 (56%), e entre os 8 primeiros (os que a ficha mostra) em 122.
 */

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e"]);

/** Palavras que encerram o nome da pessoa: daí em diante é descrição. */
const DESCRICAO =
  /^(cl[ií]nica|est[eé]tica|avan[cç]ada|dermatolog\p{L}*|derma|cirurgi\p{L}*|pl[aá]stic\p{L}*|oftalmolog\p{L}*|blefaroplastia|harmoniza[cç][aã]o|odonto\p{L}*|dentista|m[eé]dic\p{L}*|crm\p{L}*|instituto|centro|hospital|em|no|na)$/iu;

const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const slug = (t: string) => semAcento(t).toLowerCase().replace(/[^a-z0-9]/g, "");

export type Pessoa = { titulo: "dr" | "dra" | null; partes: string[] };

/**
 * Pessoas citadas no nome da planilha, como [primeiro, ..., último].
 *
 * "Dra. Izabela Lidia Soares Cardeal - Dermatologista" vira
 * [["Izabela", "Lidia", "Soares", "Cardeal"]]; "Clínica X (Dr. A B e Dra. C D)"
 * vira as duas pessoas dos parênteses; "Clínica Dra. Melissa Martins" vira
 * Melissa Martins. Sem nenhum "Dr."/"Dra.", só o primeiro trecho, e só se não
 * for nome de clínica.
 */
function pessoasDoNome(nome: string): Pessoa[] {
  const trechos = nome
    .split(/\s[-–|]\s|[()/,;]|\s+e\s+(?=dra?\.?\s)/i)
    .map((t) => t.trim())
    .filter(Boolean);
  const comTitulo = trechos
    .map((t) => t.match(/(?:^|\s)(dra?)\.?\s+(.+)$/i))
    .filter((m): m is RegExpMatchArray => m != null)
    .map((m) => ({ titulo: m[1].toLowerCase() as "dr" | "dra", resto: m[2] }));
  // Sem título: o primeiro trecho, cortado na descrição ("Ricardo Silveira
  // Cirurgia Plástica" → Ricardo Silveira), se não começar como clínica.
  const escolhidos = comTitulo.length
    ? comTitulo
    : /^(cl[ií]nica|instituto|centro|hospital|est[eé]tica|cirurgia)/i.test(trechos[0] ?? "")
      ? []
      : trechos.slice(0, 1).map((resto) => ({ titulo: null, resto }));

  const pessoas: Pessoa[] = [];
  for (const { titulo, resto } of escolhidos) {
    const partes: string[] = [];
    for (const p of resto.split(/\s+/)) {
      if (DESCRICAO.test(p)) break;
      if (/^\p{L}+$/u.test(p) && !PARTICULAS.has(p.toLowerCase())) partes.push(p);
    }
    if (partes.length >= 2) pessoas.push({ titulo, partes });
  }
  return pessoas.slice(0, 3);
}

export type Palpites = { nomesCurtos: string[]; handles: string[]; pessoas: Pessoa[] };

/** Pistas determinísticas: o modelo barato errava ao montá-las sozinho. */
export function montarPalpites(d: {
  nomes: string[];
  especialidade: string | null;
  excluir?: string[];
}): Palpites {
  const contexto = semAcento(`${d.especialidade ?? ""} ${d.nomes.join(" ")}`).toLowerCase();
  const sufixo = /dermat/.test(contexto)
    ? "dermato"
    : /oftalm|blefaro/.test(contexto)
      ? "oftalmo"
      : /plastic/.test(contexto)
        ? "plastica"
        : null;

  const nomesCurtos: string[] = [];
  const handles: string[] = [];
  // Em níveis, do formato mais comum na planilha para o mais raro, e só então
  // por combinação de nome: a ficha mostra os 8 primeiros, e "dr/dra + nome"
  // de qualquer combinação acerta mais que "nome sem título" da primeira.
  const niveis: string[][] = [[], [], [], [], []];
  const pessoas = d.nomes.flatMap(pessoasDoNome);
  for (const { titulo, partes } of pessoas) {
    const [primeiro, segundo] = partes;
    const ultimo = partes[partes.length - 1];
    const penultimo = partes[partes.length - 2];
    // Primeiro + último é o mais comum; com 3+ partes, também o nome composto
    // ("Ana Laura Rezende" → analaurarezende) e o sobrenome do meio.
    const combos: string[][] = [[primeiro, ultimo]];
    if (partes.length >= 3) {
      combos.push([primeiro, segundo, ultimo]);
      if (penultimo.length >= 3) combos.push([primeiro, penultimo]);
    }
    for (const combo of combos) {
      nomesCurtos.push(combo.join(" "));
      const base = slug(combo.join(""));
      const t = titulo ?? "dra";
      niveis[0].push(`${t}${base}`);
      niveis[1].push(`${t}.${base}`);
      if (sufixo) niveis[2].push(`${base}${sufixo}`, `${base}.${sufixo}`);
      niveis[3].push(base);
      if (sufixo) niveis[4].push(`${base}_${sufixo}`);
    }
  }
  handles.push(...niveis.flat());
  // Sem médico com título, pode ser clínica: o @ costuma ser o nome dela
  // junto, com ou sem a palavra "clínica".
  if (!pessoas.some((p) => p.titulo)) {
    for (const nome of d.nomes) {
      const primeiro = nome.split(/\s[-–|]\s|[(),]/)[0] ?? "";
      handles.push(
        slug(primeiro),
        slug(primeiro.replace(/\b(cl[ií]nica|de|da|do|e)\b/giu, "")),
      );
    }
  }

  const unicos = (l: string[]) => [...new Set(l.filter((h) => h.length >= 4))];
  return {
    nomesCurtos: unicos(nomesCurtos),
    handles: unicos(handles)
      .filter((h) => toInstagramHandle(h) === h && !d.excluir?.includes(h))
      .slice(0, 15),
    pessoas,
  };
}
