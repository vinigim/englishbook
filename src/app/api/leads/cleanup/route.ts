import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { waJidPhone } from "@/lib/leads/phone";
import { isLidJid } from "@/lib/whatsapp/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Remove leads fantasma criados por JID que não é telefone.
 *
 * A primeira sincronização real gravou um lead por conversa endereçada por LID
 * ("24515790798917@lid"), tratando o identificador interno do WhatsApp como se
 * fosse número. Eles não se fundem com ninguém, não têm como receber mensagem e
 * poluem todos os contadores da tela.
 *
 * A origem está corrigida (ver `jidDeIdentidade` em src/lib/whatsapp/evolution.ts
 * e a validação em `ingestMessages`). Esta rota limpa o que já entrou.
 *
 * DRY-RUN POR PADRÃO: sem `{"confirmar": true}` no corpo, só relata o que
 * apagaria. É destrutivo e o dono precisa ver a lista antes.
 *
 * Seguro para rodar de novo: o critério é o estado atual da linha, não uma data.
 */

const bodySchema = z.object({
  confirmar: z.boolean().optional(),
});

/** Quantos exemplos devolver para o dono conferir antes de confirmar. */
const AMOSTRA = 15;

type LeadCandidato = {
  id: string;
  phone_key: string;
  phone_e164: string | null;
  display_name: string | null;
  wa_jid: string | null;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const adminResult = tryCreateAdminClient();
  if (!adminResult.ok) {
    console.error("[leads-cleanup] SUPABASE_SERVICE_ROLE_KEY ausente");
    return NextResponse.json(
      { error: "admin_not_configured", message: adminResult.message },
      { status: 500 },
    );
  }
  const admin = adminResult.admin;

  let body: unknown = {};
  try {
    const texto = await request.text();
    if (texto.trim()) body = JSON.parse(texto);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: parsed.error.issues[0]?.message ?? "Corpo inválido.",
      },
      { status: 400 },
    );
  }

  // Só o que veio do WhatsApp. Lead de planilha passou pelo mesmo validador na
  // importação, e um "ambos" tem telefone bom vindo da planilha — mexer neles
  // seria apagar dado que o dono digitou.
  const { data, error } = await admin
    .from("wa_leads")
    .select("id, phone_key, phone_e164, display_name, wa_jid")
    .eq("source", "whatsapp");

  if (error) {
    console.error("[leads-cleanup] falha ao listar leads:", error.message);
    return NextResponse.json(
      { error: "query_failed", message: error.message },
      { status: 500 },
    );
  }

  const candidatos = (data ?? []) as LeadCandidato[];

  // Um lead é lixo quando NÃO TEM TELEFONE DE VERDADE. Dois jeitos de detectar.
  //
  // 1. O telefone é o próprio LID.
  //
  //    Não basta olhar se o wa_jid é "@lid": desde a recuperação por mapa, um
  //    lead legítimo pode ter wa_jid "@lid" e telefone certo ao lado — é o
  //    caso da Gabriella, cujo chat é 24515790798917@lid e cujo telefone é
  //    5518996387418. Apagar por "@lid" jogaria fora justamente o que a
  //    recuperação salvou.
  //
  //    O que caracteriza o lixo é o telefone ser os dígitos do próprio LID.
  //
  //    E validar só a FORMA do número também não basta: um LID de 14 dígitos
  //    pode começar com algo que parece código de país. Vistos em produção,
  //    todos "válidos" para o libphonenumber: 43155848216636 (Áustria, 431 é
  //    Viena), 86290674528502 (China), 92874406424691 (Paquistão),
  //    38336978763967 (Kosovo).
  //
  // 2. O telefone não é discável — rede para lead antigo cujo wa_jid é nulo,
  //    ou para algum formato de JID que ainda não conhecemos.
  const invalidos = candidatos.filter((l) => {
    const telefone = l.phone_e164 ?? l.phone_key;
    if (!waJidPhone(telefone)) return true;

    if (l.wa_jid && isLidJid(l.wa_jid)) {
      const lid = l.wa_jid.split("@")[0].replace(/\D/g, "");
      return lid === String(telefone ?? "").replace(/\D/g, "");
    }

    return false;
  });

  const resumo = {
    leadsDoWhatsapp: candidatos.length,
    invalidos: invalidos.length,
    amostra: invalidos.slice(0, AMOSTRA).map((l) => ({
      phoneKey: l.phone_key,
      nome: l.display_name,
      jid: l.wa_jid,
    })),
  };

  if (!parsed.data.confirmar) {
    return NextResponse.json({
      ...resumo,
      apagados: 0,
      dryRun: true,
      mensagem:
        invalidos.length === 0
          ? "Nada a limpar."
          : `Apagaria ${invalidos.length} lead(s). Reenvie com {"confirmar": true} para efetivar.`,
    });
  }

  if (invalidos.length === 0) {
    return NextResponse.json({ ...resumo, apagados: 0, dryRun: false });
  }

  const ids = invalidos.map((l) => l.id);
  const jids = invalidos
    .map((l) => l.wa_jid)
    .filter((j): j is string => Boolean(j));

  // As mensagens saem por cascade (wa_messages.lead_id tem on delete cascade em
  // 0010), mas o wa_sync_state é keyed por chat_id e não conhece o lead — sem
  // apagar aqui, o backfill consideraria essas conversas já concluídas e nunca
  // as rebuscaria com o parser corrigido.
  if (jids.length > 0) {
    const { error: syncErr } = await admin
      .from("wa_sync_state")
      .delete()
      .in("chat_id", jids);
    if (syncErr) {
      console.error("[leads-cleanup] falha ao limpar wa_sync_state:", syncErr.message);
      return NextResponse.json(
        { error: "sync_state_delete_failed", message: syncErr.message },
        { status: 500 },
      );
    }
  }

  const { error: delErr } = await admin.from("wa_leads").delete().in("id", ids);
  if (delErr) {
    console.error("[leads-cleanup] falha ao apagar leads:", delErr.message);
    return NextResponse.json(
      { error: "delete_failed", message: delErr.message },
      { status: 500 },
    );
  }

  console.log(
    `[leads-cleanup] ${ids.length} lead(s) sem telefone válido apagados, ${jids.length} chat(s) liberados para nova sincronização`,
  );

  return NextResponse.json({
    ...resumo,
    apagados: ids.length,
    chatsLiberados: jids.length,
    dryRun: false,
  });
}
