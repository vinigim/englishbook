import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente da API do Instagram (Instagram API com login do Instagram).
 *
 * Só leitura: conversas e mensagens do direct do @luxderma.lasers. Enviar
 * pela API existe, mas não é usado pelo mesmo motivo do WhatsApp — a mensagem
 * sai pelo celular do dono.
 *
 * Diferenças para o WhatsApp que moldam o código:
 *
 *  - A Meta só entrega o conteúdo das 20 mensagens mais recentes de cada
 *    conversa. Para primeira abordagem e poucas trocas, é a conversa inteira.
 *  - A conversa traz o @ da pessoa. O lead é achado pelo Instagram da
 *    planilha, sem nada parecido com o problema do LID.
 *  - O token expira em 60 dias. Cada sincronização o renova (ver `obterToken`).
 */

const VERSAO = "v23.0";
const BASE = `https://graph.instagram.com/${VERSAO}`;

export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

export class InstagramNaoConfiguradoError extends Error {
  constructor() {
    super(
      "INSTAGRAM_ACCESS_TOKEN não está configurado. Gere o token no app da Meta " +
        "(Casos de uso → Instagram → Gerar tokens de acesso), salve em Vercel → " +
        "Settings → Environment Variables e refaça o deploy.",
    );
    this.name = "InstagramNaoConfiguradoError";
  }
}

/**
 * GET na Graph API.
 *
 * O token vai na query, como a Meta documenta — e por isso nenhuma URL montada
 * aqui pode sair para o navegador ou para o log. Os erros levam só a mensagem
 * da Meta, que não contém o token.
 */
