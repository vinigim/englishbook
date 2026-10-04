import type Anthropic from "@anthropic-ai/sdk";
import { toInstagramHandle } from "@/lib/leads/instagram";
import { TRIAGE_MODEL, getAnthropic } from "./anthropic";
import { estimateCostUsd } from "./cost";

/**
 * Procura o Instagram de um lead na web, com a pesquisa da própria API.
 *
 * A IA NÃO decide nada: devolve candidatos, e o dono escolhe na tela. Homônimo
 * é comum ("Dra. Ana dermatologista"), e um @ errado manda a apresentação
 * para a pessoa errada.
 *
 * Duas travas contra @ inventado:
 *  - o prompt proíbe propor perfil que não apareceu na busca;
 *  - e o código confere: só passa candidato cujo @ aparece na URL ou no
 *    título de algum resultado da pesquisa. O que o modelo "lembrou" sem ter
 *    visto é descartado aqui, não na confiança de que ele obedeceu.
 *
 * Modelo barato de propósito (o da triagem): quem julga no fim é o dono, e a
 * verificação acima segura o erro mais caro.
 */

/** US$ por pesquisa na web (US$ 10 por mil), cobrado à parte dos tokens. */
const PRECO_PESQUISA_USD = 0.01;

/** Pesquisas por busca. Teto de gasto e de tempo. */
const MAX_PESQUISAS = 4;

/** Rodadas de continuação quando a API pausa um turno longo. */
const MAX_CONTINUACOES = 3;

export type DadosParaBusca = {
  nomes: string[];
  clinica: string | null;
  especialidade: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  /** Colunas extras da planilha (site, e-mail…), só as curtas. */
  extras: [string, string][];
  /** Números de CRM achados na planilha. Muito médico põe o CRM na bio. */
  crms?: string[];
  /**
   * Perfis que o dono marcou como errados (não existem, ou são de outra
   * pessoa). Não podem voltar como candidato — nem pelo prompt, nem pelo filtro.
   */
  excluir?: string[];
};

export type CandidatoInstagram = {
  handle: string;
  confianca: "alta" | "media" | "baixa";
  motivo: string;
  fonte: string | null;
};

export type ResultadoBusca = {
  candidatos: CandidatoInstagram[];
  /** Candidatos que o modelo citou mas não estavam nos resultados. */
  descartados: number;
  observacao: string | null;
  pesquisas: number;
  custoUsd: number;
};

