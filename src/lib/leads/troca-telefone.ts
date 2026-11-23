import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Troca o telefone de um lead sem perder nada dele.
 *
 * O lead é identificado pelo telefone (`phone_key`). Antes, achar o celular de
 * quem estava com o fixo virava lead novo + arquivar o antigo, e a conversa,
 * as análises e as locações ficavam no lead arquivado. Aqui o MESMO lead muda
 * de número, e o número velho vai para `telefones_anteriores` (0031), de onde
 * a sincronização do WhatsApp ainda o reconhece.
 *
 * Usado pela ficha ("Trocar telefone") e pela importação (coluna "Telefone
 * anterior"), por isso recebe o cliente de quem chama.
 */

export type LeadParaTroca = {
  id: string;
  phone_key: string;
  telefones_anteriores?: string[] | null;
};

export type ResultadoTroca =
  | { ok: true }
  | { ok: false; motivo: "mesmo_numero" }
  | { ok: false; motivo: "numero_de_outro_lead"; outro: { id: string; nome: string } }
  | { ok: false; motivo: "erro"; mensagem: string };

export async function trocarTelefone(
  db: SupabaseClient,
  lead: LeadParaTroca,
  novo: { phoneKey: string; phoneE164: string },
): Promise<ResultadoTroca> {
  if (novo.phoneKey === lead.phone_key) return { ok: false, motivo: "mesmo_numero" };

  // O número novo não pode ser de outro lead, nem atual nem antigo: as
  // mensagens dele cairiam em dois lugares. Juntar dois leads é outra
  // conversa, e fica com o dono.
  const { data: donos, error: erroBusca } = await db
    .from("wa_leads")
    .select("id, sheet_name, display_name, clinic_name, phone_key")
    .or(`phone_key.eq.${novo.phoneKey},telefones_anteriores.cs.{${novo.phoneKey}}`)
    .neq("id", lead.id)
    .limit(1);
  if (erroBusca) return { ok: false, motivo: "erro", mensagem: erroBusca.message };
  const outro = donos?.[0] as
    | { id: string; sheet_name: string | null; display_name: string | null; clinic_name: string | null; phone_key: string }
    | undefined;
  if (outro) {
    return {
      ok: false,
      motivo: "numero_de_outro_lead",
      outro: {
        id: outro.id,
        nome: outro.sheet_name || outro.display_name || outro.clinic_name || outro.phone_key,
      },
    };
  }

  // O velho entra na lista; o novo sai dela (voltar para um número antigo é
  // legítimo e não pode deixá-lo nos dois lugares).
  const anteriores = [
    ...new Set([...(lead.telefones_anteriores ?? []), lead.phone_key]),
  ].filter((k) => k !== novo.phoneKey);

  const { error } = await db
    .from("wa_leads")
    .update({
      phone_key: novo.phoneKey,
      phone_e164: novo.phoneE164,
      telefones_anteriores: anteriores,
      // O JID e a verificação eram do número velho. A ficha verifica o novo
      // ao abrir; o botão em lote da caixa também.
      wa_jid: null,
      whatsapp_existe: null,
      whatsapp_verificado_em: null,
    })
    .eq("id", lead.id);
  if (error) {
    // Corrida com outra gravação do mesmo número: a unique de phone_key segura.
    if (/duplicate key|unique/i.test(error.message)) {
      return { ok: false, motivo: "erro", mensagem: "Esse número acabou de ser gravado em outro lead." };
    }
    return { ok: false, motivo: "erro", mensagem: error.message };
  }
  return { ok: true };
}

/** "Catálogo Médico", "Doctoralia" ou o domínio, para mostrar de onde o lead veio. */
export function origemDoPerfil(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  if (host.endsWith("catalogo.med.br")) return "Catálogo Médico";
  if (host.endsWith("doctoralia.com.br")) return "Doctoralia";
  return host;
}

/**
 * O link do perfil, só se for http(s). Vem de planilha, então qualquer outro
 * esquema (`javascript:`, `data:`) é descartado antes de virar `href`.
 */
export function linkDoPerfil(url: string | null | undefined): string | null {
  const t = String(url ?? "").trim();
  if (!t) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`);
    // Sem ponto no domínio não é site: "nao achei" viraria https://nao/.
    const web = (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
    return web ? u.toString() : null;
  } catch {
    return null;
  }
}
