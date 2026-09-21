/**
 * Vocabulário do Radar de Leads.
 *
 * Estes arrays são a fonte única da verdade. Eles alimentam, ao mesmo tempo:
 *   1. os tipos do TypeScript;
 *   2. os `check` das colunas em supabase/migrations/0010_whatsapp_leads.sql;
 *   3. a lista fechada que vai no prompt da IA;
 *   4. os filtros e rótulos da interface.
 *
 * Se alguém acrescentar um valor aqui e esquecer do `check` no Postgres, o
 * insert falha de forma barulhenta — que é exatamente o que queremos.
 */

// ============================================================================
//  Ação recomendada — o que o dono deve fazer com este lead agora
// ============================================================================
export const RECOMMENDED_ACTIONS = [
  "primeiro_contato",
  "qualificacao",
  "resposta_preco",
  "envio_proposta",
  "objecao_preco",
  "objecao_confianca",
  "objecao_timing",
  "oferta_disponibilidade",
  "confirmacao_agendamento",
  "preparo_pre_locacao",
  "pos_locacao_feedback",
  "reativacao_inativo",
  "upsell_equipamento",
  "oferta_recorrencia",
  "pedido_indicacao",
  "aguardar",
  "descartar",
] as const;

export type RecommendedAction = (typeof RECOMMENDED_ACTIONS)[number];

export const ACTION_LABEL: Record<RecommendedAction, string> = {
  primeiro_contato: "Primeiro contato",
  qualificacao: "Qualificar (faltam dados)",
  resposta_preco: "Responder preço",
  envio_proposta: "Enviar proposta",
  objecao_preco: "Contornar objeção de preço",
  objecao_confianca: "Contornar objeção de confiança",
  objecao_timing: "Contornar objeção de momento",
  oferta_disponibilidade: "Oferecer datas disponíveis",
  confirmacao_agendamento: "Confirmar agendamento",
  preparo_pre_locacao: "Alinhar logística pré-locação",
  pos_locacao_feedback: "Follow-up pós-locação",
  reativacao_inativo: "Reativar cliente inativo",
  upsell_equipamento: "Oferecer outro equipamento",
  oferta_recorrencia: "Oferecer recorrência mensal",
  pedido_indicacao: "Pedir indicação",
  aguardar: "Aguardar resposta",
  descartar: "Descartar",
};

/**
 * Critério de escolha de cada ação, usado dentro do prompt da IA.
 *
 * "aguardar" e "descartar" existem de propósito: sem elas o modelo inventa uma
 * mensagem para todo mundo, inclusive para quem acabou de responder "ok,
 * obrigado" — e o painel vira uma máquina de spam.
 */
export const ACTION_CRITERIA: Record<RecommendedAction, string> = {
  primeiro_contato: "Nunca houve conversa comercial de verdade com este contato.",
  qualificacao:
    "Faltam dados básicos: especialidade, cidade, volume de pacientes ou qual procedimento pretende fazer.",
  resposta_preco: "Ele perguntou valor e ainda não recebeu resposta.",
  envio_proposta: "Já está qualificado e é hora de mandar o orçamento fechado.",
  objecao_preco: "Disse que está caro, pediu desconto ou comparou com concorrente.",
  objecao_confianca:
    "Questionou procedência do equipamento, registro na ANVISA, suporte, seguro ou a seriedade da empresa.",
  objecao_timing: "Disse que agora não dá, que vê mês que vem, que está sem agenda.",
  oferta_disponibilidade:
    "Está interessado e o que falta é encaixar uma data — vale oferecer dias livres.",
  confirmacao_agendamento:
    "Já combinaram, mas falta fechar data, horário ou endereço de forma explícita.",
  preparo_pre_locacao:
    "A locação está marcada e falta alinhar logística: endereço, energia, ponteiras, quem recebe a equipe.",
  pos_locacao_feedback: "A locação aconteceu há poucos dias e cabe pedir retorno.",
  reativacao_inativo: "Já alugou antes, mas está sem contato há bastante tempo.",
  upsell_equipamento:
    "É cliente de um equipamento e outro do catálogo faz sentido para a indicação dele.",
  oferta_recorrencia:
    "Aluga com frequência e se beneficiaria de um pacote mensal ou dia fixo na agenda.",
  pedido_indicacao: "Cliente satisfeito que pode indicar colegas.",
  aguardar:
    "A bola está com o lead: ele já foi respondido e ainda não retornou, ou a conversa encerrou naturalmente. Não mandar nada agora.",
  descartar:
    "Fora do perfil: revendedor, spam, grupo, engano, ou pediu para não receber mensagens.",
};

// ============================================================================
//  Estágio no funil
// ============================================================================
export const FUNNEL_STAGES = [
  "novo",
  "qualificando",
  "proposta_enviada",
  "negociacao",
  "agendado",
  "cliente_ativo",
  "cliente_inativo",
  "perdido",
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const STAGE_LABEL: Record<FunnelStage, string> = {
  novo: "Novo",
  qualificando: "Qualificando",
  proposta_enviada: "Proposta enviada",
  negociacao: "Em negociação",
  agendado: "Agendado",
  cliente_ativo: "Cliente ativo",
  cliente_inativo: "Cliente inativo",
  perdido: "Perdido",
};

// ============================================================================
//  Temperatura
// ============================================================================
export const TEMPERATURES = ["quente", "morno", "frio"] as const;
export type Temperature = (typeof TEMPERATURES)[number];

export const TEMPERATURE_LABEL: Record<Temperature, string> = {
  quente: "Quente",
  morno: "Morno",
  frio: "Frio",
};

// ============================================================================
//  Objeções
// ============================================================================
export const OBJECTIONS = [
  "preco",
  "prazo",
  "confianca",
  "concorrente",
  "volume_pacientes",
  "logistica",
  "tecnica",
  "sem_objecao",
] as const;

export type Objection = (typeof OBJECTIONS)[number];

export const OBJECTION_LABEL: Record<Objection, string> = {
  preco: "Preço",
  prazo: "Prazo",
  confianca: "Confiança",
  concorrente: "Concorrente",
  volume_pacientes: "Volume de pacientes",
  logistica: "Logística",
  tecnica: "Dúvida técnica",
  sem_objecao: "Sem objeção",
};

// ============================================================================
//  Status do lead (definido por nós, não pela IA)
// ============================================================================
export const LEAD_STATUSES = [
  "novo",
  "em_conversa",
  "cliente",
  "inativo",
  "descartado",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  novo: "Novo",
  em_conversa: "Em conversa",
  cliente: "Cliente",
  inativo: "Inativo",
  descartado: "Descartado",
};
