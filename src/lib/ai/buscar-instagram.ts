import type Anthropic from "@anthropic-ai/sdk";
import { toInstagramHandle } from "@/lib/leads/instagram";
import { montarPalpites, type Palpites } from "@/lib/leads/instagram-palpites";
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
  /** O que a IA pesquisou, para entender uma busca que não achou nada. */
  consultas: string[];
  observacao: string | null;
  pesquisas: number;
  custoUsd: number;
  /** Modelo que fez a busca. */
  modelo: string;
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

function pistas(d: DadosParaBusca, p: Palpites): string[] {
  const linhas: string[] = [];
  if (p.nomesCurtos.length) linhas.push(`Nome curto: ${p.nomesCurtos.join(" / ")}`);
  if (d.crms?.length) linhas.push(`CRM: ${d.crms.join(", ")}`);
  if (p.handles.length) {
    linhas.push(
      `@ prováveis (palpites para PESQUISAR, não para propor): ${p.handles.join(", ")}`,
    );
  }
  return linhas;
}

function descreverLead(d: DadosParaBusca, p: Palpites): string {
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
  const dicas = pistas(d, p);
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

/**
 * `modelo`: Haiku na busca em lote (volume, custo) e Sonnet na ficha, onde o
 * dono busca um lead de cada vez e paga mais por um julgamento melhor dos
 * candidatos. Quem escolhe é a rota.
 */
export async function buscarInstagram(
  dados: DadosParaBusca,
  modelo: string = TRIAGE_MODEL,
): Promise<ResultadoBusca> {
  const client = getAnthropic();
  const p = montarPalpites(dados);
  const mensagens: Anthropic.MessageParam[] = [
    { role: "user", content: descreverLead(dados, p) },
  ];

  const conteudo: Anthropic.ContentBlock[] = [];
  let entrada = 0;
  let saida = 0;
  let cacheLido = 0;
  let pesquisas = 0;

  for (let rodada = 0; rodada <= MAX_CONTINUACOES; rodada += 1) {
    const resposta = await client.messages.create({
      model: modelo,
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

  const consultas = conteudo
    .filter((b): b is Anthropic.ServerToolUseBlock => b.type === "server_tool_use")
    .map((b) => (b.input as { query?: unknown }).query)
    .filter((q): q is string => typeof q === "string")
    .slice(0, 8);

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
    estimateCostUsd(modelo, {
      inputTokens: entrada,
      outputTokens: saida,
      cacheReadTokens: cacheLido,
    }) +
    pesquisas * PRECO_PESQUISA_USD;

  return {
    candidatos,
    descartados,
    consultas,
    observacao:
      typeof json?.observacao === "string" && json.observacao.trim()
        ? json.observacao.slice(0, 300)
        : json
          ? null
          : "A IA não devolveu a resposta no formato esperado.",
    pesquisas,
    custoUsd: Math.round(custoUsd * 10_000) / 10_000,
    modelo,
  };
}
