import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { decodificarEntidades, htmlParaTexto } from "../filtro";
import type { Modelo } from "../tipos";

// ---------------------------------------------------------------------
// Lê a página de uma vaga colada à mão em "+ Vaga manual". Três fontes, da
// mais confiável para a menos:
//   1. JSON-LD schema.org/JobPosting — Gupy, Greenhouse, Lever, Workday e a
//      maioria dos ATS publicam para o Google for Jobs; dispensa a IA.
//   2. Notion (*.notion.site): a página é montada no navegador, então o HTML
//      vem vazio; lemos os blocos pela API interna que a própria página usa.
//   3. Texto da página + metadados, para a IA extrair os campos.
// ---------------------------------------------------------------------

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const MAX_TEXTO = 40_000;

/** Sites que não lemos: exigem login ou proíbem robôs nos termos de uso. */
const BLOQUEADOS = /(^|\.)(linkedin\.com|indeed\.com(\.br)?|glassdoor\.com(\.br)?|catho\.com\.br)$/i;

export class ErroLink extends Error {
  constructor(
    readonly codigo: "url_invalida" | "site_bloqueado" | "pagina_inacessivel" | "sem_conteudo",
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export interface VagaJsonLd {
  titulo: string;
  empresa: string;
  local: string;
  modelo: Modelo;
  descricao: string;
}

export interface PaginaVaga {
  url: string;
  /** Vaga completa vinda do JSON-LD, quando a página publica um. */
  jsonLd: VagaJsonLd | null;
  /** Título, og:title, og:site_name e description, para dar contexto à IA. */
  meta: Record<string, string>;
  texto: string;
}

// ---------------------------------------------------------------------
// Rede: só http(s) público, sem seguir redirecionamento para a rede interna
// ---------------------------------------------------------------------
function ipPrivado(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return ipPrivado(v.slice(7));
    return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

async function validarUrl(bruta: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(bruta.trim());
  } catch {
    throw new ErroLink("url_invalida", "Esse link não parece válido.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ErroLink("url_invalida", "Use um link http ou https.");
  }
  if (BLOQUEADOS.test(url.hostname)) {
    throw new ErroLink(
      "site_bloqueado",
      "Esse site exige login ou não permite leitura automática. Preencha os campos e cole a descrição da vaga.",
    );
  }
  const enderecos = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true }).catch(() => []);
  if (enderecos.length === 0) throw new ErroLink("pagina_inacessivel", "Não encontrei esse endereço.");
  if (enderecos.some((e) => ipPrivado(e.address))) throw new ErroLink("url_invalida", "Esse link não é público.");
  return url;
}

async function lerCorpo(res: Response): Promise<string> {
  if (!res.body) return "";
  const leitor = res.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(value);
    total += value.byteLength;
  }
  await leitor.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(partes));
}

const CABECALHOS = {
  // Alguns ATS devolvem 403 para user-agents de robô.
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
  "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
};

async function baixar(inicial: URL, init?: RequestInit): Promise<{ url: URL; corpo: string; tipo: string }> {
  let url = inicial;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const res = await fetch(url, {
      ...init,
      headers: { ...CABECALHOS, ...init?.headers },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => {
      throw new ErroLink("pagina_inacessivel", "Não consegui abrir esse link (tempo esgotado ou site fora do ar).");
    });
    const destino = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && destino) {
      url = await validarUrl(new URL(destino, url).toString());
      continue;
    }
    if (!res.ok) throw new ErroLink("pagina_inacessivel", `O site respondeu com erro ${res.status}.`);
    return { url, corpo: await lerCorpo(res), tipo: res.headers.get("content-type") ?? "" };
  }
  throw new ErroLink("pagina_inacessivel", "O link redireciona demais.");
}

// ---------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------
type Json = Record<string, any>; // JSON-LD de terceiros, lido campo a campo

function textoDe(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v.map(textoDe).filter(Boolean).join(", ");
  if (v && typeof v === "object") return textoDe((v as Json).name ?? (v as Json)["@value"] ?? "");
  return "";
}

function localDe(jobLocation: unknown): string {
  const lista = Array.isArray(jobLocation) ? jobLocation : jobLocation ? [jobLocation] : [];
  const locais = lista.map((l: Json) => {
    const a = l?.address ?? l;
    if (typeof a === "string") return a;
    return [a?.addressLocality, a?.addressRegion, textoDe(a?.addressCountry)].filter(Boolean).join(" - ");
  });
  return [...new Set(locais.filter(Boolean))].slice(0, 3).join(" · ");
}

function acharJobPosting(no: unknown): Json | null {
  if (Array.isArray(no)) {
    for (const item of no) {
      const achado = acharJobPosting(item);
      if (achado) return achado;
    }
    return null;
  }
  if (!no || typeof no !== "object") return null;
  const o = no as Json;
  const tipo = ([] as unknown[]).concat(o["@type"] ?? []);
  if (tipo.includes("JobPosting")) return o;
  return acharJobPosting(o["@graph"]);
}

