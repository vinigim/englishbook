import { tratamentoDoMedico } from "@/lib/leads/apresentacao";
import {
  cidadeDoEndereco,
  dddDoTelefone,
  distanciaKm,
  resolverCidade,
  type Municipio,
} from "@/lib/geo/cidades";
import {
  estadoContato,
  instagramDoLead,
  leadDisplayName,
  temWhatsApp,
  temperaturaEfetiva,
  type EstadoContato,
} from "./leads-shared";
import type { LeadInboxRow } from "./leads-types";
import { fmtDayHeading } from "./shared";
import type { Block, Equipment, Rental } from "./types";

/**
 * Janelas da rota: o laser já vai estar numa cidade, então o dia vizinho
 * livre sai quase de graça para quem estiver perto.
 *
 * A agenda trata o dia como a unidade da locação (a tela de disponibilidade
 * marca o dia inteiro como "alugado"), então a janela é o dia anterior ou o
 * seguinte a uma locação, com o mesmo equipamento livre. Um fechamento de meio
 * período deixa a janela só na outra metade.
 *
 * Tudo aqui é código puro e determinístico, como a prioridade do Radar: o dono
 * precisa conseguir conferir de cabeça por que um lead apareceu.
 */

/** Raio da janela, escolhido pelo dono. Linha reta entre as cidades. */
export const RAIO_KM = 100;

/** Desconto da janela sobre a locação, escolhido pelo dono. */
export const DESCONTO_JANELA = 0.15;

/** Quantos dias à frente procurar locações-âncora. */
export const HORIZONTE_DIAS = 30;

/**
 * Quantos leads cada janela leva para a tela. Uma janela é UM dia: se os
 * primeiros 25 não fecharem, o 200º também não vai, e a carteira inteira
 * repetida em cada janela pesaria megabytes.
 */
export const MAX_POR_JANELA = 25;

export type Periodo = "dia" | "manha" | "tarde";

export type Ancora = {
  rentalId: string;
  date: string;
  client: string;
  cidade: Municipio | null;
  /** De onde veio a cidade: endereço da agenda ou cidade do lead conciliado. */
  origem: "endereco" | "lead" | null;
};

export type Candidato = {
  leadId: string;
  nome: string;
  tratamento: string | null;
  telefone: string;
  instagram: string | null;
  /** `temWhatsApp()`: falso só quando a verificação confirmou que não tem. */
  whatsapp: boolean | null;
  cidade: Municipio | null;
  /** Nulo quando a cidade do lead é desconhecida e só o DDD bate. */
  km: number | null;
  /** A âncora mais próxima dele — é a cidade que a mensagem cita. */
  ancora: Ancora;
  jaAlugou: boolean;
  temperatura: string | null;
  interesseNoEquipamento: boolean;
  contato: EstadoContato;
  pontos: number;
  /**
   * Pronta no servidor: assim a tela não importa este módulo, que puxaria a
   * tabela de municípios (200 KB) para o navegador.
   */
  mensagem: string;
};

export type Janela = {
  chave: string;
  equipId: string;
  equipNome: string;
  date: string;
  periodo: Periodo;
  ancoras: Ancora[];
  candidatos: Candidato[];
  /** Leads sem cidade, mas com o DDD de uma das âncoras. Lista à parte. */
  porDdd: Candidato[];
  /** Antes do corte em MAX_POR_JANELA: a tela diz quantos ficaram de fora. */
  totalCandidatos: number;
  totalPorDdd: number;
};

export type ResultadoJanelas = {
  janelas: Janela[];
  /** Locações futuras cuja cidade não deu para descobrir. */
  semCidade: Ancora[];
  leadsSemCidade: number;
};

function somarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** O que sobra do dia para locação, olhando os fechamentos daquele equipamento. */
function periodoLivre(blocks: Block[], equipId: string, date: string): Periodo | null {
  const periodos = new Set(
    blocks.filter((b) => b.equip_id === equipId && b.date === date).map((b) => b.period),
  );
  if (periodos.has("full") || (periodos.has("morning") && periodos.has("afternoon"))) {
    return null;
  }
  if (periodos.has("morning")) return "tarde";
  if (periodos.has("afternoon")) return "manha";
  return "dia";
}

const PESO_TEMPERATURA: Record<string, number> = {
  quente_confirmado: 4,
  quente: 3,
  morno: 2,
  frio: 0,
};

