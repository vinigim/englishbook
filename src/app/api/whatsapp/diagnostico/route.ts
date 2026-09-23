import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWhatsAppProvider } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Diagnóstico de UM lead: o que o WhatsApp sabe sobre o telefone dele.
 *
 * Existe para responder "por que este lead da planilha, que recebeu mensagem,
 * aparece sem conversa?". A suspeita é o LID: o histórico chega endereçado por
 * um id interno em vez do telefone, e sem resposta do contato não há de onde
 * tirar o par LID→telefone. Esta rota mede isso antes de qualquer correção.
 *
 * Só lê. Não grava nada e não devolve o conteúdo das mensagens.
 */

const bodySchema = z.object({ leadId: z.string().uuid() });

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Cliente do usuário, não o admin: a RLS dos leads (lux_staff) decide se
  // ele pode ver este telefone.
  const { data: lead } = await supabase
    .from("wa_leads")
    .select("phone_e164")
    .eq("id", parsed.data.leadId)
    .maybeSingle();

  const telefone = (lead as { phone_e164: string | null } | null)?.phone_e164;
  if (!telefone) {
    return NextResponse.json({ error: "lead_sem_telefone" }, { status: 404 });
  }

  try {
    const provider = getWhatsAppProvider();
    if (!provider.diagnosticarTelefone) {
      return NextResponse.json(
        { error: "provedor_sem_diagnostico" },
        { status: 400 },
      );
    }
    const resultado = await provider.diagnosticarTelefone(telefone);
    return NextResponse.json(resultado);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wa-diagnostico]", msg);
    return NextResponse.json({ error: "falha", message: msg }, { status: 500 });
  }
}
