import { z } from "zod";

// ---------------------------------------------------------------------
// CV estruturado. É o mesmo formato no CV base, no importador por IA e no
// CV adaptado para cada vaga, então a página de impressão serve para todos.
// ---------------------------------------------------------------------
export const ExperienciaSchema = z.object({
  cargo: z.string(),
  empresa: z.string(),
  local: z.string(),
  inicio: z.string().describe("Mês/ano, ex.: 03/2019"),
  fim: z.string().describe("Mês/ano ou 'Atual'"),
  resumo: z.string(),
  realizacoes: z.array(z.string()),
  tecnologias: z.array(z.string()),
});

export const CvSchema = z.object({
  nome: z.string(),
  titulo: z.string().describe("Título profissional no topo do CV"),
  contato: z.object({
    email: z.string(),
    telefone: z.string(),
    cidade: z.string(),
    linkedin: z.string(),
  }),
  resumo: z.string(),
  experiencias: z.array(ExperienciaSchema),
  formacao: z.array(z.object({ curso: z.string(), instituicao: z.string(), conclusao: z.string() })),
  certificacoes: z.array(z.string()),
  habilidades: z.array(z.object({ grupo: z.string(), itens: z.array(z.string()) })),
  idiomas: z.array(z.object({ idioma: z.string(), nivel: z.string() })),
});
export type Cv = z.infer<typeof CvSchema>;
export type Experiencia = z.infer<typeof ExperienciaSchema>;

export const CV_VAZIO: Cv = {
  nome: "",
  titulo: "",
  contato: { email: "", telefone: "", cidade: "", linkedin: "" },
  resumo: "",
  experiencias: [],
  formacao: [],
  certificacoes: [],
  habilidades: [],
  idiomas: [],
};

// ---------------------------------------------------------------------
// Vagas
// ---------------------------------------------------------------------
export type Fonte =
  | "gupy" | "linkedin" | "indeed" | "glassdoor" | "catho" | "email"
  | "greenhouse" | "lever" | "smartrecruiters" | "workable" | "workday" | "manual";

export type Modelo = "remoto" | "hibrido" | "presencial" | "desconhecido";

/** O que cada fonte devolve antes de entrar no banco. */
export interface VagaColetada {
  fonte: Fonte;
  idExterno: string | null;
  url: string;
  titulo: string;
  empresa: string;
  local: string;
  modelo: Modelo;
  pais: string;
  descricao: string;
  publicadaEm: string | null;
  /** Vagas de alerta por e-mail não têm descrição e já vêm filtradas pelo alerta. */
  semDescricao?: boolean;
}

export const NIVEIS = [
  "junior", "pleno", "senior", "especialista", "tech_lead", "coordenador", "gerente", "outro",
] as const;
export type Nivel = (typeof NIVEIS)[number];

export const NIVEL_LABEL: Record<Nivel, string> = {
  junior: "Júnior",
  pleno: "Pleno",
  senior: "Sênior",
  especialista: "Especialista",
  tech_lead: "Tech Lead",
  coordenador: "Coordenador",
  gerente: "Gerente",
  outro: "Outro",
};

// O SDK não envia `enum` como restrição rígida (vira uma dica na descrição), então
// nível e modelo chegam como texto livre e são normalizados em `normalizarTriagem`.
export const TriagemRespostaSchema = z.object({
  eh_mainframe: z.boolean().describe("A vaga exige de fato tecnologia de mainframe IBM (z/OS e afins)?"),
  nivel: z.string().describe(`Exatamente um de: ${NIVEIS.join(", ")}`),
  modelo: z.string().describe("Exatamente um de: remoto, hibrido, presencial, desconhecido"),
  internacional: z.boolean(),
  trabalho_do_brasil: z
    .string()
    .describe("Exatamente um de: sim, nao, incerto — alguém que mora no Brasil pode ser contratado sem se mudar?"),
  nota: z.number().int().describe("Aderência ao perfil do candidato, de 0 a 100"),
  resumo: z.string().describe("Uma ou duas frases sobre a vaga"),
  motivos: z.array(z.string()).describe("Pontos que explicam a nota, a favor e contra"),
  tecnologias: z.array(z.string()),
  salario: z.string().nullable().describe("Faixa salarial se a vaga informar, senão null"),
});
export type TrabalhoDoBrasil = "sim" | "nao" | "incerto";