const SISTEMA = `Você ajuda a Lux Derma, empresa que aluga lasers para médicos e clínicas de estética no Brasil, a achar o perfil do Instagram de um lead.

Use a ferramenta de pesquisa na web. Ela está restrita ao instagram.com, então cada resultado já é um perfil ou post, com o nome e o @ no título (ex.: "Dr. Fulano (@drfulano) • Instagram").

## Leia o nome antes de pesquisar

O nome costuma vir da planilha com descrição junto: "Dra. Fernanda Paulo Guedes Carrenho", "Dr. Fábio Pascutti - Cirurgia Plástica", "Clínica Camila Caitano (Dra. Camila / Dra. Suraya)", "Vefago Clínica | Dra. Júlia Vefago". Separe:
- a(s) PESSOA(S): primeiro nome + sobrenomes, sem "Dr.", "Dra.", "Clínica" e sem a descrição que vem depois de " - " ou " | ". ATENÇÃO aos parênteses: quase sempre são os médicos da clínica ("Clínica Munia Rolim (Dr. Churdley Rolim e Dra. Luciana Munia Rolim)" são DUAS pessoas e uma clínica). Qualquer um deles serve: o perfil de um sócio já abre a conversa;
- a CLÍNICA, quando houver;
- a ESPECIALIDADE (dermatologia, cirurgia plástica, oftalmologia/blefaroplastia, harmonização, estética).

## Como os @ desse público costumam ser

Num levantamento de mais de 200 perfis de médicos e clínicas do interior de SP:
- O mais comum é dr/dra + primeiro nome + UM sobrenome, quase sempre o último, tudo junto e sem acento: "Dra. Cláudia Alves Lapa" → draclaudialapa; "Dr. Fábio Pascutti" → drfabiopascutti; "Dr Bruno Müzel" → drbrunomuzel. Às vezes o sobrenome do meio: "Dra. Marisa Moretto Zillo" → dramarisamoretto.
- Ponto ou sublinhado podem aparecer depois do dr/dra ou entre as partes: dra.carolinasapia, dr.marcos_storion, dr_robertotussi.
- Dermatologistas muitas vezes têm o sufixo da especialidade, com ou sem "dra": analaurarezende.dermato, brunacestari_dermato, claudiasandridermato, draellendermato. Oftalmologistas usam "oftalmo" (dra.angelalu.oftalmo); cirurgiões plásticos às vezes "plastica" (drcabralplastica, draalinerezendeplastica).
- Apelido no lugar do nome: Manuela → manu (dramanujorge), Beatriz → bia, Cristina → cris.
- Clínica: o nome dela junto, às vezes com a cidade ou "oficial" (clinicastatusbauru, royalface.marilia, virtuosaaracatuba, eleganceestetica_oficial).
- Clínica com o sobrenome do médico costuma ter o @ do MÉDICO: "Cirurgia Plástica Faleiros" → drhumbertofaleiros; "Dinalli Cirurgia Plástica" → drrodolfodinalli.

## Como pesquisar

A mensagem traz, quando dá, "Pistas para a pesquisa" montadas pelo sistema: o nome curto (primeiro + último nome, que é como o médico se apresenta no perfil), @ prováveis e o CRM. Use-as.
1. O nome curto, com a especialidade (ex.: "Izabela Cardeal dermatologista"). O nome completo da planilha ("Izabela Lidia Soares Cardeal") quase nunca é o nome do perfil.
2. O CRM, se houver (ex.: "CRM 140320"): médico costuma pôr o CRM na bio, e ele confirma a pessoa.
3. Os @ prováveis como palavra (ex.: "izabelacardealdermato"). O título do resultado mostra o @ real, que pode ser parecido mas não igual.
4. Depois, variações: outro sobrenome, ou o nome da clínica com a cidade.
Use TODAS as pesquisas disponíveis antes de devolver a lista vazia.
Com mais de uma pessoa, distribua as pesquisas: a clínica e cada médico, começando por quem tem a especialidade mais próxima de dermatologia, plástica ou estética.
Não repita uma pesquisa que já não deu resultado com outras palavras quase iguais.

## Regras

- Só proponha perfis que APARECERAM nos resultados da pesquisa (instagram.com/<perfil> na URL ou @perfil no título/trecho). Os padrões acima servem para PESQUISAR, nunca para inventar um @: se o @ que você imaginou não apareceu, ele não entra.
- Prefira o perfil profissional da pessoa ou da clínica. Perfil de fã, de paciente, de outra clínica homônima em outra cidade: não proponha, ou proponha com confiança baixa explicando a dúvida.
- O índice da pesquisa pode estar velho: perfil renomeado ou apagado continua aparecendo. Prefira o @ cujo PRÓPRIO perfil apareceu como resultado (URL instagram.com/<perfil>/ com o nome no título). Um @ que só aparece citado em post, reel ou perfil de terceiros, ou com cara de conta antiga (números soltos, "old", "antigo"), vai no máximo com confiança "baixa", e diga no motivo que pode não existir mais. Sobrenome no @ não é sinal de conta antiga: Sales, Silva e Souza são sobrenomes.
- Especialidade diferente da do lead (ex.: o perfil é de cirurgia vascular e o lead é dermatologia) derruba a confiança um nível, mesmo com nome batendo.
- CRM igual ao do lead no perfil é confiança "alta" por si só.
- Confiança "alta" só quando nome E cidade (ou clínica, ou telefone) batem. "media" quando só o nome bate e a especialidade é compatível. "baixa" no resto.
- No máximo 3 candidatos, do mais provável para o menos.
- Se não achar nada confiável, devolva a lista vazia. Lista vazia é uma resposta boa; perfil errado é ruim.

Termine a resposta com um bloco JSON, e nada depois dele:
\`\`\`json
{"candidatos":[{"handle":"perfil_sem_arroba","confianca":"alta|media|baixa","motivo":"frase curta em português","fonte":"URL do resultado onde viu"}],"observacao":"frase curta opcional"}
\`\`\``;

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e"]);

