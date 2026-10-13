import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { getLeadsParaExportar } from "@/app/derma-lux/leads-data";
import {
  estadoContato,
  formatPhoneBR,
  instagramDoLead,
  situacaoEfetiva,
  temWhatsApp,
  temperaturaEfetiva,
} from "@/app/derma-lux/leads-shared";
import {
  ACTION_LABEL,
  LEAD_STATUS_LABEL,
  OBJECTION_LABEL,
  STAGE_LABEL,
  TEMPERATURE_LABEL,
} from "@/lib/leads/taxonomy";
import type { LeadKind, LeadSource } from "@/app/derma-lux/leads-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A carteira inteira numa planilha: o que veio da importação mais tudo o que
 * o Radar juntou depois (Instagram escolhido, verificação do WhatsApp, leitura
 * da IA, datas de contato, locações da agenda, instruções do dono).
 *
 * Os cabeçalhos das colunas principais (Nome, Clínica, Telefone,
 * Especialidade, Cidade, Instagram) são os que a importação reconhece, e os
 * das outras evitam as palavras que ela procura ("telefone", "whatsapp",
 * "insta", "nome"...): reimportar o arquivo não confunde colunas. As colunas
 * originais da planilha (`extra`) voltam no fim, com o cabeçalho de origem.
 */

const ESTADO_LABEL = {
  nunca_abordado: "Nunca abordado",
  devo_responder: "Devo responder",
  aguardando_ele: "Aguardando ele",
} as const;

const TIPO_LABEL: Record<LeadKind, string> = {
  medico: "Médico",
  clinica: "Clínica",
  desconhecido: "",
  outro: "Outro",
};

const ORIGEM_LABEL: Record<LeadSource, string> = {
  whatsapp: "Conversa",
  planilha: "Planilha",
  manual: "Manual",
  ambos: "Planilha + conversa",
};

const DATA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** dd/mm/aaaa, o formato que a importação e a IA já sabem ler. */
function data(iso: string | null | undefined): string {
  if (!iso) return "";
  // Data pura da agenda ("2026-10-15") não tem fuso: não converter.
  const pura = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (pura) return `${pura[3]}/${pura[2]}/${pura[1]}`;
  return DATA.format(new Date(iso));
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // O projeto do Supabase é compartilhado com contas antigas do EnglishBook.
  // A RLS já devolveria vazio para elas; o 403 só deixa isso explícito.
  const { data: staff } = await supabase
    .from("lux_staff")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!staff) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let linhas;
  try {
    linhas = await getLeadsParaExportar();
  } catch (e) {
    console.error("[leads-exportar]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const registros = linhas.map(({ lead, analysis, rentals }) => {
    const temperatura = temperaturaEfetiva(lead, analysis);
    const whats = temWhatsApp(lead);
    const base: Record<string, string | number> = {
      Nome: lead.sheet_name || lead.display_name || "",
      "Clínica": lead.clinic_name ?? "",
      Telefone: formatPhoneBR(lead.phone_e164),
      Especialidade: lead.specialty || analysis?.specialty || "",
      Cidade: lead.city ?? "",
      UF: lead.uf ?? "",
      Instagram: (() => {
        const h = instagramDoLead(lead);
        return h ? `@${h}` : "";
      })(),
      "Apelido no contato": lead.display_name ?? "",
      Tipo: TIPO_LABEL[lead.lead_kind] ?? "",
      Origem: ORIGEM_LABEL[lead.source] ?? "",
      "Situação": LEAD_STATUS_LABEL[situacaoEfetiva(lead, rentals)],
      "De quem é a vez": ESTADO_LABEL[estadoContato(lead).estado],
      Temperatura: temperatura ? TEMPERATURE_LABEL[temperatura] : "",
      "Estágio (IA)": analysis ? STAGE_LABEL[analysis.stage] : "",
      "Objeções (IA)": (analysis?.objections ?? [])
        .map((o) => OBJECTION_LABEL[o] ?? o)
        .join(", "),
      "Equipamento de interesse": (analysis?.equipment_interest ?? []).join(", "),
      "Próxima ação (IA)": analysis?.recommended_action
        ? ACTION_LABEL[analysis.recommended_action]
        : "",
      "Resumo (IA)": analysis?.summary ?? "",
      "Rascunho sugerido": analysis?.draft_message ?? "",
      "Analisado em": data(analysis?.created_at),
      "Conta no app verificada":
        whats === true ? "Tem conta" : whats === false ? "Sem conta" : "",
      "Primeiro contato em": data(lead.first_seen_at),
      "Última mensagem dele em": data(lead.last_inbound_at),
      "Nossa última mensagem em": data(lead.last_outbound_at),
      "Direct enviado em": data(lead.instagram_sent_at),
      "Locações": rentals?.total ?? 0,
      "Primeira locação": data(rentals?.primeira),
      "Última locação": data(rentals?.ultima),
      "Total locado (R$)": rentals?.total_brl != null ? Number(rentals.total_brl) : "",
      "Instruções para a IA": lead.notes ?? "",
      "Adiado até": data(lead.snoozed_until),
      Arquivado: lead.archived ? "Sim" : "",
      "Cadastrado em": data(lead.created_at),
    };

    // Colunas originais da planilha, inteiras. Cabeçalho que bate com uma
    // coluna nossa ganha o sufixo, em vez de sobrescrever o dado do Radar.
    for (const [chave, valor] of Object.entries(lead.extra ?? {})) {
      if (valor == null || valor === "") continue;
      const nome = chave in base ? `${chave} (planilha)` : chave;
      base[nome] = typeof valor === "string" || typeof valor === "number"
        ? valor
        : JSON.stringify(valor);
    }
    return base;
  });

  // Cabeçalho na ordem acima; as colunas extras entram na ordem em que
  // aparecem pela primeira vez.
  const cabecalho: string[] = [];
  const vistos = new Set<string>();
  for (const r of registros) {
    for (const k of Object.keys(r)) {
      if (!vistos.has(k)) {
        vistos.add(k);
        cabecalho.push(k);
      }
    }
  }

  const planilha = XLSX.utils.json_to_sheet(registros, { header: cabecalho });
  planilha["!cols"] = cabecalho.map((k) => ({
    wch: k === "Resumo (IA)" || k === "Rascunho sugerido" ? 60 : Math.max(12, k.length + 2),
  }));
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, "Leads");
  const arquivo = XLSX.write(livro, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return new NextResponse(new Uint8Array(arquivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="leads-lux-derma-${hoje}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