export type Triagem = Omit<z.infer<typeof TriagemRespostaSchema>, "nivel" | "modelo" | "trabalho_do_brasil"> & {
  nivel: Nivel;
  modelo: Modelo;
  /** Ausente nas triagens anteriores a este campo. */
  trabalho_do_brasil?: TrabalhoDoBrasil;
};

function slug(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[\s-]+/g, "_");
}

export function normalizarTriagem(r: z.infer<typeof TriagemRespostaSchema>): Triagem {
  const n = slug(r.nivel);
  const nivel: Nivel =
    (NIVEIS as readonly string[]).includes(n) ? (n as Nivel)
    : /lead|lider/.test(n) ? "tech_lead"
    : /coord/.test(n) ? "coordenador"
    : /gerente|manager|head/.test(n) ? "gerente"
    : /especialista|specialist|staff|principal/.test(n) ? "especialista"
    : /senior|sr/.test(n) ? "senior"
    : /pleno|mid/.test(n) ? "pleno"
    : /junior|jr/.test(n) ? "junior"
    : "outro";
  const m = slug(r.modelo);
  const modelo: Modelo = /remot/.test(m) ? "remoto" : /hibrid|hybrid/.test(m) ? "hibrido" : /presencial|onsite|on_site/.test(m) ? "presencial" : "desconhecido";
  const b = slug(r.trabalho_do_brasil);
  const trabalho_do_brasil: TrabalhoDoBrasil = /^s/.test(b) ? "sim" : /^n/.test(b) ? "nao" : "incerto";
  return { ...r, nivel, modelo, trabalho_do_brasil, nota: Math.max(0, Math.min(100, Math.round(r.nota))) };
}

export const FONTE_LABEL: Record<Fonte, string> = {
  gupy: "Gupy",
  linkedin: "LinkedIn",
  indeed: "Indeed",
  glassdoor: "Glassdoor",
  catho: "Catho",
  email: "E-mail",
  greenhouse: "Greenhouse",
  lever: "Lever",
  smartrecruiters: "SmartRecruiters",
  workable: "Workable",
  workday: "Workday",
  manual: "Manual",
};

// ---------------------------------------------------------------------
// Candidaturas
// ---------------------------------------------------------------------
export const STATUS = ["interessado", "aplicado", "entrevista", "proposta", "encerrado"] as const;
export type Status = (typeof STATUS)[number];

export const STATUS_LABEL: Record<Status, string> = {
  interessado: "Interessado",
  aplicado: "Aplicado",
  entrevista: "Entrevista",
  proposta: "Proposta",
  encerrado: "Encerrado",
};

export const RESULTADOS = ["contratado", "reprovado", "desisti", "sem_retorno"] as const;
export type Resultado = (typeof RESULTADOS)[number];
export const RESULTADO_LABEL: Record<Resultado, string> = {
  contratado: "Contratado 🎉",
  reprovado: "Reprovado",
  desisti: "Desisti",
  sem_retorno: "Sem retorno",
};

// ---------------------------------------------------------------------
// Empresas-alvo (páginas de carreira com API pública)
// ---------------------------------------------------------------------
export const ATS = ["greenhouse", "lever", "smartrecruiters", "workable", "workday"] as const;
export type Ats = (typeof ATS)[number];

export const EmpresaAlvoSchema = z.object({
  nome: z.string().min(1),
  ats: z.enum(ATS),
  slug: z.string().min(1),
});
export type EmpresaAlvo = z.infer<typeof EmpresaAlvoSchema>;

export type ActionResult = { ok: boolean; error?: string };
