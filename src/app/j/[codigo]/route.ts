import { NextResponse, type NextRequest } from "next/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import {
  numeroDaLux,
  textoDeInteresse,
  type DadosDoLink,
} from "@/app/derma-lux/janela-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Link curto da janela, mandado pelo Instagram: `/j/K7P3QX`.
 *
 * Público de propósito (quem toca é o médico, sem login). Conta o clique e
 * redireciona para o WhatsApp da Lux com o interesse já escrito. Nunca
 * devolve dado de lead: no pior caso, quem chutar um código vê o dia e a
 * cidade de uma janela.
 *
 * Qualquer falha (tabela ausente, chave de serviço faltando, código
 * desconhecido) ainda leva ao WhatsApp, com texto genérico: o médico que
 * tocou no link nunca pode cair numa página de erro.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ codigo: string }> },
) {
  const { codigo: bruto } = await params;
  const codigo = bruto.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

  const numero = numeroDaLux();
  if (!numero) {
    console.error("[janela-link] LUX_WHATSAPP não configurado");
    return NextResponse.json({ error: "link_indisponivel" }, { status: 503 });
  }

  const valido = /^[A-Z2-9]{6}$/.test(codigo);
  let dados: DadosDoLink | null = null;
  const adminResult = valido ? tryCreateAdminClient() : null;
  if (adminResult?.ok) {
    const { data, error } = await adminResult.admin.rpc("janela_registrar_clique", {
      p_codigo: codigo,
    });
    if (error) console.error("[janela-link] clique:", error.message);
    const linha = (data as DadosDoLink[] | null)?.[0];
    if (linha) dados = linha;
  }

  const texto = textoDeInteresse(dados, valido ? codigo : null);
  return NextResponse.redirect(
    `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`,
    { status: 302, headers: { "Cache-Control": "no-store" } },
  );
}
