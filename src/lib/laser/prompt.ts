import { baseParaPrompt } from "./base-conhecimento";
import { LESOES_FOCAIS } from "./protocolo-premium";
import {
  ASSOCIACAO_LABEL,
  CARACTERISTICA_PELE_LABEL,
  DOWNTIME_LABEL,
  EXPOSICAO_SOLAR_LABEL,
  EXTENSAO_LABEL,
  FOTOTIPO_LABEL,
  HISTORICO_LABEL,
  IDADE_CICATRIZ_LABEL,
  INDICACAO_LABEL,
  REGIAO_LABEL,
  RESULTADO_ANTERIOR_LABEL,
  TIPO_MELASMA_LABEL,
  ESCALAS,
  normalizarEntrada,
  opcaoGrau,
  type EntradaConsulta,
} from "./tipos";

/**
 * Mudar as instruções abaixo invalida as consultas gravadas de propósito:
 * PROMPT_VERSAO entra no hash, junto com KB_VERSAO.
 */
export const PROMPT_VERSAO = 8;

const INSTRUCOES = `Você ajuda um médico a escolher os parâmetros do laser de CO2 fracionado SmartXide Punto (DEKA), com scanner HiScan DOT, para um caso concreto.

Quem lê a sua resposta é o médico que vai disparar o laser. Ele decide; você explica o raciocínio para ele poder concordar ou discordar.

# Como decidir

1. Use SOMENTE a base de conhecimento abaixo. Se ela não cobre algo, diga isso em "motivo_confianca" em vez de inventar.
1b. Ordem de peso das fontes: protocolo de treinamento Premium (trechos "premium-*") > fabricante > estudo publicado > consenso clínico > regra conservadora. Quando houver tabela do protocolo para a indicação, PARTA DA LINHA do grupo de fototipo do paciente, no pulso escolhido, e ajuste a partir dela pelos outros fatores do caso. Diga no "motivo" qual tabela e linha usou e o que ajustou. Se o protocolo e outra fonte divergirem, siga o protocolo e cite a divergência.
2. Primeiro decida se o CO2 fracionado é o tratamento certo para o caso. Se não for (por exemplo, melasma como queixa principal), a viabilidade é "nao_recomendado", "parametros" é null e "alternativas" diz o que fazer.
3. Parta da indicação, do grau na escala dela (ver o trecho "fator-gravidade") e dos detalhes dela (tipo de melasma e se é refratário, idade da cicatriz). Depois ajuste pela região e pela extensão, pelo fototipo, pelas características da pele, pelo histórico, pela idade, pela exposição solar prevista, pelos procedimentos combinados e pelo downtime aceito. A segurança (região, fototipo, pele, histórico, sol) vence a vontade de mais resultado e o grau da queixa.
4. Primeira sessão: fique na ponta conservadora. Sessão subsequente: siga o trecho "fator-sessao-anterior". Se houve mancha (HPI) na anterior, nenhum parâmetro pode ser mais agressivo que o anterior.
5. Todo valor tem de estar dentro das faixas do aparelho (trecho "equip-limites"). No pulso HP o time não se ajusta: em "dwell_time_us" use 0 em valor, faixa_min e faixa_max. Nos pulsos SP e DP o time é obrigatório e nunca 0.
5b. Indicação "lesão isolada com peça focada": use a tabela "premium-focada" para a lesão informada; preencha "parametros_focada" (modo, potência, frequência; 0 Hz no CW) e deixe "parametros" null. Nas demais indicações, "parametros_focada" é null.
6. Em cada "motivo", ligue o valor ao caso: diga qual fator do caso empurrou o número para cima ou para baixo. Evite frases genéricas.
7. Quando um valor vier de um estudo publicado, cite o estudo no motivo. Quando vier de "regra_conservadora", diga que é ponto de partida conservador, sem estudo específico do aparelho.
8. Em "fontes", liste os ids dos trechos que você realmente usou, copiados exatamente do atributo id de cada <trecho>.
9. Confiança: "alta" quando há linha do protocolo Premium para esta indicação e fototipo (ou estudo com o SmartXide DOT); "media" quando você extrapolou do protocolo (fototipo sem linha, região sem tabela) ou usou consenso clínico; "baixa" quando é extrapolação larga ou o caso tem fatores de risco somados.
10. Em "perguntas_pendentes", liste só o que mudaria a recomendação e não foi informado, dizendo o que mudaria (ex.: "Melasma já foi tratado com tópico por 3 meses? Se não, o CO2 não é indicado agora."). Não pergunte o que o formulário já respondeu.
11. Escreva em português do Brasil, frases curtas, termos que um dermatologista usa.

# Quando houver fotos do paciente

12. As fotos complementam o formulário; não o substituem. Descreva em "analise_foto" só o que se vê: tipo e distribuição de cicatrizes, rugas, manchas, eritema, acne inflamatória, poros, por área. Não diagnostique; lesão que pareça suspeita vira um alerta para exame, não um diagnóstico.
13. Não estime o fototipo pela foto: luz e câmera mudam o tom da pele. O fototipo é o do formulário.
14. Profundidade de cicatriz em foto de frente é pouco confiável; só a leia com luz oblíqua visível na foto, e diga isso em "limitacoes".
15. Quando a foto mostra algo que o formulário não diz (grau diferente, acne ativa não marcada, sinais de rosácea ou pele sensível, outra área), registre em "divergencias", com o item do formulário em "achado", e faça a pergunta em "perguntas_pendentes". O que fazer com os parâmetros depende do achado:
    - Achado de RISCO ("acne_ativa", "sensivel_rosacea"): aplique já o ajuste conservador, como se fosse verdade, e marque "ajuste_aplicado": true. Errar para o lado agressivo aqui custa mancha, infecção ou cicatriz.
    - Qualquer outro achado (inclusive "grau"): siga o formulário, marque "ajuste_aplicado": false, e diga no texto o que mudaria se o médico confirmar. Em "grau", ponha o grau que a foto sugere em "grau_sugerido".
    - No "texto", diga em uma frase o que a foto mostra e o que você fez. Não escreva "deixei como pergunta": o médico confirma ou descarta pelos botões ao lado.
15b. Achados que o médico já examinou: os confirmados são fatos do caso; os descartados não existem para esta recomendação. Não ajuste parâmetros por um achado descartado nem o repita em "divergencias".
16. A foto pode tornar a recomendação mais conservadora ou mais específica (por exemplo, parâmetros diferentes por área, forma do scan pelo contorno), nunca mais agressiva do que o formulário e a base permitem.
17. Sem fotos no caso, "analise_foto" é null.

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

function linhaGrau(e: EntradaConsulta): string | null {
  const escala = ESCALAS[e.indicacao];
  if (!escala) return null;
  const opcao = opcaoGrau(e.indicacao, e.grau);
  return opcao
    ? `Grau (${escala.nome}): ${opcao.rotulo} — ${opcao.descricao}`
    : `Grau (${escala.nome}): não informado`;
}

/** O caso, como o modelo lê. Vai na mensagem do usuário, depois do cache. */
export function descreverCaso(entrada: EntradaConsulta): string {
  const e = normalizarEntrada(entrada);
  const lista = (itens: string[], vazio: string) =>
    itens.length > 0 ? itens.map((i) => `- ${i}`).join("\n") : `- ${vazio}`;

  const indicacao = [
    `Indicação: ${INDICACAO_LABEL[e.indicacao]}`,
    e.melasmaTipo ? `Tipo de melasma: ${TIPO_MELASMA_LABEL[e.melasmaTipo]}` : null,
    e.melasmaRefratario != null
      ? `Melasma refratário (≥ 3 meses de tópico adequado sem resposta): ${e.melasmaRefratario ? "sim" : "não"}`
      : null,
    e.idadeCicatriz ? `Idade da cicatriz: ${IDADE_CICATRIZ_LABEL[e.idadeCicatriz]}` : null,
    e.indicacao === "lesao_focal"
      ? `Lesão (peça focada): ${LESOES_FOCAIS.find((l) => l.id === e.lesaoFocal)?.nome ?? "não informada"}`
      : null,
    linhaGrau(e),
    `Região: ${REGIAO_LABEL[e.regiao]}`,
    `Extensão: ${EXTENSAO_LABEL[e.extensao]}`,
  ];

  const paciente = [
    `Fototipo de Fitzpatrick: ${FOTOTIPO_LABEL[e.fototipo]}`,
    e.idade != null ? `Idade: ${e.idade} anos` : "Idade: não informada",
  ];

  let sessao: string;
  if (e.sessao === "primeira" || !e.sessaoAnterior) {
    sessao = "Sessão: primeira sessão com este laser nesta área";
  } else {
    const a = e.sessaoAnterior;
    const valor = (v: number | null, u: string) => (v != null ? `${v} ${u}` : "não registrado");
    sessao = [
      "Sessão: subsequente. Sessão anterior:",
      `- Potência: ${valor(a.potencia, "W")}`,
      `- Dwell time: ${valor(a.dwell, "µs")}`,
      `- Spacing: ${valor(a.spacing, "µm")}`,
      `- SmartStack: ${a.stack ?? "não registrado"}`,
      `- Dias de eritema: ${a.diasEritema ?? "não registrado"}`,
      `- Teve hiperpigmentação pós-inflamatória: ${a.teveHpi ? "SIM" : "não"}`,
      `- Resultado: ${a.resultado ? RESULTADO_ANTERIOR_LABEL[a.resultado] : "não informado"}`,
      e.respostaAnterior ? `- Relato do médico: ${e.respostaAnterior}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const contexto = [
    `Exposição solar prevista nas próximas semanas: ${EXPOSICAO_SOLAR_LABEL[e.exposicaoSolar]}`,
    `Downtime aceito: ${DOWNTIME_LABEL[e.downtime]}`,
  ];

  const achadosMedico = [
    e.achadosConfirmados.length > 0
      ? `Achados da foto CONFIRMADOS pelo médico:\n${lista(e.achadosConfirmados, "")}`
      : null,
    e.achadosDescartados.length > 0
      ? `Achados da foto que o médico EXAMINOU E DESCARTOU (não ajuste por eles):\n${lista(e.achadosDescartados, "")}`
      : null,
  ].filter(Boolean);
  const blocoAchados = achadosMedico.length > 0 ? `\n\n${achadosMedico.join("\n\n")}` : "";

  const observacoes = e.observacoes
    ? `\n\n<observacoes_do_medico>\n${e.observacoes}\n</observacoes_do_medico>`
    : "";

  return `<caso>
${indicacao.filter(Boolean).join("\n")}

${paciente.join("\n")}

Características da pele:
${lista(e.caracteristicasPele.map((c) => CARACTERISTICA_PELE_LABEL[c]), "Nada relevante informado.")}

Histórico e fatores de risco:
${lista(e.historico.map((h) => HISTORICO_LABEL[h]), "Nada relevante informado.")}

${sessao}

Procedimentos combinados na mesma sessão:
${lista(e.associacoes.map((a) => ASSOCIACAO_LABEL[a]), "Nenhum.")}

${contexto.join("\n")}${blocoAchados}
</caso>${observacoes}

Recomende os parâmetros para este caso.`;
}