async function graphGet<T>(
  caminho: string,
  params: Record<string, string>,
  token: string,
): Promise<T> {
  const url = new URL(caminho.startsWith("http") ? caminho : `${BASE}${caminho}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);

  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as
    | (T & { error?: { message?: string; code?: number } })
    | null;

  if (!res.ok || !json || json.error) {
    const erro = json?.error;
    throw new InstagramApiError(
      erro?.message ?? `A API do Instagram respondeu ${res.status}.`,
      res.status,
      erro?.code,
    );
  }
  return json;
}

// ------------------------------------------------------------------- token

type LinhaConta = {
  access_token: string | null;
  token_origem: string | null;
  token_renovado_em: string | null;
  ultima_sync_em: string | null;
};

/** Pedaço do hash do token da Vercel. Identifica sem guardar o token. */
function origemDoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

/** Renovar mais que isso seria desperdício; a Meta dá 60 dias a cada troca. */
const RENOVAR_APOS_MS = 3 * 24 * 60 * 60 * 1000;

export type TokenInstagram = {
  token: string;
  ultimaSyncEm: string | null;
  /** Falso quando a migration 0018 não foi rodada: funciona, mas não renova. */
  podeGuardar: boolean;
};

/**
 * O token a usar, renovado quando está ficando velho.
 *
 * Vale o guardado no banco se ele nasceu do MESMO token que está na Vercel.
 * Se o dono gerou outro e trocou a variável, o da Vercel volta a valer — é o
 * jeito de consertar um token revogado sem mexer no banco.
 *
 * Renovação que falha não derruba a sincronização: a Meta recusa renovar um
 * token com menos de 24h, que é exatamente o caso do primeiro uso.
 */
export async function obterToken(admin: SupabaseClient): Promise<TokenInstagram> {
  const daVercel = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  if (!daVercel) throw new InstagramNaoConfiguradoError();

  const origem = origemDoToken(daVercel);

  const { data, error } = await admin
    .from("ig_conta")
    .select("access_token, token_origem, token_renovado_em, ultima_sync_em")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("[instagram] ig_conta indisponível (migration 0018?):", error.message);
    return { token: daVercel, ultimaSyncEm: null, podeGuardar: false };
  }

  let linha = data as LinhaConta | null;

  // Token da Vercel trocado: o que está guardado era de outro token (talvez de
  // outra conta). Esquece tudo, inclusive a marca de sincronização, para a
  // próxima leitura ser completa.
  if (!linha || linha.token_origem !== origem) {
    const { error: upErr } = await admin.from("ig_conta").upsert({
      id: 1,
      access_token: null,
      token_origem: origem,
      token_renovado_em: null,
      token_expira_em: null,
      ultima_sync_em: null,
      updated_at: new Date().toISOString(),
    });
    if (upErr) console.error("[instagram] falha ao iniciar ig_conta:", upErr.message);
    linha = null;
  }

  let token = linha?.access_token ?? daVercel;
  const renovadoEm = linha?.access_token ? linha.token_renovado_em : null;

  const velho =
    !renovadoEm || Date.now() - new Date(renovadoEm).getTime() > RENOVAR_APOS_MS;

  if (velho) {
    try {
      const r = await graphGet<{ access_token: string; expires_in: number }>(
        "https://graph.instagram.com/refresh_access_token",
        { grant_type: "ig_refresh_token" },
        token,
      );
      token = r.access_token;
      const agora = new Date();
      const { error: upErr } = await admin.from("ig_conta").upsert({
        id: 1,
        access_token: token,
        token_origem: origem,
        token_renovado_em: agora.toISOString(),
        token_expira_em: new Date(
          agora.getTime() + (Number(r.expires_in) || 0) * 1000,
        ).toISOString(),
        updated_at: agora.toISOString(),
      });
      if (upErr) console.error("[instagram] falha ao guardar token:", upErr.message);
    } catch (err) {
      console.warn(
        "[instagram] renovação do token recusada (normal nas primeiras 24h):",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    token,
    ultimaSyncEm: linha?.ultima_sync_em ?? null,
    podeGuardar: true,
  };
}

export async function registrarSync(
  admin: SupabaseClient,
  dados: { quando: string; igUserId: string; username: string },
): Promise<void> {
  const { error } = await admin
    .from("ig_conta")
    .update({
      ultima_sync_em: dados.quando,
      ig_user_id: dados.igUserId,
      username: dados.username,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) console.error("[instagram] falha ao registrar sync:", error.message);
}

// --------------------------------------------------------------- consultas

export type ContaInstagram = {
  /** Id da conta profissional, o mesmo que aparece em `from.id`. */
  userId: string;
  /** Id da conta no escopo do app. Às vezes é ele que vem nas mensagens. */
  idApp: string;
  username: string;
};

export async function minhaConta(token: string): Promise<ContaInstagram> {
  const r = await graphGet<{ id: string; user_id?: string; username?: string }>(
    "/me",
    { fields: "id,user_id,username" },
    token,
  );
  return {
    userId: String(r.user_id ?? r.id),
    idApp: String(r.id),
    username: String(r.username ?? "").toLowerCase(),
  };
}

export type Participante = { id: string; username?: string };

export type MensagemBruta = {
  id: string;
  created_time: string;
  from?: Participante;
  to?: { data?: Participante[] };
  message?: string;
  attachments?: { data?: Record<string, unknown>[] };
};

export type ConversaBruta = {
  id: string;
  updated_time: string;
  participants?: { data?: Participante[] };
  messages?: { data?: MensagemBruta[] };
};

type PaginaBruta = {
  data?: ConversaBruta[];
  paging?: { cursors?: { after?: string }; next?: string };
};

const CAMPOS_MENSAGEM = "id,created_time,from,to,message,attachments";

/**
 * Uma página de conversas, da mais recente para a mais antiga, já com as
 * mensagens dentro.
 *
 * Tudo numa chamada por página (field expansion), em vez de uma por conversa
 * e outra por mensagem como no exemplo da documentação: centenas de conversas
 * viram dezenas de chamadas.
 *
 * Devolve o cursor `after`, nunca a URL `next`: ela carrega o token.
 */
export async function paginaDeConversas(
  token: string,
  after: string | null,
  porPagina = 10,
): Promise<{ conversas: ConversaBruta[]; after: string | null }> {
  const params: Record<string, string> = {
    platform: "instagram",
    limit: String(porPagina),
    fields: `id,updated_time,participants,messages.limit(20){${CAMPOS_MENSAGEM}}`,
  };
  if (after) params.after = after;

  const r = await graphGet<PaginaBruta>("/me/conversations", params, token);
  const conversas = r.data ?? [];
  return {
    conversas,
    after: conversas.length > 0 && r.paging?.next ? (r.paging.cursors?.after ?? null) : null,
  };
}

export type VarianteConversas = {
  consulta: string;
  conversas?: number;
  erro?: string;
};

/**
 * A mesma listagem de conversas, pedida de jeitos diferentes.
 *
 * Só para o diagnóstico. Quando a listagem normal vem vazia sem erro, a
 * variante que devolver alguma coisa diz qual é o problema: o caminho
 * (`me` ou o id da conta), o `platform` ou a expansão das mensagens. Se todas
 * vierem vazias, a causa não é a consulta, e sim o acesso do app.
 */
export async function variantesDeConversas(
  token: string,
  conta: ContaInstagram,
): Promise<VarianteConversas[]> {
  const tentativas: [string, string, Record<string, string>][] = [
    ["me · platform=instagram", "/me/conversations", { platform: "instagram", fields: "id,updated_time" }],
    ["me · sem platform", "/me/conversations", { fields: "id,updated_time" }],
    [`id da conta (${conta.userId}) · platform=instagram`, `/${conta.userId}/conversations`, { platform: "instagram", fields: "id,updated_time" }],
    [`id do app (${conta.idApp}) · platform=instagram`, `/${conta.idApp}/conversations`, { platform: "instagram", fields: "id,updated_time" }],
    ["me · folder=general", "/me/conversations", { platform: "instagram", folder: "general", fields: "id,updated_time" }],
    ["me · folder=other (pedidos)", "/me/conversations", { platform: "instagram", folder: "other", fields: "id,updated_time" }],
  ];

  const resultado: VarianteConversas[] = [];
  for (const [consulta, caminho, params] of tentativas) {
    try {
      const r = await graphGet<{ data?: unknown[] }>(caminho, { ...params, limit: "25" }, token);
      resultado.push({ consulta, conversas: r.data?.length ?? 0 });
    } catch (err) {
      resultado.push({ consulta, erro: err instanceof Error ? err.message : String(err) });
    }
  }
  return resultado;
}
