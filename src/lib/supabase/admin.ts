import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

/**
 * Erro de configuração, separado dos erros de banco.
 *
 * As rotas distinguem os dois para poder dizer ao usuário o que fazer: falta
 * de chave é algo que ele resolve no painel da Vercel, não um bug.
 */
export class AdminClientNotConfiguredError extends Error {
  constructor() {
    super(
      "SUPABASE_SERVICE_ROLE_KEY não está configurada. " +
        "Adicione em Vercel → Settings → Environment Variables e refaça o deploy " +
        "(variável nova só vale depois de um Redeploy).",
    );
    this.name = "AdminClientNotConfiguredError";
  }
}

/**
 * Cliente que ignora o RLS. Usado apenas em rotas de API que precisam disso —
 * nunca importe em código de cliente.
 *
 * A URL vem de `config.ts`, que tem o projeto embutido, e não de
 * `process.env.NEXT_PUBLIC_SUPABASE_URL`: este deploy foi montado para
 * funcionar sem variáveis de ambiente, então ler a env direto fazia o cliente
 * do navegador funcionar e só estas rotas quebrarem — uma falha que não
 * aparece no build, só em produção.
 *
 * A chave de service role não pode ser embutida: ela dá acesso total ao banco
 * e o repositório é público. Essa continua vindo do ambiente.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new AdminClientNotConfiguredError();
  }

  return createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Versão que não estoura, para as rotas de API.
 *
 * Sem isto, uma chave faltando virava uma exceção não tratada: o Next
 * respondia um 500 que não é JSON, o `fetch` do navegador falhava ao fazer
 * `res.json()` e o usuário via só "Falha ao importar" — sem pista nenhuma do
 * que estava errado.
 */
export function tryCreateAdminClient():
  | { ok: true; admin: SupabaseClient }
  | { ok: false; message: string } {
  try {
    return { ok: true, admin: createAdminClient() };
  } catch (err) {
    if (err instanceof AdminClientNotConfiguredError) {
      return { ok: false, message: err.message };
    }
    throw err;
  }
}
