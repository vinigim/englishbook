import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listarConsultas } from "@/lib/laser/consultas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Consultas de parâmetros de um médico: GET /api/laser/consultas?medico=Ana
 *
 * Sem `medico`, devolve as mais recentes. A RLS de laser_consultas (lux_staff)
 * decide o que cada usuário vê, então não há checagem extra aqui: quem não é
 * da equipe recebe a lista vazia.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const medico = request.nextUrl.searchParams.get("medico")?.slice(0, 100) ?? "";
  const { consultas, erro, semVinculo } = await listarConsultas(supabase, {
    medico,
    limite: 100,
  });

  if (erro && semVinculo && medico) {
    return NextResponse.json(
      {
        error: "migration_missing",
        message: "Rode a migração 0022_laser_consulta_locacao.sql para buscar por médico.",
      },
      { status: 500 },
    );
  }
  if (erro) {
    console.error("[laser-consultas] falha ao listar", erro);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ consultas });
}
