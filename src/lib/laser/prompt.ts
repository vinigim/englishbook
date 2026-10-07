import { baseParaPrompt } from "./base-conhecimento";
import {
  DOWNTIME_LABEL,
  FOTOTIPO_LABEL,
  HISTORICO_LABEL,
  INDICACAO_LABEL,
  REGIAO_LABEL,
  type EntradaConsulta,
} from "./tipos";

/**
 * Mudar as instruções abaixo invalida as consultas gravadas de propósito:
 * PROMPT_VERSAO entra no hash, junto com KB_VERSAO.
 */
export const PROMPT_VERSAO = 1;

const INSTRUCOES = `Você ajuda um médico a escolher os parâmetros do laser de CO2 fracionado SmartXide Punto (DEKA), com scanner HiScan DOT, para um caso concreto.

Quem lê a sua resposta é o médico que vai disparar o laser. Ele decide; você explica o raciocínio para ele poder concordar ou discordar.

# Como decidir

1. Use SOMENTE a base de conhecimento abaixo. Se ela não cobre algo, diga isso em "motivo_confianca" em vez de inventar.
2. Primeiro decida se o CO2 fracionado é o tratamento certo para o caso. Se não for (por exemplo, melasma como queixa principal), a viabilidade é "nao_recomendado", "parametros" é null e "alternativas" diz o que fazer.
3. Parta da indicação. Depois ajuste pela região, pelo fototipo, pelo histórico e pelo downtime aceito, nessa ordem de peso: a segurança da região e do fototipo vence a vontade de mais resultado.
4. Primeira sessão: fique na ponta conservadora. Sessão subsequente: use a resposta anterior para decidir se sobe um parâmetro em 10–20%, mantém ou recua.
5. Todo valor tem de estar dentro das faixas do aparelho (trecho "equip-limites").
6. Em cada "motivo", ligue o valor ao caso: diga qual fator do caso empurrou o número para cima ou para baixo. Evite frases genéricas.
7. Quando um valor vier de um estudo publicado, cite o estudo no motivo. Quando vier de "regra_conservadora", diga que é ponto de partida conservador, sem estudo específico do aparelho.
8. Em "fontes", liste os ids dos trechos que você realmente usou.
9. Confiança: "alta" quando há estudo com o SmartXide DOT para esta indicação e região; "media" quando é consenso clínico aplicado ao aparelho; "baixa" quando é extrapolação ou o caso tem fatores de risco somados.
10. Escreva em português do Brasil, frases curtas, termos que um dermatologista usa.

# Base de conhecimento

`;

/**
 * O bloco estável do prompt: instruções + base inteira.
 *
 * Idêntico em toda consulta, então vai com `cache_control`. Nada que varie
 * entre consultas (data, nome, a própria entrada) pode entrar aqui.
 */
export function buildSystemPrompt(): string {
  return `${INSTRUCOES}${baseParaPrompt()}`;
}

/** O caso, como o modelo lê. Vai na mensagem do usuário, depois do cache. */
export function descreverCaso(e: EntradaConsulta): string {
  const historico =
    e.historico.length > 0
      ? e.historico.map((h) => `- ${HISTORICO_LABEL[h]}`).join("\n")
      : "- Nada relevante informado.";

  const linhas = [
    `Indicação: ${INDICACAO_LABEL[e.indicacao]}`,
    `Região: ${REGIAO_LABEL[e.regiao]}`,
    `Fototipo de Fitzpatrick: ${FOTOTIPO_LABEL[e.fototipo]}`,
    `Gravidade: ${e.gravidade}`,
    `Downtime aceito: ${DOWNTIME_LABEL[e.downtime]}`,
    e.idade != null ? `Idade: ${e.idade} anos` : null,
    e.sessao === "primeira"
      ? "Sessão: primeira sessão com este laser nesta área"
      : `Sessão: subsequente. Resposta à sessão anterior: ${e.respostaAnterior || "não informada"}`,
  ].filter(Boolean);

  const observacoes = e.observacoes
    ? `\n\n<observacoes_do_medico>\n${e.observacoes}\n</observacoes_do_medico>`
    : "";

  return `<caso>
${linhas.join("\n")}

Histórico e fatores de risco:
${historico}
</caso>${observacoes}

Recomende os parâmetros para este caso.`;
}
