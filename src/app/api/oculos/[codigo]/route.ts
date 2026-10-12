import { NextResponse, type NextRequest } from "next/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { listarConsultasDaLocacao, paraVinculo } from "@/lib/laser/consultas";
import {
  CODIGO_OCULOS,
  DIAS_DEPOIS,
  consultaParaOculos,
  dataBR,
  dentroDaJanela,
  normalizarCodigo,
  type RespostaOculos,
} from "@/lib/laser/oculos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Parâmetros de uma locação para o app do óculos Even G2: `/api/oculos/K7M2QX9P`.
 *
 * Público de propósito: quem chama é o app do óculos, rodando no celular do
 * médico, sem login no painel. O código (gerado no painel, aleatório) é a
 * credencial, e só vale perto do dia da locação. Devolve só o que vai na
 * tela do óculos: médico, dia, equipamento e os parâmetros das consultas
 * ligadas, sem fotos nem observações do caso.
 *
 * CORS aberto e sem cookie: o app roda numa WebView com origem própria.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Cache-Control": "no-store",
};

function erro(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status, headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

type LinhaAcesso = {
  rental_id: string;
  rental:
    | { id: string; client: string; date: string; specialty: string | null; equipment: { name: string } | { name: string }[] | null }
    | null;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ codigo: string }> },
) {
  const codigo = normalizarCodigo((await params).codigo);
  if (!CODIGO_OCULOS.test(codigo)) {
    return erro(404, "codigo_invalido", "Código inválido. São 8 letras e números.");
  }

  const adminResult = tryCreateAdminClient();
  if (!adminResult.ok) {
    console.error("[oculos]", adminResult.message);
    return erro(503, "indisponivel", "Serviço indisponível. Avise a Lux Derma.");
  }
  const admin = adminResult.admin;

  const { data, error } = await admin
    .from("laser_oculos_acessos")
    .select("rental_id, rental:rentals(id, client, date, specialty, equipment:equipment(name))")
    .eq("codigo", codigo)
    .maybeSingle();
  if (error) {
    console.error("[oculos] leitura do código:", error.message);
    return erro(500, "db_error", "Falha ao ler o código. Tente de novo.");
  }
  const acesso = data as unknown as LinhaAcesso | null;
  const locacao = paraVinculo(acesso?.rental);
  if (!acesso || !locacao) {
    return erro(404, "nao_encontrado", "Código não encontrado. Confira com a Lux Derma.");
  }
  if (!dentroDaJanela(locacao.data)) {
    return erro(
      403,
      "fora_do_periodo",
      `Este código vale da véspera até ${DIAS_DEPOIS} dias depois da locação de ${dataBR(locacao.data)}.`,
    );
  }

  const consultas = await listarConsultasDaLocacao(admin, acesso.rental_id);
  if (!consultas) {
    return erro(500, "db_error", "Falha ao ler as consultas. Tente de novo.");
  }

  const { error: erroAcesso } = await admin
    .from("laser_oculos_acessos")
    .update({ ultimo_acesso_em: new Date().toISOString() })
    .eq("rental_id", acesso.rental_id);
  if (erroAcesso) console.error("[oculos] último acesso:", erroAcesso.message);

  const resposta: RespostaOculos = {
    versao: 1,
    locacao: {
      medico: locacao.medico,
      data: dataBR(locacao.data),
      equipamento: locacao.equipamento,
    },
    consultas: consultas.map(consultaParaOculos),
  };
  return NextResponse.json(resposta, { headers: CORS });
}
