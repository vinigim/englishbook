/**
 * Confere se um perfil do Instagram existe, lendo a prévia da página.
 *
 * É o mesmo que o WhatsApp faz ao montar a prévia de um link: pede a página
 * pública do perfil com o user-agent de robô de prévia e lê as tags og:title e
 * og:description, que trazem o nome, o @ e os seguidores. Nada de login, nada
 * de API.
 *
 * Existe porque a pesquisa na web falha nos dois sentidos: devolve perfil
 * apagado (caso real: @churdleyrolimsales) e não acha perfil pequeno que
 * existe (caso real: @izabelacardealdermato, 2 mil seguidores, não encontrado
 * em 4 pesquisas).
 *
 * ⚠️ O Instagram pode trocar a prévia por uma tela de login para IP de
 * datacenter. Por isso há TRÊS respostas: existe, não existe e `null` — "não
 * deu para saber". Quem chama trata `null` como ausência de informação, nunca
 * como "não existe".
 */

const USER_AGENT = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const TIMEOUT_MS = 5000;

export type PerfilConferido =
  | { existe: true; nome: string | null; seguidores: string | null }
  | { existe: false };

function decodificar(t: string): string {
  return t
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function meta(html: string, propriedade: string): string | null {
  const m =
    html.match(new RegExp(`<meta[^>]+property="${propriedade}"[^>]+content="([^"]*)"`, "i")) ??
    html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="${propriedade}"`, "i"));
  return m ? decodificar(m[1]) : null;
}

export async function conferirPerfil(handle: string): Promise<PerfilConferido | null> {
  let res: Response;
  try {
    res = await fetch(`https://www.instagram.com/${encodeURIComponent(handle)}/`, {
      headers: { "user-agent": USER_AGENT, "accept-language": "pt-BR,pt;q=0.9" },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return null;
  }

  if (res.status === 404) return { existe: false };
  // Redirecionou (quase sempre para o login): não dá para saber.
  if (res.status !== 200) return null;

  const html = (await res.text().catch(() => "")).slice(0, 200_000);
  const titulo = meta(html, "og:title");
  if (titulo && titulo.toLowerCase().includes(`@${handle.toLowerCase()})`)) {
    const descricao = meta(html, "og:description") ?? "";
    const seguidores = descricao.match(/([\d.,]+\s*[KkMm]?)\s*(followers|seguidores)/i)?.[1]?.trim() ?? null;
    const nome = titulo.split(/\s*\(@/)[0]?.trim() || null;
    return { existe: true, nome, seguidores };
  }
  // Só o <title>: o HTML da tela de login carrega textos de erro no JS.
  const tituloPagina = decodificar(html.match(/<title[^>]*>([^<]*)</i)?.[1] ?? "");
  if (/page not found|p[aá]gina n[aã]o (est[aá] dispon[ií]vel|encontrada)/i.test(tituloPagina)) {
    return { existe: false };
  }
  return null;
}
