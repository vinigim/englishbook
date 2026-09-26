import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import type { WhatsAppProvider } from "@/lib/whatsapp/provider";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { carregarVinculosLid, lidsAprendidos } from "@/lib/whatsapp/lid-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diz em que pé está a conexão com o WhatsApp.
 *
 * Existe para tornar a configuração depurável. São quatro coisas que podem
 * estar erradas — variável faltando, servidor fora do ar, instância sem ler o
 * QR, credencial recusada — e sem isto todas aparecem do mesmo jeito: o
 * botão "Sincronizar histórico" não traz nada.
 *
 * NUNCA devolve o valor de uma variável, só se ela está preenchida.
 */

type Etapa = {
  nome: string;
  ok: boolean;
  detalhe?: string;
};

const VARS_EVOLUTION = [
  "EVOLUTION_API_URL",
  "EVOLUTION_API_KEY",
  "EVOLUTION_INSTANCE",
  "WHATSAPP_WEBHOOK_SECRET",
] as const;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const provedor = (process.env.WHATSAPP_PROVIDER ?? "evolution").toLowerCase();
  const etapas: Etapa[] = [];

  etapas.push({
    nome: "Provedor escolhido",
    ok: provedor === "evolution" || provedor === "mock",
    detalhe: provedor,
  });

  if (provedor === "evolution") {
    const faltando = VARS_EVOLUTION.filter((v) => !process.env[v]);
    etapas.push({
      nome: "Variáveis de ambiente",
      ok: faltando.length === 0,
      detalhe:
        faltando.length === 0
          ? "todas preenchidas"
          : `faltando: ${faltando.join(", ")}`,
    });

    // Sem as variáveis não adianta tentar falar com o servidor — o erro que
    // voltaria seria sobre a configuração, não sobre a conexão.
    if (faltando.length > 0) {
      return NextResponse.json({
        provedor,
        conectado: false,
        etapas,
        resumo:
          "Configure as variáveis que faltam na Vercel e refaça o deploy — variável nova só vale depois de um Redeploy.",
      });
    }
  }

  try {
    const provider = getWhatsAppProvider();
    const conexao = await provider.connectionStatus();

    etapas.push({
      nome: "Resposta do servidor",
      ok: true,
      detalhe: `estado: ${conexao.label}`,
    });

    etapas.push({
      nome: "Instância conectada ao WhatsApp",
      ok: conexao.connected,
      detalhe: conexao.connected
        ? "pronta para sincronizar"
        : "leia o QR Code no painel do provedor",
    });

    // ?amostra=1 devolve as chaves cruas de algumas mensagens.
    //
    // Existe porque 99,6% do histórico chega endereçado só por LID, e decidir
    // o que fazer com isso depende de ver o que mais vem no `key` — não de
    // deduzir pela documentação, que já custou vários ciclos aqui.
    //
    // Nunca inclui o conteúdo da mensagem: só endereçamento.
    const amostra = new URL(request.url).searchParams.get("amostra");
    if (amostra && provider.debugKeySample) {
      const n = Math.min(Math.max(Number(amostra) || 5, 1), 20);
      try {
        const chaves = await provider.debugKeySample(n);
        return NextResponse.json({
          provedor,
          conectado: conexao.connected,
          etapas,
          amostraDeChaves: chaves,
          resumo: `Amostra de ${chaves.length} chave(s). Só endereçamento — nenhum conteúdo de conversa.`,
        });
      } catch (err) {
        return NextResponse.json({
          provedor,
          conectado: conexao.connected,
          etapas,
          resumo: `Falha ao coletar amostra: ${err instanceof Error ? err.message : "erro"}`,
        });
      }
    }

    if (!conexao.connected) {
      return NextResponse.json({
        provedor,
        conectado: false,
        etapas,
        resumo:
          "O servidor respondeu, mas a instância não está conectada ao WhatsApp. Leia o QR Code.",
      });
    }

    const problemas = await checarMensagensNovas(
      provider,
      etapas,
      request.headers.get("host"),
    );

    return NextResponse.json({
      provedor,
      conectado: true,
      etapas,
      resumo:
        problemas.length === 0
          ? "Tudo certo. Pode sincronizar o histórico."
          : problemas.join(" "),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "falha desconhecida";
    console.error("[wa-status]", msg);

    etapas.push({
      nome: "Resposta do servidor",
      ok: false,
      detalhe: msg.slice(0, 300),
    });

    return NextResponse.json({
      provedor,
      conectado: false,
      etapas,
      resumo:
        "Não consegui falar com o servidor do provedor. Confira se a EVOLUTION_API_URL está certa e se o serviço está no ar.",
    });
  }
}

// ============================================================================
//  As mensagens novas estão chegando?
// ============================================================================

const DIA_MS = 24 * 60 * 60 * 1000;

function quando(iso: string | null): string {
  if (!iso) return "nenhuma";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

function maisRecenteDe(datas: string[]): string | null {
  const ts = datas.map((d) => Date.parse(d)).filter(Number.isFinite);
  return ts.length > 0 ? new Date(Math.max(...ts)).toISOString() : null;
}

/**
 * "Conectado" não quer dizer que as mensagens novas chegam. São três elos, e
 * qualquer um quebra em silêncio:
 *
 *   WhatsApp → Evolution    (a Evolution guarda a mensagem?)
 *   Evolution → webhook     (ela avisa o app? na URL certa, com o segredo?)
 *   Evolution → Radar       (a mensagem vira conversa de um lead?)
 *
 * Cada etapa aqui testa um elo. Devolve as frases de diagnóstico, na ordem
 * em que o dono deve resolver.
 */
async function checarMensagensNovas(
  provider: WhatsAppProvider,
  etapas: Etapa[],
  host: string | null,
): Promise<string[]> {
  const problemas: string[] = [];

  // --------------------------------------------------- 1. webhook cadastrado
  if (provider.webhookConfig) {
    try {
      const w = await provider.webhookConfig();
      const erros: string[] = [];
      if (!w || !w.url) erros.push("nenhum webhook cadastrado");
      else {
        if (!w.habilitado) erros.push("está desligado");
        if (!w.url.endsWith("/api/whatsapp/webhook"))
          erros.push(`URL ${w.url} não termina em /api/whatsapp/webhook`);
        else if (host && !w.url.includes(host))
          erros.push(`aponta para ${w.url}, e este painel está em ${host}`);
        if (w.porEvento) erros.push('"Webhook by events" está ligado');
        if (w.eventos.length > 0 && !w.eventos.includes("MESSAGES_UPSERT"))
          erros.push("evento MESSAGES_UPSERT não está marcado");
        if (!w.segredoOk)
          erros.push("o segredo (?s=…) não confere com WHATSAPP_WEBHOOK_SECRET");
      }
      etapas.push({
        nome: "Webhook cadastrado na Evolution",
        ok: erros.length === 0,
        detalhe: erros.length === 0 ? (w?.url ?? "") : erros.join("; "),
      });
      if (erros.length > 0) {
        problemas.push(
          "Mensagens novas não chegam sozinhas: corrija o webhook na Evolution (URL https://<seu-app>/api/whatsapp/webhook?s=<WHATSAPP_WEBHOOK_SECRET>, evento MESSAGES_UPSERT, \"Webhook by events\" desligado).",
        );
      }
    } catch (err) {
      etapas.push({
        nome: "Webhook cadastrado na Evolution",
        ok: false,
        detalhe: `não consegui ler: ${err instanceof Error ? err.message.slice(0, 200) : "erro"}`,
      });
    }
  }

  // ------------------------------------------- 2. a Evolution guarda o novo?
  let naEvolution: string | null = null;
  let lidsRecentes: string[] = [];
  try {
    const pagina = await provider.fetchMessagesPage({ page: 1, pageSize: 50 });
    naEvolution = maisRecenteDe([
      ...pagina.mensagens.map((m) => m.sentAt),
      ...pagina.pendentes.map((p) => p.resumo.sentAt),
    ]);
    lidsRecentes = [...new Set(pagina.pendentes.map((p) => p.lid))];
    const velha = !naEvolution || Date.now() - Date.parse(naEvolution) > DIA_MS;
    etapas.push({
      nome: "Mensagem mais recente guardada na Evolution",
      ok: !velha,
      detalhe: quando(naEvolution),
    });
    if (velha) {
      problemas.push(
        "A Evolution não está guardando mensagens novas, então nenhuma sincronização vai trazê-las. Reinicie a instância no painel da Evolution (Restart) e confira DATABASE_SAVE_DATA_NEW_MESSAGE=true no servidor dela.",
      );
    }
  } catch (err) {
    etapas.push({
      nome: "Mensagem mais recente guardada na Evolution",
      ok: false,
      detalhe: err instanceof Error ? err.message.slice(0, 200) : "erro",
    });
  }

  const adminResult = tryCreateAdminClient();
  if (!adminResult.ok) return problemas;
  const admin = adminResult.admin;

  // --------------------------------------------- 3. o webhook está chamando?
  const { data: evento } = await admin
    .from("wa_webhook_events")
    .select("received_at")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ultimoEvento = (evento?.received_at as string | undefined) ?? null;
  const eventoVelho =
    !ultimoEvento ||
    (naEvolution != null &&
      Date.parse(naEvolution) - Date.parse(ultimoEvento) > 2 * 60 * 60 * 1000);
  etapas.push({
    nome: "Último aviso recebido pelo webhook",
    ok: !eventoVelho,
    detalhe: quando(ultimoEvento),
  });
  if (eventoVelho && problemas.length === 0) {
    problemas.push(
      "A Evolution tem mensagens mais novas do que o último aviso que o app recebeu: o webhook não está chegando. Confira nos logs da Evolution se as chamadas ao webhook dão erro (401 = segredo errado, 404 = URL errada).",
    );
  }

  // ------------------------------------------- 4. o Radar tem o que ela tem?
  const { data: msg } = await admin
    .from("wa_messages")
    .select("sent_at")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const noRadar = (msg?.sent_at as string | undefined) ?? null;
  const atrasado =
    naEvolution != null &&
    (!noRadar || Date.parse(naEvolution) - Date.parse(noRadar) > 2 * 60 * 60 * 1000);
  etapas.push({
    nome: "Mensagem mais recente no Radar",
    ok: !atrasado,
    detalhe: quando(noRadar),
  });

  // Das 50 mais recentes, quantos contatos chegaram só com LID e ninguém
  // sabe quem são — essas vão para "Conversas não identificadas".
  if (lidsRecentes.length > 0) {
    const [manuais, aprendidos] = await Promise.all([
      carregarVinculosLid(admin),
      lidsAprendidos(admin, lidsRecentes),
    ]);
    const orfaos = lidsRecentes.filter((l) => !manuais[l] && !aprendidos[l]);
    etapas.push({
      nome: "Contatos recentes identificados",
      ok: orfaos.length === 0,
      detalhe:
        orfaos.length === 0
          ? "todos"
          : `${orfaos.length} contato(s) recente(s) só com LID — vincule em "Conversas não identificadas"`,
    });
    if (orfaos.length > 0 && problemas.length === 0) {
      problemas.push(
        'Parte das conversas recentes chega sem telefone (só o código LID do WhatsApp). Abra "Conversas não identificadas" e vincule cada uma ao lead certo — daí em diante as mensagens novas desse contato entram sozinhas.',
      );
    }
  }

  if (atrasado && problemas.length === 0) {
    problemas.push(
      'A Evolution tem mensagens que o Radar ainda não tem. Aperte "Sincronizar histórico".',
    );
  }

  return problemas;
}
