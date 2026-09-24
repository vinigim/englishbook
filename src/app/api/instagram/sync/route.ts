import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import {
  InstagramApiError,
  InstagramNaoConfiguradoError,
  minhaConta,
  obterToken,
  paginaDeConversas,
  registrarSync,
} from "@/lib/instagram/api";
import {
  gravarConversas,
  mapaDeLeads,
  type ConversaSemLead,
  type LeadDoInstagram,
} from "@/lib/instagram/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Traz o direct do Instagram para os leads.
 *
 * Diferente do backfill do WhatsApp, é SEM estado no servidor: cada chamada lê
 * páginas até o tempo acabar e devolve o cursor `after`, e a tela chama de
 * novo com ele até `continuar` ser falso — o mesmo encadeamento do "Analisar
 * pendentes".
 *
 * Por padrão só lê o que mudou desde a última sincronização completa: a
 * listagem vem da conversa mais recente para a mais antiga, então a primeira
 * conversa mais velha que a marca encerra a leitura. `completo` ignora a
 * marca.
 *
 * `diagnostico` não grava nada: devolve a conta conectada e as 3 conversas
 * mais recentes como a Meta mandou. Serve para conferir o formato da resposta
 * — a integração foi escrita sem acesso à API — e para achar a causa quando a
 * sincronização não traz o que deveria.
 */

/** Folga sobre o maxDuration de 60s para responder antes de ser cortado. */
const LIMITE_MS = 40_000;

/**
 * Margem na marca da última sincronização. Uma conversa que recebeu mensagem
 * durante a sincronização anterior pode ter ficado com updated_time um pouco
 * antes da marca.
 */
const MARGEM_MS = 60 * 60 * 1000;

const bodySchema = z.object({
  after: z.string().max(2000).nullish(),
  completo: z.boolean().optional(),
  iniciadaEm: z.string().datetime().optional(),
  diagnostico: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
      { error: "invalid_body", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  const adminResult = tryCreateAdminClient();
  if (!adminResult.ok) {
    console.error("[ig-sync] SUPABASE_SERVICE_ROLE_KEY ausente");
    return NextResponse.json(
      { error: "admin_not_configured", message: adminResult.message },
      { status: 500 },
    );
  }
  const admin = adminResult.admin;

  // O admin ignora a RLS, então a allowlist é conferida aqui: o direct da
  // empresa é tão sensível quanto o WhatsApp.
  const { data: staff } = await admin
    .from("lux_staff")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!staff) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { after: afterInicial = null, completo = false, diagnostico = false } =
    parsed.data;
  const inicio = Date.now();
  const iniciadaEm = parsed.data.iniciadaEm ?? new Date(inicio).toISOString();

  try {
    const { token, ultimaSyncEm, podeGuardar } = await obterToken(admin);
    const conta = await minhaConta(token);

    if (diagnostico) {
      const { conversas } = await paginaDeConversas(token, null, 3);
      return NextResponse.json({
        conta: { username: conta.username, userId: conta.userId, idApp: conta.idApp },
        ultimaSyncEm,
        podeGuardar,
        amostra: conversas.map((c) => ({
          ...c,
          messages: {
            data: (c.messages?.data ?? []).slice(0, 3).map((m) => ({
              ...m,
              message: m.message?.slice(0, 200),
            })),
            total: c.messages?.data?.length ?? 0,
          },
        })),
      });
    }

    // Todos os leads com Instagram, paginando: o PostgREST corta em 1000.
    const leads: LeadDoInstagram[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await admin
        .from("wa_leads")
        .select(
          "id, instagram, first_seen_at, last_message_at, last_inbound_at, instagram_sent_at",
        )
        .not("instagram", "is", null)
        .order("id")
        .range(de, de + 999);
      if (error) throw new Error(`falha ao ler leads: ${error.message}`);
      leads.push(...((data ?? []) as LeadDoInstagram[]));
      if ((data ?? []).length < 1000) break;
    }
    const mapa = mapaDeLeads(leads);

    const corte =
      !completo && ultimaSyncEm
        ? new Date(ultimaSyncEm).getTime() - MARGEM_MS
        : null;

    const totais = {
      conversas: 0,
      comLead: 0,
      mensagensNovas: 0,
      respostasNovas: 0,
      leadsAtualizados: 0,
    };
    const semLead: ConversaSemLead[] = [];
    const ambiguas = new Set<string>();

    let after = afterInicial;
    let fim = false;
    let paginas = 0;

    while (Date.now() - inicio < LIMITE_MS) {
      const pagina = await paginaDeConversas(token, after);
      paginas += 1;

      let conversas = pagina.conversas;
      if (corte !== null) {
        const recentes = conversas.filter(
          (c) => new Date(c.updated_time).getTime() >= corte,
        );
        if (recentes.length < conversas.length) fim = true;
        conversas = recentes;
      }

      const r = await gravarConversas(admin, conta, conversas, mapa);
      totais.conversas += r.conversas;
      totais.comLead += r.comLead;
      totais.mensagensNovas += r.mensagensNovas;
      totais.respostasNovas += r.respostasNovas;
      totais.leadsAtualizados += r.leadsAtualizados;
      semLead.push(...r.semLead);
      r.ambiguas.forEach((a) => ambiguas.add(a));

      after = pagina.after;
      if (!after) fim = true;
      if (fim) break;
    }

    if (fim) {
      await registrarSync(admin, {
        quando: iniciadaEm,
        igUserId: conta.userId,
        username: conta.username,
      });
    }

    return NextResponse.json({
      conta: conta.username,
      incremental: corte !== null,
      paginas,
      ...totais,
      semLead,
      ambiguas: [...ambiguas],
      continuar: !fim,
      after: fim ? null : after,
      iniciadaEm,
      podeGuardar,
    });
  } catch (err) {
    if (err instanceof InstagramNaoConfiguradoError) {
      return NextResponse.json(
        { error: "instagram_not_configured", message: err.message },
        { status: 500 },
      );
    }
    if (err instanceof InstagramApiError) {
      console.error("[ig-sync] API do Instagram:", err.status, err.code, err.message);
      // 190 é token inválido ou expirado: o único caso em que o dono precisa
      // voltar ao painel da Meta.
      const message =
        err.code === 190
          ? "O token do Instagram expirou ou foi revogado. Gere outro no app da Meta (Casos de uso → Instagram → Gerar token), troque o INSTAGRAM_ACCESS_TOKEN na Vercel e refaça o deploy."
          : `A API do Instagram recusou: ${err.message}`;
      return NextResponse.json({ error: "instagram_api", message }, { status: 502 });
    }
    console.error("[ig-sync] falha:", err);
    return NextResponse.json(
      {
        error: "sync_failed",
        message: err instanceof Error ? err.message : "Falha ao sincronizar.",
      },
      { status: 500 },
    );
  }
}
