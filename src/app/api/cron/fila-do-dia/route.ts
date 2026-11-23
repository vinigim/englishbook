import { NextResponse, type NextRequest } from "next/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { gerarFilaDoDia } from "@/lib/leads/fila-servidor";
import { fimDeSemanaSP, resumoTexto } from "@/app/derma-lux/fila-do-dia";
import { getWhatsAppProvider } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron das 6h (São Paulo) — `vercel.json`, "0 9 * * 1-5" em UTC: só dias
 * úteis, por escolha do dono. No plano Hobby
 * a Vercel dispara em algum momento dentro dessa hora, não no minuto exato.
 *
 * A Vercel manda `Authorization: Bearer <CRON_SECRET>` quando a variável
 * existe no projeto. Sem ela a rota recusa tudo: montar a fila usa a service
 * role e gasta com a IA, e não pode ficar aberta a quem achar a URL.
 *
 * Aviso opcional: com `FILA_AVISO_WHATSAPP` (um número, ex. 5518999998888),
 * o resumo vai por WhatsApp pelo provedor. É UMA mensagem por dia para um
 * número seu — longe do volume que arrisca o chip (ver "Risco de banimento").
 */
export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // O agendamento já é só de segunda a sexta; isto cobre uma chamada manual.
  if (fimDeSemanaSP()) {
    return NextResponse.json({ ok: true, pulado: "fim_de_semana" });
  }

  const adminResult = tryCreateAdminClient();
  if (!adminResult.ok) {
    console.error("[fila-do-dia] SUPABASE_SERVICE_ROLE_KEY ausente");
    return NextResponse.json({ error: "admin_not_configured" }, { status: 500 });
  }

  try {
    const r = await gerarFilaDoDia(adminResult.admin, "cron");
    const texto = resumoTexto(r.fila);
    console.log(
      `[fila-do-dia] ${texto} Análises: ${r.analisados} (US$ ${r.custoUsd.toFixed(4)}).`,
    );

    const para = process.env.FILA_AVISO_WHATSAPP?.replace(/\D/g, "");
    if (para) {
      try {
        await getWhatsAppProvider().sendText(para, `${texto}\nAbrir: https://lux-derma.vercel.app/derma-lux/leads`);
      } catch (e) {
        // O aviso é um extra: a fila já está gravada.
        console.error("[fila-do-dia] aviso:", e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json({
      ok: true,
      dia: r.fila.dia,
      analisados: r.analisados,
      custoUsd: r.custoUsd,
    });
  } catch (e) {
    console.error("[fila-do-dia]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "fila_failed" }, { status: 500 });
  }
}