export function calcularJanelas({
  equipment,
  rentals,
  blocks,
  rows,
  hoje,
}: {
  equipment: Equipment[];
  rentals: Rental[];
  blocks: Block[];
  rows: LeadInboxRow[];
  /** yyyy-mm-dd em São Paulo. */
  hoje: string;
}): ResultadoJanelas {
  const limite = somarDias(hoje, HORIZONTE_DIAS);
  const porLeadId = new Map(rows.map((r) => [r.lead.id, r]));

  // Dias ocupados por equipamento, e dias em que cada lead já tem locação.
  const ocupado = new Set(rentals.map((r) => `${r.equip_id}|${r.date}`));
  const leadNoDia = new Set(
    rentals.filter((r) => r.wa_lead_id).map((r) => `${r.wa_lead_id}|${r.date}`),
  );

  const semCidade: Ancora[] = [];
  const porJanela = new Map<string, { equipId: string; date: string; periodo: Periodo; ancoras: Ancora[] }>();

  for (const r of rentals) {
    if (!r.equip_id || r.date < hoje || r.date > limite) continue;

    let cidade = cidadeDoEndereco(r.address, r.phone);
    let origem: Ancora["origem"] = cidade ? "endereco" : null;
    if (!cidade && r.wa_lead_id) {
      const dono = porLeadId.get(r.wa_lead_id)?.lead;
      if (dono) {
        cidade = resolverCidade(dono.city, dono.uf, dono.phone_e164);
        if (cidade) origem = "lead";
      }
    }
    const ancora: Ancora = { rentalId: r.id, date: r.date, client: r.client, cidade, origem };
    if (!cidade) {
      semCidade.push(ancora);
      continue;
    }

    for (const delta of [-1, 1]) {
      const dia = somarDias(r.date, delta);
      // Hoje não conta: não dá tempo de oferecer, combinar e levar.
      if (dia <= hoje) continue;
      if (ocupado.has(`${r.equip_id}|${dia}`)) continue;
      const periodo = periodoLivre(blocks, r.equip_id, dia);
      if (!periodo) continue;

      const chave = `${r.equip_id}|${dia}`;
      const j = porJanela.get(chave) ?? { equipId: r.equip_id, date: dia, periodo, ancoras: [] };
      j.ancoras.push(ancora);
      porJanela.set(chave, j);
    }
  }

  // A cidade de cada lead é a mesma em todas as janelas: resolve uma vez.
  const cidadeDoLead = new Map<string, Municipio | null>();
  for (const { lead } of rows) {
    cidadeDoLead.set(lead.id, resolverCidade(lead.city, lead.uf, lead.phone_e164));
  }
  let leadsSemCidade = 0;
  for (const c of cidadeDoLead.values()) if (!c) leadsSemCidade++;

  const nomeEquip = new Map(equipment.map((e) => [e.id, e.name]));

  const janelas: Janela[] = [];
  for (const [chave, j] of porJanela) {
    const candidatos: Candidato[] = [];
    const porDdd: Candidato[] = [];
    const idsAncora = new Set(
      j.ancoras.map((a) => rentals.find((r) => r.id === a.rentalId)?.wa_lead_id).filter(Boolean),
    );

    for (const row of rows) {
      const { lead, analysis } = row;
      if (lead.is_group || lead.status === "descartado") continue;
      if (analysis?.recommended_action === "descartar") continue;
      if (lead.snoozed_until && new Date(lead.snoozed_until) > new Date()) continue;
      const temperatura = temperaturaEfetiva(lead, analysis);
      if (temperatura === "frio_confirmado") continue;
      // Quem gerou a janela já está com o laser no dia vizinho.
      if (idsAncora.has(lead.id)) continue;
      if (leadNoDia.has(`${lead.id}|${j.date}`)) continue;

      const cidade = cidadeDoLead.get(lead.id) ?? null;
      let km: number | null = null;
      let ancora: Ancora | null = null;
      if (cidade) {
        for (const a of j.ancoras) {
          const d = distanciaKm(cidade, a.cidade!);
          if (d <= RAIO_KM && (km === null || d < km)) {
            km = d;
            ancora = a;
          }
        }
        if (!ancora) continue;
      } else {
        const ddd = dddDoTelefone(lead.phone_e164);
        ancora = j.ancoras.find((a) => ddd && a.cidade!.ddd === ddd) ?? null;
        if (!ancora) continue;
      }

      const jaAlugou = (row.rentals?.total ?? 0) > 0;
      const interesseNoEquipamento =
        analysis?.equip_id === j.equipId ||
        (analysis?.equipment_interest ?? []).some((e) =>
          (nomeEquip.get(j.equipId) ?? "").toLowerCase().includes(e.toLowerCase()),
        );

      // Ex-cliente primeiro (já confia, só precisa da data), depois quem está
      // quente, depois o resto. A distância só desempata: 100 km valem 1 ponto.
      const pontos =
        (jaAlugou ? 5 : 0) +
        (temperatura ? PESO_TEMPERATURA[temperatura] ?? 0 : 0) +
        (interesseNoEquipamento ? 2 : 0) +
        (estadoContato(lead).estado === "devo_responder" ? 1 : 0) -
        (km ?? RAIO_KM) / RAIO_KM;

      const c: Candidato = {
        leadId: lead.id,
        nome: leadDisplayName(lead),
        tratamento: tratamentoDoMedico(lead.sheet_name, lead.display_name),
        telefone: lead.phone_e164,
        instagram: instagramDoLead(lead),
        whatsapp: temWhatsApp(lead),
        cidade,
        km: km === null ? null : Math.round(km),
        ancora,
        jaAlugou,
        temperatura,
        interesseNoEquipamento,
        contato: estadoContato(lead),
        pontos: Math.round(pontos * 10) / 10,
        mensagem: "",
      };
      (cidade ? candidatos : porDdd).push(c);
    }

    candidatos.sort((a, b) => b.pontos - a.pontos);
    porDdd.sort((a, b) => b.pontos - a.pontos);
    const janela: Janela = {
      chave,
      equipId: j.equipId,
      equipNome: nomeEquip.get(j.equipId) ?? "Laser",
      date: j.date,
      periodo: j.periodo,
      ancoras: j.ancoras.sort((a, b) => a.date.localeCompare(b.date)),
      candidatos: candidatos.slice(0, MAX_POR_JANELA),
      porDdd: porDdd.slice(0, MAX_POR_JANELA),
      totalCandidatos: candidatos.length,
      totalPorDdd: porDdd.length,
    };
    for (const c of [...janela.candidatos, ...janela.porDdd]) c.mensagem = mensagemDaJanela(janela, c);
    janelas.push(janela);
  }

  janelas.sort((a, b) => a.date.localeCompare(b.date) || a.equipNome.localeCompare(b.equipNome));
  semCidade.sort((a, b) => a.date.localeCompare(b.date));
  return { janelas, semCidade, leadsSemCidade };
}