/** Palavras que encerram o nome da pessoa: daí em diante é descrição. */
const DESCRICAO =
  /^(cl[ií]nica|est[eé]tica|avan[cç]ada|dermatolog\p{L}*|derma|cirurgi\p{L}*|pl[aá]stic\p{L}*|oftalmolog\p{L}*|blefaroplastia|harmoniza[cç][aã]o|odonto\p{L}*|dentista|m[eé]dic\p{L}*|crm\p{L}*|instituto|centro|hospital|em|no|na)$/iu;

const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const slug = (t: string) => semAcento(t).toLowerCase().replace(/[^a-z0-9]/g, "");

type Pessoa = { titulo: "dr" | "dra" | null; partes: string[] };

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

/** Pistas determinísticas: o modelo barato errava ao montá-las sozinho. */
function pistas(d: DadosParaBusca): string[] {
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
      handles.push(`${t}${base}`, base, `${t}.${base}`);
      if (sufixo) handles.push(`${base}${sufixo}`, `${base}.${sufixo}`, `${base}_${sufixo}`);
    }
  }
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
  const linhas: string[] = [];
  if (nomesCurtos.length) linhas.push(`Nome curto: ${unicos(nomesCurtos).join(" / ")}`);
  if (d.crms?.length) linhas.push(`CRM: ${d.crms.join(", ")}`);
  if (handles.length) {
    linhas.push(
      `@ prováveis (palpites para PESQUISAR, não para propor): ${unicos(handles).slice(0, 15).join(", ")}`,
    );
  }
  return linhas;
}

function descreverLead(d: DadosParaBusca): string {
  const linhas = [
    d.nomes.length ? `Nome(s): ${d.nomes.join(" / ")}` : null,
    d.clinica ? `Clínica: ${d.clinica}` : null,
    d.especialidade ? `Especialidade: ${d.especialidade}` : null,
    d.cidade || d.uf ? `Cidade: ${[d.cidade, d.uf].filter(Boolean).join(" - ")}` : null,
    d.telefone ? `Telefone: ${d.telefone}` : null,
    ...d.extras.map(([k, v]) => `${k}: ${v}`),
  ].filter(Boolean);
  const excluir = d.excluir ?? [];
  const aviso = excluir.length
    ? `\n\nEstes perfis estão ERRADOS (não existem ou não são deste lead): ${excluir.map((h) => `@${h}`).join(", ")}. Não os proponha, mesmo que voltem na pesquisa; procure outro.`
    : "";
  const dicas = pistas(d);
  const blocoPistas = dicas.length ? `\n\nPistas para a pesquisa:\n${dicas.join("\n")}` : "";
  return `Ache o Instagram deste lead:\n${linhas.join("\n")}${blocoPistas}${aviso}`;
}

/** Texto das URLs e títulos de todos os resultados de pesquisa da conversa. */
function textoDosResultados(conteudo: Anthropic.ContentBlock[]): string {
  const partes: string[] = [];
  for (const bloco of conteudo) {
    if (bloco.type !== "web_search_tool_result") continue;
    const resultados = Array.isArray(bloco.content) ? bloco.content : [];
    for (const r of resultados) {
      if (r.type === "web_search_result") partes.push(r.url, r.title);
    }
  }
  return partes.join("\n").toLowerCase();
}

