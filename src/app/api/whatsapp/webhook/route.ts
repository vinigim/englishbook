import { NextResponse, type NextRequest } from "next/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import { carregarVinculosLid } from "@/lib/whatsapp/lid-links";
import { ingestMessages } from "@/lib/whatsapp/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Recebe as mensagens novas do WhatsApp.
 *
 * Esta URL é pública e escreve no banco com a service role, então a
 * verificação do segredo vem ANTES de qualquer acesso ao banco.
 *
 * Idempotência segue o mesmo desenho do webhook do Stripe: o id do evento
 * entra numa tabela com PK antes do processamento; chave duplicada responde
 * 200 e sai; falha no processamento apaga a linha para o provedor reenviar.
 *
 * A IA NÃO é chamada aqui. O webhook só marca `needs_analysis`, porque
 * analisar no caminho do webhook estouraria o tempo limite do provedor e
 * geraria análises duplicadas a cada retentativa.
 */
export async function POST(request: NextRequest) {
  const provider = getWhatsAppProvider();
  const rawBody = await request.text();

  if (
    !provider.verifyWebhook({
      url: request.nextUrl,
      headers: request.headers,
      rawBody,
    })
  ) {
    console.error("[wa-webhook] segredo inválido");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const eventId = provider.eventId(payload);
  if (!eventId) {
    // Presença, status de entrega e afins: não são erro, só não nos interessam.
    return NextResponse.json({ received: true, ignored: true });
  }

  const adminResult = tryCreateAdminClient();
  if (!adminResult.ok) {
    console.error("[wa-webhook] SUPABASE_SERVICE_ROLE_KEY ausente");
    return NextResponse.json(
      { error: "admin_not_configured", message: adminResult.message },
      { status: 500 },
    );
  }
  const admin = adminResult.admin;

  const { error: insertError } = await admin.from("wa_webhook_events").insert({
    id: eventId,
    provider: provider.id,
    event_type:
      typeof (payload as { event?: unknown })?.event === "string"
        ? (payload as { event: string }).event
        : null,
    payload: payload as Record<string, unknown>,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[wa-webhook] falha ao registrar evento:", insertError);
    return NextResponse.json({ error: "db_insert_failed" }, { status: 500 });
  }

  try {
    const mensagens = provider.normalizeInbound(payload);

    // Mensagem só com LID: entra se o dono já vinculou esse LID a um lead.
    const pendentes = provider.pendentesInbound?.(payload) ?? [];
    if (pendentes.length > 0) {
      const vinculos = await carregarVinculosLid(admin);
      for (const p of pendentes) {
        const telefone = vinculos[p.lid];
        if (telefone) mensagens.push(p.resolver(telefone));
      }
    }

    const resultado = await ingestMessages(admin, provider.id, mensagens);

    if (resultado.mensagensGravadas > 0 || resultado.leadsCriados > 0) {
      console.log(
        `[wa-webhook] ${resultado.mensagensGravadas} mensagem(ns), ${resultado.leadsCriados} lead(s) novo(s)`,
      );
    }

    return NextResponse.json({ received: true, ...resultado });
  } catch (err) {
    console.error("[wa-webhook] falha ao processar:", err);

    // Libera o id para que a retentativa do provedor seja reprocessada.
    await admin.from("wa_webhook_events").delete().eq("id", eventId);

    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
