/**
 * Apresentação de primeiro contato, copiada pelo botão "Abrir no Instagram"
 * quando o lead ainda não tem mensagem da IA (com mensagem, o botão copia ela).
 *
 * Texto fixo, escrito e aprovado pelo dono — não passa pela IA.
 */
const CORPO = `Sou Vinicius, da Lux Derma, empresa de Penápolis-SP.
Estamos oferecendo para locação o Laser de CO2 Fracionado da DEKA (Itália — última geração), indicado para rejuvenescimento, cicatrizes, resurfacing e como complemento à cirurgia plástica, inclusive blefaroplastia.
A locação é por hora, turno ou procedimento, sem precisar investir na compra do equipamento: levamos até a clínica e acompanhamos todo o uso.
Faz sentido para a rotina de vocês? Posso passar os detalhes e as condições. 😊`;

/**
 * "Dr. Fulano" / "Dra. Fulana" a partir do nome cadastrado — sem IA, por regra.
 *
 * Só vale nome que COMEÇA com Dr/Dra/Doutor/Doutora: é o único sinal seguro de
 * que ali há uma pessoa. "Clínica Bella Pele" ou o apelido do WhatsApp
 * virariam "Olá, Clínica!", pior do que não chamar pelo nome. Sem o prefixo, a
 * saudação fica só "Olá!".
 *
 * A planilha vem antes do nome do WhatsApp porque é o dono quem escreve.
 */
const MEDICO = /^\s*(dra|dr|doutora|doutor)\b(?:\.\s*|\s+)([\p{L}][\p{L}'-]*)/iu;

export function tratamentoDoMedico(
  ...nomes: (string | null | undefined)[]
): string | null {
  for (const nome of nomes) {
    const m = nome?.match(MEDICO);
    if (!m) continue;
    const titulo = /^(dra|doutora)$/i.test(m[1]) ? "Dra." : "Dr.";
    const primeiro = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
    return `${titulo} ${primeiro}`;
  }
  return null;
}

export function apresentacaoInstagram(tratamento: string | null): string {
  return `${tratamento ? `Olá, ${tratamento}!` : "Olá!"} ${CORPO}`;
}