/** "quinta, dia 15/10" — como se fala no WhatsApp. */
function diaFalado(iso: string): string {
  const { dow } = fmtDayHeading(iso);
  const [, m, d] = iso.split("-");
  return `${dow.replace("-feira", "")}, dia ${d}/${m}`;
}

/** Sábado e domingo são masculinos: "o sábado", "no domingo". */
function masculino(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow === 0 || dow === 6;
}
const artigo = (iso: string) => (masculino(iso) ? "o" : "a");
const artigoEm = (iso: string) => (masculino(iso) ? "no" : "na");

/**
 * A mensagem da janela. Texto fixo, sem IA: não custa nada e não inventa
 * preço — fala em 15%, nunca num valor em reais, para não sair um número
 * fora da tabela.
 */
export function mensagemDaJanela(janela: Janela, c: Candidato): string {
  const saudacao = c.tratamento ? `Olá, ${c.tratamento}! Tudo bem?` : "Olá! Tudo bem?";
  const cidadeAncora = c.ancora.cidade!.nome;
  const mesmaCidade = c.cidade?.nome === cidadeAncora && c.cidade?.uf === c.ancora.cidade!.uf;
  const onde = mesmaCidade ? `aqui em ${cidadeAncora}` : `em ${cidadeAncora}`;
  const pedaco =
    janela.periodo === "manha"
      ? `a manhã de ${diaFalado(janela.date)},`
      : janela.periodo === "tarde"
        ? `a tarde de ${diaFalado(janela.date)},`
        : `${artigo(janela.date)} ${diaFalado(janela.date)},`;
  const pct = Math.round(DESCONTO_JANELA * 100);
  // Ex-cliente já sabe quem é; para os outros, a apresentação vem junto.
  const abertura = c.jaAlugou
    ? "Passando para avisar de uma data boa."
    : "Aqui é o Vinicius, da Lux Derma.";

  return [
    saudacao,
    "",
    `${abertura} O ${janela.equipNome} vai estar ${onde} ${artigoEm(c.ancora.date)} ${diaFalado(c.ancora.date)}, e ${pedaco} ficou livre na agenda.`,
    "",
    `Como o equipamento já vai estar na região, consigo fazer essa data com ${pct}% de desconto na locação.`,
    "",
    "Faz sentido para você? Se quiser, seguro a data até amanhã. 😊",
  ].join("\n");
}
