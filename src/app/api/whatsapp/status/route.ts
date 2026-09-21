import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWhatsAppProvider } from "@/lib/whatsapp";

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

    return NextResponse.json({
      provedor,
      conectado: conexao.connected,
      etapas,
      resumo: conexao.connected
        ? "Tudo certo. Pode sincronizar o histórico."
        : "O servidor respondeu, mas a instância não está conectada ao WhatsApp. Leia o QR Code.",
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
