import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Vínculos LID → telefone feitos à mão (tabela wa_lid_links, migração 0017).
 *
 * Tabela ausente — migração ainda não rodada — não pode derrubar a
 * sincronização nem o webhook: devolve mapa vazio e segue como antes.
 */
export async function carregarVinculosLid(
  admin: SupabaseClient,
): Promise<Record<string, string>> {
  const { data, error } = await admin
    .from("wa_lid_links")
    .select("lid, phone_e164");

  if (error) {
    console.error("[wa-lid-links] falha ao ler vínculos:", error.message);
    return {};
  }

  const mapa: Record<string, string> = {};
  for (const r of (data ?? []) as { lid: string; phone_e164: string }[]) {
    mapa[r.lid] = r.phone_e164;
  }
  return mapa;
}

import type { PendingLidMessage, WhatsAppProvider } from "./provider";

const PAGINA = 200;

export type Varredura = {
  pendentes: PendingLidMessage[];
  /** LID → telefone aprendido do remoteJidAlt: esses já se resolvem sozinhos. */
  lidMapAlt: Record<string, string>;
  paginas: number;
  chegouAoFim: boolean;
};

/**
 * Lê o histórico inteiro atrás das mensagens que só têm LID.
 *
 * Página a página, porque o filtro por chat da Evolution v2.3 não funciona
 * (ver fetchMessagesPage). Para no teto de tempo e diz se chegou ao fim.
 */
export async function varrerPendentes(
  provider: WhatsAppProvider,
  limiteMs: number,
): Promise<Varredura> {
  const inicio = Date.now();
  const r: Varredura = { pendentes: [], lidMapAlt: {}, paginas: 0, chegouAoFim: false };

  for (let page = 1; Date.now() - inicio < limiteMs; page++) {
    const lote = await provider.fetchMessagesPage({ page, pageSize: PAGINA });
    r.paginas += 1;
    r.pendentes.push(...lote.pendentes);
    Object.assign(r.lidMapAlt, lote.lidMap);
    if (lote.brutas < PAGINA) {
      r.chegouAoFim = true;
      break;
    }
  }
  return r;
}