function lerJsonLd(html: string): VagaJsonLd | null {
  const blocos = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, bruto] of blocos) {
    let dados: unknown;
    try {
      dados = JSON.parse(bruto.trim());
    } catch {
      continue;
    }
    const j = acharJobPosting(dados);
    if (!j) continue;
    const tipoLocal = textoDe(j.jobLocationType).toUpperCase();
    const descricao = htmlParaTexto(decodificarEntidades(textoDe(j.description)));
    return {
      titulo: textoDe(j.title),
      empresa: textoDe(j.hiringOrganization),
      local: localDe(j.jobLocation) || textoDe(j.applicantLocationRequirements),
      // TELECOMMUTE é o único valor que o schema.org define; o resto a IA ou a regex deduzem.
      modelo: tipoLocal.includes("TELECOMMUTE") ? "remoto" : "desconhecido",
      descricao,
    };
  }
  return null;
}

function lerMeta(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const titulo = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (titulo) meta.title = decodificarEntidades(titulo).trim();
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const nome = tag.match(/\b(?:property|name)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const conteudo = tag.match(/\bcontent=["']([^"']*)["']/i)?.[1];
    if (nome && conteudo && ["og:title", "og:site_name", "og:description", "description"].includes(nome)) {
      meta[nome] = decodificarEntidades(conteudo).trim();
    }
  }
  return meta;
}

// ---------------------------------------------------------------------
// Notion (página pública). API interna e sem documentação: qualquer falha
// cai no caminho genérico.
// ---------------------------------------------------------------------
function idNotion(url: URL): string | null {
  const hex = url.pathname.replace(/-/g, "").match(/([0-9a-f]{32})(?:$|[/?#])/i)?.[1]
    ?? url.searchParams.get("p")?.replace(/-/g, "");
  if (!hex || !/^[0-9a-f]{32}$/i.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toLowerCase();
}

const PREFIXO_NOTION: Record<string, string> = {
  header: "\n## ",
  sub_header: "\n### ",
  sub_sub_header: "\n#### ",
  bulleted_list: "• ",
  numbered_list: "• ",
  to_do: "• ",
  quote: "> ",
};

async function lerNotion(url: URL): Promise<string | null> {
  const id = idNotion(url);
  if (!id) return null;
  try {
    const { corpo } = await baixar(new URL("/api/v3/loadPageChunk", url.origin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageId: id, limit: 100, cursor: { stack: [] }, chunkNumber: 0, verticalColumns: false }),
    });
    const blocos: Record<string, Json> = JSON.parse(corpo)?.recordMap?.block ?? {};
    // O formato mudou com o tempo: o bloco vem em `value` ou em `value.value`.
    const bloco = (bid: string): Json | undefined => blocos[bid]?.value?.value ?? blocos[bid]?.value;
    const linhas: string[] = [];
    const visitar = (bid: string, nivel: number) => {
      const b = bloco(bid);
      if (!b || nivel > 6) return;
      const texto = (b.properties?.title ?? []).map((p: unknown[]) => p?.[0] ?? "").join("").trim();
      if (texto) linhas.push((PREFIXO_NOTION[b.type] ?? (nivel === 0 ? "# " : "")) + texto);
      for (const filho of b.content ?? []) visitar(filho, nivel + 1);
    };
    visitar(id, 0);
    const texto = linhas.join("\n").trim();
    return texto.length > 50 ? texto : null;
  } catch (e) {
    console.error("[link] notion", e);
    return null;
  }
}

// ---------------------------------------------------------------------
export async function lerPaginaVaga(bruta: string): Promise<PaginaVaga> {
  const inicial = await validarUrl(bruta);

  if (/(^|\.)notion\.(site|so)$/i.test(inicial.hostname)) {
    const texto = await lerNotion(inicial);
    if (texto) return { url: inicial.toString(), jsonLd: null, meta: {}, texto: texto.slice(0, MAX_TEXTO) };
  }

  const { url, corpo, tipo } = await baixar(inicial);
  if (!/html|text\/plain/i.test(tipo) && !/^\s*</.test(corpo)) {
    throw new ErroLink("sem_conteudo", "Esse link não é uma página de texto. Cole a descrição da vaga.");
  }
  const jsonLd = lerJsonLd(corpo);
  const meta = lerMeta(corpo);
  const texto = htmlParaTexto(corpo.replace(/<(nav|footer|header|noscript|svg)[\s\S]*?<\/\1>/gi, " ")).slice(0, MAX_TEXTO);
  if (!jsonLd && texto.length < 200 && !meta["og:description"]) {
    throw new ErroLink(
      "sem_conteudo",
      "A página não trouxe o texto da vaga (provavelmente é montada no navegador). Cole a descrição manualmente.",
    );
  }
  return { url: url.toString(), jsonLd, meta, texto };
}
