/**
 * A mensagem parece resposta automática (robô da clínica), e não uma pessoa?
 *
 * Sem IA, por regra, e conferível: só padrões de texto que aparecem nos
 * modelos de saudação, ausência, menu e encerramento do WhatsApp Business e
 * dos atendentes virtuais. Não é confirmação: um template escrito com o nome
 * da secretária ("Seja bem-vindo! Me chamo Yasmim") entra, e uma pessoa que
 * escreve como robô também. Por isso ele vira um filtro para conferir, e não
 * muda o estado do lead.
 *
 * De propósito NÃO entra o "agradecemos o contato" solto: é a fórmula de
 * quem recusa à mão ("agradecemos o seu contato mas já temos o aparelho"). Só
 * vale a forma de terceira pessoa do modelo do WhatsApp Business ("Clínica X
 * agradece seu contato") e a de ausência ("Agradecemos sua mensagem. Não
 * estamos disponíveis…").
 */

/**
 * O WhatsApp Business põe um U+200E (marca de direção, invisível) no começo
 * da saudação e da mensagem de ausência que ele mesmo dispara. Pessoa nenhuma
 * digita esse caractere.
 */
const MARCA_DO_WHATSAPP_BUSINESS = /^\s*[*_]*\u200e/;

const PADROES: RegExp[] = [
  // Modelos do WhatsApp Business: "X agradece seu contato", "Agradecemos sua
  // mensagem. Não estamos disponíveis no momento".
  /\bagradece (o |a )?(seu |sua )?(contato|mensagem)/,
  /agradecemos (a )?sua mensagem\W+nao estamos/,
  /mensagem automatica/,
  /\bseja (muito )?bem[- ]?vind[oa]/,
  /\bbem[- ]?vind[oa] ?(\(a\)|\/a)/,
  /\bbem[- ]?vind[oa] (a|ao) /,
  /\bagradecemos (o |o seu |seu )?contato com (a|o) /,
  /\bvoce entrou em contato com\b/,
  // Ausência e horário.
  /nao estamos (disponive(l|is)|em atendimento|atendendo)/,
  /\bestamos ausentes\b/,
  /\b(clinica|consultorio|empresa) (esta )?fechad[oa] (neste|no) momento/,
  /\bfora do (nosso )?horario\b/,
  /\b(nossos? )?horarios? de atendimento\b/,
  /\brecebemos sua mensagem e\b/,
  /\bnosso atendimento e (realizado|de segunda|por ordem)/,
  /\batendimento: segunda/,
  /(retornaremos|responderemos|entraremos em contato|lhe responderemos|retornamos)( o seu contato)? (assim que|o mais breve|em breve|com)/,
  /\bpor ordem (de chegada|sequencial)/,
  /\bsao respondidas por ordem/,
  /\bpara agilizar(mos)? (o |seu |o seu |nosso )?atendimento/,
  /\bnao recebemos ligac/,
  /\bdeixe sua mensagem\b/,
  // Menus de atendente virtual: "1 - Agendar consulta 2 - …", "*1* - …".
  /(^|\s)\*?1\*? ?[-–—)] ?\S.*\s\*?2\*? ?[-–—)] ?\S/,
  /\bdigite \d/,
  /\b(digite|escolha|selecione) (o numero|a opcao|uma opcao|uma das opcoes)/,
  /\bassistente virtual\b/,
  // Encerramento e pesquisa de satisfação.
  /\batendimento (sera |foi )?(encerrado|finalizado)/,
  /\bfinalizando (o |o seu |seu )?atendimento/,
  /\bpor falta de interacao\b/,
  /\bcomo nao tivemos (interacao|retorno)/,
  /\bclassifique (a conversa|o atendimento|nosso atendimento)/,
  /\bprotocolo de atendimento\b/,
  /\bpesquisa de satisfacao\b/,
  /\bacionad[ao] automaticamente\b/,
  /\b(vou|vamos) encerrar o atendimento\b/,
  /\bcontinuaremos de onde parou\b/,
  // Canal desativado: o número só devolve o aviso.
  /\bcanal (de atendimento )?esta sendo descontinuado/,
  /\bmudando (o |nosso )?canal de atendimento\b/,
  /\bnao visualizamos as mensagens\b/,
];

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function pareceRespostaAutomatica(texto: string | null | undefined): boolean {
  if (!texto) return false;
  if (MARCA_DO_WHATSAPP_BUSINESS.test(texto)) return true;
  const t = normalizar(texto);
  return PADROES.some((p) => p.test(t));
}
