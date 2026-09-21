import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lead, LeadRental, WaMessage } from "@/app/derma-lux/leads-types";
import type { AnalysisInput } from "./lead-analysis";
import type { EquipmentInfo } from "./prompt";

/**
 * Monta o contexto de análise de um lead a partir do banco.
 *
 * Usa o cliente admin porque é chamado de rotas de API e Server Actions que
 * já autenticaram o usuário por conta própria.
 */

const MESSAGE_COLS =
  "id, lead_id, provider, provider_message_id, chat_id, direction, message_type, body, caption, media_url, media_mime, sent_at";

/** O catálogo muda raramente, e é o que faz o prompt estável ser cacheável. */
export async function loadEquipment(
  admin: SupabaseClient,
): Promise<EquipmentInfo[]> {
  const { data } = await admin
    .from("equipment")
    .select("name, use")
    .order("name", { ascending: true });

  return ((data ?? []) as { name: string; use: string | null }[]).map((e) => ({
    name: e.name,
    use: e.use,
  }));
}

export async function loadAnalysisInput(
  admin: SupabaseClient,
  leadId: string,
  equipment: EquipmentInfo[],
  messageLimit = 200,
): Promise<AnalysisInput | null> {
  const { data: leadData } = await admin
    .from("wa_leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  if (!leadData) return null;

  const [messagesRes, rentalsRes] = await Promise.all([
    admin
      .from("wa_messages")
      .select(MESSAGE_COLS)
      .eq("lead_id", leadId)
      .order("sent_at", { ascending: false })
      .limit(messageLimit),
    admin
      .from("rentals")
      .select("id, date, price, specialty, notes, equipment:equip_id (name)")
      .eq("wa_lead_id", leadId)
      .order("date", { ascending: false }),
  ]);

  // Vieram decrescentes para respeitar o limit; a transcrição quer cronológico.
  const messages = ((messagesRes.data ?? []) as WaMessage[]).slice().reverse();

  type RawRental = {
    id: string;
    date: string;
    price: number | string | null;
    specialty: string | null;
    notes: string | null;
    equipment: { name: string } | { name: string }[] | null;
  };

  const rentals: LeadRental[] = ((rentalsRes.data ?? []) as RawRental[]).map(
    (r) => {
      const equip = Array.isArray(r.equipment) ? r.equipment[0] : r.equipment;
      return {
        id: r.id,
        date: r.date,
        equipmentName: equip?.name ?? null,
        price: r.price != null ? Number(r.price) : null,
        specialty: r.specialty ?? null,
        notes: r.notes ?? null,
      };
    },
  );

  return { lead: leadData as Lead, messages, rentals, equipment };
}
