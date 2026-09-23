import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import { ingestMessages } from "@/lib/whatsapp/ingest";
import { carregarVinculosLid, varrerPendentes } from "@/lib/whatsapp/lid-links";
import { criarSugeridor } from "@/lib/whatsapp/sugestoes";

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
    const [varredura, manuais, porNome, nomesLid, leadsRes] = await Promise.all([
      varrerPendentes(provider, LIMITE_MS),
      carregarVinculosLid(adminResult.admin),
      provider.fetchLidMap
        ? provider
            .fetchLidMap()
            .then((r) => r.map)
            .catch(() => ({}) as Record<string, string>)
        : Promise.resolve({} as Record<string, string>),
      provider.nomesPorLid
        ? provider.nomesPorLid().catch(() => ({}) as Record<string, string[]>)
        : Promise.resolve({} as Record<string, string[]>),
      supabase
        .from("wa_leads")
        .select("id, sheet_name, display_name, clinic_name")
        .eq("archived", false)
        .limit(5000),
    ]);

    const leads = (
      (leadsRes.data ?? []) as {
        id: string;
        sheet_name: string | null;
        display_name: string | null;
        clinic_name: string | null;
      }[]
    ).map((l) => ({
      id: l.id,
      nomes: [l.sheet_name, l.display_name, l.clinic_name].filter(
        (n): n is string => Boolean(n),
      ),
    }));
    const sugerir = criarSugeridor(leads);

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

      const nomesDoContato = [
        ...(nomesLid[lid] ?? []),
        ...ordenadas
          .filter((m) => !m.fromMe && m.pushName && /\p{L}/u.test(m.pushName))
          .map((m) => m.pushName as string),
      ];
      const textosDoContato = ordenadas
        .filter((m) => !m.fromMe && m.texto)
        .map((m) => m.texto as string);

      const textosNossos = ordenadas
        .filter((m) => m.fromMe && m.texto)
        .map((m) => m.texto as string);

      return {
        lid,
        sugestao: sugerir(nomesDoContato, textosDoContato, textosNossos),
        total: ordenadas.length,
        recebidas: ordenadas.filter((m) => !m.fromMe).length,
        enviadas: ordenadas.filter((m) => m.fromMe).length,
        primeira: ordenadas[0]?.sentAt ?? null,
        ultima: ordenadas[ordenadas.length - 1]?.sentAt ?? null,
        // Nas cópias do histórico o pushName costuma vir com o próprio LID
        // (só dígitos). Isso não é nome: sem letra, fica "Contato sem nome".
        // O nome salvo no celular, se o WhatsApp repassou; senão o pushName.
        nome: nomesDoContato[0] ?? null,
        // As mensagens DO CONTATO primeiro. A nossa é quase sempre a mesma
        // abordagem para todo mundo, e mostrada primeiro deixava as 89
        // conversas idênticas na tela.
        trechos: [
          ...ordenadas.filter((m) => !m.fromMe && m.texto),
          ...ordenadas.filter((m) => m.fromMe && m.texto),
        ]
          .slice(0, TRECHOS)
          .map((m) => ({ fromMe: m.fromMe, sentAt: m.sentAt, texto: cortar(m.texto) })),
      };
    });

    // Quem respondeu vem primeiro: é conversa de verdade, que pode estar
    // esperando retorno. Só a nossa abordagem sem resposta muda pouco no lead.
    conversas.sort(
      (a, b) =>
        Number(b.recebidas > 0) - Number(a.recebidas > 0) ||
        (b.ultima ?? "").localeCompare(a.ultima ?? ""),
    );

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

const umVinculo = z.object({
  lid: z.string().regex(/^\d+$/, "LID inválido"),
  leadId: z.string().uuid(),
});

