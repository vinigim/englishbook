import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import { ingestMessages } from "@/lib/whatsapp/ingest";
import { carregarVinculosLid, varrerPendentes } from "@/lib/whatsapp/lid-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Conversas que chegaram só com LID e que nada conseguiu ligar a um telefone.
 *
 * GET lista, agrupadas por LID, com o bastante para o dono reconhecer cada
 * uma. POST grava o vínculo LID → lead (wa_lid_links) e já traz a conversa
 * para dentro do lead, sem esperar a próxima sincronização.
 *
 * Os trechos de texto aparecem aqui pelo mesmo motivo que aparecem na tela do
 * lead: é a conversa do próprio dono, vista só por quem está em lux_staff.
 */

/** Teto de leitura do histórico: a rota tem 60s e precisa responder antes. */
const LIMITE_MS = 45_000;
const TRECHOS = 3;
const TRECHO_MAX = 160;

async function exigirUsuario() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? supabase : null;
}

function cortar(s: string | null): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > TRECHO_MAX ? `${t.slice(0, TRECHO_MAX - 1)}…` : t;
}

export async function GET() {
  const supabase = await exigirUsuario();
  if (!supabase) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const adminResult = tryCreateAdminClient();
  if (!adminResult.ok) {
    return NextResponse.json({ error: "admin_not_configured" }, { status: 500 });
  }

  try {
    const provider = getWhatsAppProvider();
    const [varredura, manuais, porNome] = await Promise.all([
      varrerPendentes(provider, LIMITE_MS),
      carregarVinculosLid(adminResult.admin),
      provider.fetchLidMap
        ? provider
            .fetchLidMap()
            .then((r) => r.map)
            .catch(() => ({}) as Record<string, string>)
        : Promise.resolve({} as Record<string, string>),
    ]);

    const grupos = new Map<string, typeof varredura.pendentes>();
    for (const p of varredura.pendentes) {
      // O que a sincronização já resolve sozinha não é problema do dono.
      if (varredura.lidMapAlt[p.lid] || manuais[p.lid] || porNome[p.lid]) continue;
      const g = grupos.get(p.lid) ?? [];
      g.push(p);
      grupos.set(p.lid, g);
    }

    const conversas = Array.from(grupos.entries()).map(([lid, msgs]) => {
      const ordenadas = msgs
        .map((m) => m.resumo)
        .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
      return {
        lid,
        total: ordenadas.length,
        recebidas: ordenadas.filter((m) => !m.fromMe).length,
        enviadas: ordenadas.filter((m) => m.fromMe).length,
        primeira: ordenadas[0]?.sentAt ?? null,
        ultima: ordenadas[ordenadas.length - 1]?.sentAt ?? null,
        nome: ordenadas.find((m) => !m.fromMe && m.pushName)?.pushName ?? null,
        trechos: ordenadas
          .filter((m) => m.texto)
          .slice(0, TRECHOS)
          .map((m) => ({ fromMe: m.fromMe, sentAt: m.sentAt, texto: cortar(m.texto) })),
      };
    });

    conversas.sort((a, b) => (b.ultima ?? "").localeCompare(a.ultima ?? ""));

    return NextResponse.json({
      conversas,
      paginas: varredura.paginas,
      chegouAoFim: varredura.chegouAoFim,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wa-nao-identificadas] GET:", msg);
    return NextResponse.json({ error: "falha", message: msg }, { status: 500 });
  }
}

const vinculoSchema = z.object({
  lid: z.string().regex(/^\d+$/, "LID inválido"),
  leadId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const supabase = await exigirUsuario();
  if (!supabase) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = vinculoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }
  const { lid, leadId } = parsed.data;

  const adminResult = tryCreateAdminClient();
  if (!adminResult.ok) {
    return NextResponse.json({ error: "admin_not_configured" }, { status: 500 });
  }

  // Cliente do usuário: a RLS (lux_staff) decide se ele vê o lead e se pode
  // gravar o vínculo.
  const { data: lead } = await supabase
    .from("wa_leads")
    .select("phone_e164")
    .eq("id", leadId)
    .maybeSingle();
  const telefone = (lead as { phone_e164: string | null } | null)?.phone_e164;
  if (!telefone) {
    return NextResponse.json({ error: "lead_sem_telefone" }, { status: 404 });
  }

  const { error } = await supabase
    .from("wa_lid_links")
    .upsert({ lid, phone_e164: telefone, lead_id: leadId }, { onConflict: "lid" });
  if (error) {
    // 42P01: a tabela não existe — a migração 0017 ainda não rodou.
    const semTabela = error.code === "42P01" || /wa_lid_links/.test(error.message);
    return NextResponse.json(
      {
        error: semTabela ? "migracao_pendente" : "falha_ao_gravar",
        message: semTabela
          ? "Rode a migração 0017_wa_lid_links.sql no SQL Editor do Supabase."
          : error.message,
      },
      { status: 500 },
    );
  }

  // Vínculo gravado: traz a conversa agora. Se o tempo acabar antes, o
  // vínculo já vale e o "Reler tudo" termina o serviço.
  try {
    const provider = getWhatsAppProvider();
    const varredura = await varrerPendentes(provider, LIMITE_MS);
    const mensagens = varredura.pendentes
      .filter((p) => p.lid === lid)
      .map((p) => p.resolver(telefone));
    const resultado = await ingestMessages(adminResult.admin, provider.id, mensagens);

    return NextResponse.json({
      ok: true,
      mensagens: mensagens.length,
      gravadas: resultado.mensagensGravadas,
      completo: varredura.chegouAoFim,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wa-nao-identificadas] POST:", msg);
    return NextResponse.json({
      ok: true,
      mensagens: 0,
      gravadas: 0,
      completo: false,
      aviso: `Vínculo salvo, mas a conversa não veio agora (${msg}). Use "Reler tudo".`,
    });
  }
}