function extrairJson(texto: string): unknown {
  const cercado = texto.match(/```(?:json)?\s*([\s\S]*?)```(?![\s\S]*```)/);
  const bruto = cercado?.[1] ?? texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1);
  try {
    return JSON.parse(bruto);
  } catch {
    return null;
  }
}

function apareceNosResultados(handle: string, resultados: string): boolean {
  const h = handle.toLowerCase().replace(/[.]/g, "\\.");
  // instagram.com/handle na URL, ou @handle no título. Borda depois do @ para
  // "dra.ana" não casar dentro de "dra.anapaula".
  return new RegExp(`(instagram\\.com/${h}(?![a-z0-9._])|@${h}(?![a-z0-9._]))`).test(
    resultados,
  );
}

export async function buscarInstagram(dados: DadosParaBusca): Promise<ResultadoBusca> {
  const client = getAnthropic();
  const mensagens: Anthropic.MessageParam[] = [
    { role: "user", content: descreverLead(dados) },
  ];

  const conteudo: Anthropic.ContentBlock[] = [];
  let entrada = 0;
  let saida = 0;
  let cacheLido = 0;
  let pesquisas = 0;

  for (let rodada = 0; rodada <= MAX_CONTINUACOES; rodada += 1) {
    const resposta = await client.messages.create({
      model: TRIAGE_MODEL,
      max_tokens: 2000,
      system: SISTEMA,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: MAX_PESQUISAS,
          // Só o instagram.com: na web inteira, o perfil some atrás de site
          // de clínica, Doctoralia e notícia, e a IA desistia com o perfil
          // existindo (caso real: @drvictorguidafranca, verificado, 13 mil
          // seguidores, não encontrado em 4 pesquisas abertas).
          allowed_domains: ["instagram.com"],
          user_location: { type: "approximate", country: "BR", timezone: "America/Sao_Paulo" },
        },
      ],
      messages: mensagens,
    });

    conteudo.push(...resposta.content);
    entrada += resposta.usage.input_tokens;
    saida += resposta.usage.output_tokens;
    cacheLido += resposta.usage.cache_read_input_tokens ?? 0;
    pesquisas += resposta.usage.server_tool_use?.web_search_requests ?? 0;

    // Turno longo pausado pela API: devolve o que veio e deixa continuar.
    if (resposta.stop_reason !== "pause_turn") break;
    mensagens.push({ role: "assistant", content: resposta.content });
  }

  const texto = conteudo
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const json = extrairJson(texto) as {
    candidatos?: { handle?: unknown; confianca?: unknown; motivo?: unknown; fonte?: unknown }[];
    observacao?: unknown;
  } | null;

  const resultados = textoDosResultados(conteudo);
  const vistos = new Set<string>();
  const candidatos: CandidatoInstagram[] = [];
  let descartados = 0;

  for (const c of json?.candidatos ?? []) {
    const handle = toInstagramHandle(typeof c.handle === "string" ? c.handle : null);
    if (!handle || vistos.has(handle) || dados.excluir?.includes(handle)) continue;
    vistos.add(handle);
    if (!apareceNosResultados(handle, resultados)) {
      descartados += 1;
      continue;
    }
    const confianca =
      c.confianca === "alta" || c.confianca === "media" ? c.confianca : "baixa";
    candidatos.push({
      handle,
      confianca,
      motivo: typeof c.motivo === "string" ? c.motivo.slice(0, 300) : "",
      fonte: typeof c.fonte === "string" && /^https?:\/\//.test(c.fonte) ? c.fonte : null,
    });
    if (candidatos.length >= 3) break;
  }

  const custoUsd =
    estimateCostUsd(TRIAGE_MODEL, {
      inputTokens: entrada,
      outputTokens: saida,
      cacheReadTokens: cacheLido,
    }) +
    pesquisas * PRECO_PESQUISA_USD;

  return {
    candidatos,
    descartados,
    observacao:
      typeof json?.observacao === "string" && json.observacao.trim()
        ? json.observacao.slice(0, 300)
        : json
          ? null
          : "A IA não devolveu a resposta no formato esperado.",
    pesquisas,
    custoUsd: Math.round(custoUsd * 10_000) / 10_000,
  };
}