// Um só, ou vários de uma vez ("vincular todas as sugestões"): em lote, o
// histórico é lido UMA vez para todos, em vez de uma leitura de 40s por
// conversa.
const vinculoSchema = z.union([
  umVinculo,
  z.object({ vinculos: z.array(umVinculo).min(1).max(200) }),
]);

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
  const pedidos = "vinculos" in parsed.data ? parsed.data.vinculos : [parsed.data];

  const adminResult = tryCreateAdminClient();
  if (!adminResult.ok) {
    return NextResponse.json({ error: "admin_not_configured" }, { status: 500 });
  }

  // Cliente do usuário: a RLS (lux_staff) decide se ele vê os leads e se pode
  // gravar os vínculos.
  const { data: leadsData } = await supabase
    .from("wa_leads")
    .select("id, phone_e164")
    .in("id", [...new Set(pedidos.map((p) => p.leadId))]);
  const telefonePorLead = new Map(
    ((leadsData ?? []) as { id: string; phone_e164: string | null }[])
      .filter((l) => l.phone_e164)
      .map((l) => [l.id, l.phone_e164 as string]),
  );

  const linhas = pedidos
    .filter((p) => telefonePorLead.has(p.leadId))
    .map((p) => ({ lid: p.lid, phone_e164: telefonePorLead.get(p.leadId)!, lead_id: p.leadId }));
  if (linhas.length === 0) {
    return NextResponse.json({ error: "lead_sem_telefone" }, { status: 404 });
  }

  const { error } = await supabase
    .from("wa_lid_links")
    .upsert(linhas, { onConflict: "lid" });
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

  // Vínculos gravados: traz as conversas agora. Se o tempo acabar antes, os
  // vínculos já valem e o "Reler tudo" termina o serviço.
  const telefonePorLid = new Map(linhas.map((l) => [l.lid, l.phone_e164]));
  try {
    const provider = getWhatsAppProvider();
    const varredura = await varrerPendentes(provider, LIMITE_MS);
    const mensagens = varredura.pendentes
      .filter((p) => telefonePorLid.has(p.lid))
      .map((p) => p.resolver(telefonePorLid.get(p.lid)!));
    const resultado = await ingestMessages(adminResult.admin, provider.id, mensagens);

    return NextResponse.json({
      ok: true,
      vinculados: linhas.length,
      mensagens: mensagens.length,
      gravadas: resultado.mensagensGravadas,
      completo: varredura.chegouAoFim,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wa-nao-identificadas] POST:", msg);
    return NextResponse.json({
      ok: true,
      vinculados: linhas.length,
      mensagens: 0,
      gravadas: 0,
      completo: false,
      aviso: `Vínculo(s) salvo(s), mas as conversas não vieram agora (${msg}). Use "Reler tudo".`,
    });
  }
}

const desfazerSchema = z.object({
  lid: z.string().regex(/^\d+$/, "LID inválido"),
});

/**
 * Desfaz um vínculo feito no lead errado.
 *
 * Apaga o vínculo e as mensagens daquele LID que ele trouxe para o lead, e
 * recalcula as datas de conversa do lead a partir do que sobrou — senão ele
 * continuaria "em conversa" e no "Devo responder" por causa de uma conversa
 * que não é dele. A conversa volta para a lista de não identificadas e pode
 * ser vinculada de novo.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await exigirUsuario();
  if (!supabase) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = desfazerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { lid } = parsed.data;

  const { data: link } = await supabase
    .from("wa_lid_links")
    .select("lead_id")
    .eq("lid", lid)
    .maybeSingle();
  const leadId = (link as { lead_id: string | null } | null)?.lead_id ?? null;

  // As mensagens trazidas pelo vínculo guardam o LID como chat_id: é o
  // endereço original da conversa, e é por ele que se separa o que veio daqui.
  let removidas = 0;
  if (leadId) {
    const { data: apagadas, error } = await supabase
      .from("wa_messages")
      .delete()
      .eq("lead_id", leadId)
      .eq("chat_id", `${lid}@lid`)
      .select("id");
    if (error) {
      return NextResponse.json(
        { error: "falha_ao_apagar", message: error.message },
        { status: 500 },
      );
    }
    removidas = (apagadas ?? []).length;

    await recalcularDatas(supabase, leadId);
  }

  const { error: delErr } = await supabase.from("wa_lid_links").delete().eq("lid", lid);
  if (delErr) {
    return NextResponse.json(
      { error: "falha_ao_desfazer", message: delErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, removidas });
}

type Supa = NonNullable<Awaited<ReturnType<typeof exigirUsuario>>>;

/** Última mensagem de cada lado, a partir do que ficou no banco. */
async function recalcularDatas(supabase: Supa, leadId: string) {
  const ultima = async (direcao?: "in" | "out") => {
    let q = supabase
      .from("wa_messages")
      .select("sent_at")
      .eq("lead_id", leadId)
      .order("sent_at", { ascending: false })
      .limit(1);
    if (direcao) q = q.eq("direction", direcao);
    const { data } = await q.maybeSingle();
    return (data as { sent_at: string } | null)?.sent_at ?? null;
  };

  const [geral, entrada, saida] = await Promise.all([
    ultima(),
    ultima("in"),
    ultima("out"),
  ]);

  await supabase
    .from("wa_leads")
    .update({
      last_message_at: geral,
      last_inbound_at: entrada,
      last_outbound_at: saida,
      needs_analysis: true,
    })
    .eq("id", leadId);
}
