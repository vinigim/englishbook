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
const MAX_PESQUISAS = 3;

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
  /**
   * Perfil que o dono marcou como errado (não existe, ou é de outra pessoa).
   * Não pode voltar como candidato — nem pelo prompt, nem pelo filtro.
   */
  excluir?: string | null;
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

Como pesquisar:
1. Primeiro, só o nome da pessoa, SEM "Clínica", "Dr." ou "Dra." (ex.: "Victor Guida França"). Médico costuma ter perfil próprio com o nome completo.
2. Se não achar, o nome com a especialidade ou a cidade.
3. Depois, o nome da clínica, se ele for diferente do nome da pessoa.
Um nome que aparece no título de um perfil com a especialidade compatível já é um bom candidato.

Regras:
- Só proponha perfis que APARECERAM nos resultados da pesquisa (instagram.com/<perfil> na URL ou @perfil no título/trecho). Nunca complete ou adivinhe um @.
- Prefira o perfil profissional da pessoa ou da clínica. Perfil de fã, de paciente, de outra clínica homônima em outra cidade: não proponha, ou proponha com confiança baixa explicando a dúvida.
- Confiança "alta" só quando nome E cidade (ou clínica, ou telefone) batem. "media" quando só o nome bate e a especialidade é compatível. "baixa" no resto.
- No máximo 3 candidatos, do mais provável para o menos.
- Se não achar nada confiável, devolva a lista vazia. Lista vazia é uma resposta boa; perfil errado é ruim.

Termine a resposta com um bloco JSON, e nada depois dele:
\`\`\`json
{"candidatos":[{"handle":"perfil_sem_arroba","confianca":"alta|media|baixa","motivo":"frase curta em português","fonte":"URL do resultado onde viu"}],"observacao":"frase curta opcional"}
\`\`\``;

function descreverLead(d: DadosParaBusca): string {
  const linhas = [
    d.nomes.length ? `Nome(s): ${d.nomes.join(" / ")}` : null,
    d.clinica ? `Clínica: ${d.clinica}` : null,
    d.especialidade ? `Especialidade: ${d.especialidade}` : null,
    d.cidade || d.uf ? `Cidade: ${[d.cidade, d.uf].filter(Boolean).join(" - ")}` : null,
    d.telefone ? `Telefone: ${d.telefone}` : null,
    ...d.extras.map(([k, v]) => `${k}: ${v}`),
  ].filter(Boolean);
  const aviso = d.excluir
    ? `\n\nO perfil @${d.excluir} está ERRADO (não existe ou não é deste lead). Não o proponha; procure outro.`
    : "";
  return `Ache o Instagram deste lead:\n${linhas.join("\n")}${aviso}`;
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
    if (!handle || vistos.has(handle) || handle === dados.excluir) continue;
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
