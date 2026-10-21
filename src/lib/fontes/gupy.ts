import { z } from "zod";
import { htmlParaTexto, inferirModelo } from "../filtro";
import type { Modelo, VagaColetada } from "../tipos";

// Portal público de vagas da Gupy (o mesmo que alimenta portal.gupy.io).
// Não exige chave e não tem documentação: a busca olha só o título da vaga.
// Em out/2026 a Gupy desligou portal.api.gupy.io e employability-portal.gupy.io
// (404 em tudo); o portal passou a buscar no próprio domínio, com os mesmos
// parâmetros e a mesma resposta `{ data, pagination }`.
const BASE = "https://portal.gupy.io/api/job-search/jobs";
const POR_PAGINA = 100;
const MAX_PAGINAS = 3;

// Campos conhecidos; tudo opcional para não quebrar se a Gupy mudar algo.
const VagaGupy = z.looseObject({
  id: z.union([z.number(), z.string()]),
  name: z.string(),
  description: z.string().nullish(),
  careerPageName: z.string().nullish(),
  jobUrl: z.string().nullish(),
  publishedDate: z.string().nullish(),
  isRemoteWork: z.boolean().nullish(),
  workplaceType: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  country: z.string().nullish(),
});
const Resposta = z.looseObject({
  data: z.array(z.unknown()),
  pagination: z.looseObject({ total: z.number().nullish() }).nullish(),
});

function modelo(v: z.infer<typeof VagaGupy>): Modelo {
  const w = (v.workplaceType ?? "").toLowerCase();
  if (v.isRemoteWork || w === "remote") return "remoto";
  if (w === "hybrid") return "hibrido";
  if (w === "on-site" || w === "onsite") return "presencial";
  return inferirModelo(v.description ?? "");
}

async function pagina(termo: string, offset: number): Promise<z.infer<typeof Resposta>> {
  const url = `${BASE}?jobName=${encodeURIComponent(termo)}&limit=${POR_PAGINA}&offset=${offset}`;
  const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) {
    console.error(`[gupy] ${res.status} ${url}`);
    throw new Error(`gupy_http_${res.status}`);
  }
  return Resposta.parse(await res.json());
}

async function buscarTermo(termo: string): Promise<VagaColetada[]> {
  const vagas: VagaColetada[] = [];
  for (let n = 0; n < MAX_PAGINAS; n++) {
    const corpo = await pagina(termo, n * POR_PAGINA);

    for (const bruto of corpo.data) {
      const p = VagaGupy.safeParse(bruto);
      if (!p.success) continue;
      const v = p.data;
      const local = [v.city, v.state].filter(Boolean).join(" - ");
      vagas.push({
        fonte: "gupy",
        idExterno: String(v.id),
        url: v.jobUrl ?? `https://portal.gupy.io/job/${v.id}`,
        titulo: v.name.trim(),
        empresa: (v.careerPageName ?? "").trim(),
        local,
        modelo: modelo(v),
        pais: v.country && !/^(brasil|brazil|br)$/i.test(v.country) ? v.country : "BR",
        descricao: htmlParaTexto(v.description ?? ""),
        publicadaEm: v.publishedDate ?? null,
      });
    }
    if (corpo.data.length < POR_PAGINA) break;
  }
  return vagas;
}

/**
 * Busca cada termo e junta os resultados (sem repetir o mesmo id). Um termo com
 * erro não derruba os outros; a fonte só falha se nenhum termo funcionar.
 */
export async function coletarGupy(termos: string[]): Promise<VagaColetada[]> {
  const porId = new Map<string, VagaColetada>();
  const erros: string[] = [];
  for (const termo of termos) {
    try {
      for (const v of await buscarTermo(termo)) porId.set(v.idExterno!, v);
    } catch (e) {
      erros.push(`${termo}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (erros.length) console.error(`[gupy] ${erros.length}/${termos.length} termo(s) falharam`, erros);
  if (termos.length > 0 && erros.length === termos.length) {
    throw new Error(`${erros[0].slice(erros[0].indexOf(": ") + 2)} em todos os termos`);
  }
  return [...porId.values()];
}
