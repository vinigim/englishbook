"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { codigoDaJanela } from "./janela-link";

export type ActionResult = { ok: boolean; error?: string };

const ofertaSchema = z.object({
  leadId: z.string().uuid("Lead inválido"),
  equipId: z.string().uuid("Equipamento inválido"),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  periodo: z.enum(["dia", "manha", "tarde"]),
  equipNome: z.string().trim().min(1).max(120),
  cidade: z.string().trim().min(1).max(120),
});

/**
 * Grava a oferta quando o dono copia a mensagem do Instagram, para o link
 * `/j/<codigo>` saber qual janela mostrar.
 *
 * O código é recalculado aqui, e não aceito da tela: assim um código só existe
 * para o par lead + janela que o gerou. Oferta já gravada fica como está —
 * copiar de novo não zera os cliques nem a resposta.
 */
export async function registrarOfertaJanela(input: unknown): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre novamente." };

  const parsed = ofertaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const o = parsed.data;

  const { error } = await supabase.from("janela_ofertas").upsert(
    {
      codigo: codigoDaJanela(o.leadId, o.equipId, o.data),
      lead_id: o.leadId,
      equip_id: o.equipId,
      data: o.data,
      periodo: o.periodo,
      equip_nome: o.equipNome,
      cidade: o.cidade,
    },
    { onConflict: "codigo", ignoreDuplicates: true },
  );

  if (error) {
    console.error("[janelas] falha ao gravar oferta:", error.message);
    // Tabela ausente (0023 não rodada) é o caso comum: o link ainda funciona,
    // só com o texto genérico.
    return { ok: false, error: "A oferta não foi gravada; o link abre com texto genérico." };
  }

  revalidatePath("/derma-lux/leads/janelas");
  return { ok: true };
}
