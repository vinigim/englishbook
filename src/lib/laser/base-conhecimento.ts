import {
  PROTOCOLO_FONTE,
  PROTOCOLO_PREMIUM,
  textoLesoesFocais,
  textoSecao,
} from "./protocolo-premium";

/**
 * Base de conhecimento do SmartXide Punto (DEKA) com scanner HiScan DOT.
 *
 * Por que não é um RAG com busca vetorial
 * ---------------------------------------
 * A base inteira, com as instruções, tem por volta de 9 mil tokens. Isso cabe com folga no
 * prompt, então o modelo lê TODOS os trechos em toda consulta: nenhuma
 * contraindicação fica de fora porque a busca não a achou. O bloco vai com
 * `cache_control`, então a partir da segunda consulta na mesma hora ele custa
 * cerca de 10% do preço cheio.
 *
 * Busca vetorial passa a valer quando a base crescer além de ~100 mil tokens
 * (por exemplo, o manual completo do aparelho em PDF). Até lá, ela só
 * acrescentaria um jeito de errar.
 *
 * Como editar
 * -----------
 * - Cada trecho tem `id` estável: o modelo cita os ids em `fontes`, e as
 *   consultas gravadas guardam esses ids. Não renomeie um id existente.
 * - `origem` diz ao modelo (e à tela) quanto peso o trecho tem.
 * - Mudou qualquer texto? Suba `KB_VERSAO`. Ela entra no hash das consultas,
 *   então as respostas antigas deixam de ser reaproveitadas.
 * - A ordem do array é a ordem no prompt. Mantenha-a fixa: mudar a ordem
 *   quebra o cache do prompt.
 *
 * De onde vieram os números
 * -------------------------
 * A fonte de maior peso é o protocolo do treinamento da Premium (autorizada
 * DEKA), transcrito em ./protocolo-premium.ts e gerado aqui como trechos
 * "premium-*". O resto veio de folhetos da DEKA, fichas técnicas de distribuidores e estudos publicados
 * com o SmartXide DOT, encontrados por busca em out/2026. As páginas não
 * puderam ser abertas na íntegra no ambiente em que esta base foi escrita:
 * os valores vêm dos resumos da busca. Confira cada um no manual do aparelho
 * antes de tratá-lo como definitivo.
 */

export const KB_VERSAO = 4;

export const ORIGENS = [
  "protocolo_treinamento",
  "fabricante",
  "estudo",
  "consenso",
  "regra_conservadora",
] as const;
export type Origem = (typeof ORIGENS)[number];

export const ORIGEM_LABEL: Record<Origem, string> = {
  protocolo_treinamento: "Protocolo de treinamento (Premium/DEKA)",
  fabricante: "Fabricante",
  estudo: "Estudo publicado",
  consenso: "Consenso clínico",
  regra_conservadora: "Regra conservadora",
};

export type TrechoBase = {
  id: string;
  titulo: string;
  origem: Origem;
  /** `url` ausente quando a fonte é um documento entregue em mãos. */
  fonte?: { label: string; url?: string };
  texto: string;
};

export const BASE_CONHECIMENTO: readonly TrechoBase[] = [
  // ==========================================================================
  //  O aparelho
  // ==========================================================================
  {
    id: "equip-visao-geral",
    titulo: "SmartXide Punto com HiScan DOT — visão geral",
    origem: "fabricante",
    fonte: {
      label: "Remma — ficha do SmartXide Punto",
      url: "https://remma.fr/en/model/co2-laser-smartxide-punto",
    },
    texto: `Laser de CO2 de 10.600 nm. O alvo é a água do tecido: o feixe vaporiza (abla) e aquece (coagula).
O Punto chega a 50 W de potência ajustável e tem os modos de emissão SP (SmartPulse), DP (DEKAPulse), HP (HighPulse) e CW (contínuo).
Com o scanner HiScan DOT, o feixe é entregue em microcolunas ("DOTs"), deixando pele íntegra entre elas: é o resurfacing fracionado.
Sem scanner, com peça de mão focada, o Punto corta e vaporiza lesões (uso cirúrgico, fora do escopo destas recomendações).`,
  },
  {
    id: "equip-limites",
    titulo: "Faixas ajustáveis do sistema DOT",
    origem: "fabricante",
    fonte: {
      label: "Ficha técnica do SmartXide DOT",
      url: "https://alibenalimedical.com/product/fractional-co2-laser-smartxide-dot/",
    },
    texto: `Faixas descritas para o sistema SmartXide DOT (confirmar no manual da versão do aparelho):
- Dwell time (tempo por DOT): 200 a 2.000 µs (0,2 a 2 ms). No HP o time não se ajusta.
- Spacing / DOT pitch (distância entre DOTs): 200 a 1.000 µm.
- SmartStack: 1 a 5 pulsos sobre o mesmo DOT.
- Potência: até 50 W no Punto; nas tabelas de pele do protocolo Premium o máximo é 25 W (manchas, SP, fototipo 1–2).
Nunca recomende valores fora dessas faixas.`,
  },
  {
    id: "equip-dot-350",
    titulo: "Tamanho do DOT",
    origem: "fabricante",
    fonte: {
      label: "Skin Inc. — SmartXide DOT",
      url: "https://www.skininc.com/products/equipment-tools/product/21892627/eclipsemed-ltd-smartxide-dot-system",
    },
    texto: `O diâmetro do DOT aparece de formas diferentes nas fontes: uma ficha de distribuidor fala em cerca de 350 µm; a ilustração do treinamento Premium indica cerca de 120 µm de ablação.
O protocolo Premium usa spacing de 200–300 µm em manchas, cicatrizes de acne e hipertróficas, o que só é fracionado se o DOT for bem menor que 350 µm. Siga o protocolo: spacing baixo é legítimo quando a tabela da indicação o usa, sempre com o time curto que vem junto.`,
  },

  // ==========================================================================
  //  Protocolo de treinamento Premium (autorizada DEKA) — a fonte principal
  // ==========================================================================
  {
    id: "premium-pulsos",
    titulo: "Protocolo Premium — os três pulsos e os cinco parâmetros",
    origem: "protocolo_treinamento",
    fonte: { label: PROTOCOLO_FONTE.label },
    texto: `Definição dos pulsos, segundo o treinamento:
- SP (Smart Pulse): MAIOR dano térmico (calor) e MENOR ablação (profundidade de vaporização). Cratera larga e rasa.
- DP (Deka Pulse): MENOR dano térmico e MAIOR ablação. Cratera em V, mais funda.
- HP (High Pulse): MUITA ablação e dano térmico mínimo ("pulso frio"). Cratera estreita e funda. No HP o time não se ajusta: a coluna fica vazia nas tabelas.
Ordem de calor: HP < DP < SP. Ordem de ablação: SP < DP < HP.
Os cinco parâmetros que determinam o tratamento:
1. Pulso = formato da cratera.
2. Watts = ablação.
3. Time = calor ao redor do ponto (dwell, em µs).
4. Spacing = densidade do tratamento.
5. Stack = aprofundar a ablação e o calor.
Como usar as tabelas: escolha a tabela da indicação, a linha do grupo de fototipo e o pulso; parta desses números e ajuste pelos demais fatores do caso. Quando não houver linha para o fototipo do paciente, extrapole na direção do padrão das tabelas (fototipo maior → menos watts, menos time, spacing maior) e diga que extrapolou.
Leitura do documento: a coluna "time" não traz unidade; os valores (300–1.700) foram lidos como µs.`,
  },
  ...PROTOCOLO_PREMIUM.map(
    (secao): TrechoBase => ({
      id: `premium-${secao.id}`,
      titulo: `Protocolo Premium — ${secao.titulo}`,
      origem: "protocolo_treinamento",
      fonte: { label: PROTOCOLO_FONTE.label },
      texto: textoSecao(secao),
    }),
  ),
  {
    id: "premium-focada",
    titulo: "Protocolo Premium — peça focada (sem scanner), lesões",
    origem: "protocolo_treinamento",
    fonte: { label: PROTOCOLO_FONTE.label },
    texto: `Tabela da peça de mão focada do SmartXide Punto: tipo de disparo (EM), potência e frequência por lesão. Não usa spacing, stack nem time.
${textoLesoesFocais()}
Cuidados que valem para qualquer lesão da tabela:
- Lesão pigmentada melanocítica (nevos) e qualquer lesão de diagnóstico incerto: só com diagnóstico clínico e dermatoscópico; na dúvida, biópsia antes. A vaporização destrói o material para histologia.
- Queratose actínica, queilite actínica e leucoplasia são pré-malignas: excluir carcinoma antes; considerar biópsia.
- Comece pela potência da tabela e suba só se a lesão não vaporizar; CW é corte/vaporização contínua com muito dano térmico.`,
  },

  // ==========================================================================
  //  Cada parâmetro
  // ==========================================================================
  {
    id: "param-potencia",
    titulo: "Potência (W)",
    origem: "consenso",
    texto: `Watts = ablação. Mais potência = coluna mais profunda.
Leia a potência sempre junto com o time: manchas usam 20–25 W com time de só 300 µs (muita ablação, pouco calor); rejuvenescimento suave usa 14–18 W com time de 800–1.000 µs.
A energia de cada DOT é potência × time: 10 W × 600 µs = 6 mJ.
No protocolo Premium, para a mesma indicação, a potência cai à medida que o fototipo sobe (ex.: rejuvenescimento suave SP: 18 → 16 → 14 W).`,
  },
  {
    id: "param-dwell",
    titulo: "Dwell time (µs)",
    origem: "consenso",
    texto: `Time = calor ao redor do ponto. É o principal controle de CALOR RESIDUAL.
- Curto (~300 µs): manchas e melanoses — ablação com pouco calor.
- Médio (600–900 µs): pálpebras, rejuvenescimento corporal, cicatrizes de acne.
- Longo (900–1.100 µs): rejuvenescimento facial e resurfacing de acne em fototipo 1–2.
No protocolo Premium o time cai à medida que o fototipo sobe (ex.: rejuvenescimento suave SP: 1.000 → 900 → 800 µs). No HP o time não se ajusta.
Subir o time aumenta profundidade E calor ao mesmo tempo; para ganhar profundidade com menos calor, prefira subir o stack ou trocar SP por DP.`,
  },
  {
    id: "param-spacing",
    titulo: "Spacing / DOT pitch (µm)",
    origem: "consenso",
    texto: `Spacing = densidade do tratamento: distância entre o centro de DOTs vizinhos.
A área tratada por cm² cai com o quadrado do spacing: passar de 800 para 400 µm quadruplica a densidade.
- 200–350 µm: manchas, cicatrizes de acne (só sobre a cicatriz), hipertróficas, intenso em HP — sempre com time curto ou HP.
- 600–800 µm: rejuvenescimento facial, pálpebras, resurfacing de acne.
- 800–950 µm: corpo (pescoço, colo, mãos, braços, estrias) e CoolPeel.
No protocolo Premium o spacing aumenta à medida que o fototipo sobe (ex.: rejuvenescimento suave SP: 750 → 800 → 850 µm). Em pele morena, abrir o spacing protege mais do que baixar a potência.`,
  },
  {
    id: "param-smartstack",
    titulo: "SmartStack (1 a 5)",
    origem: "fabricante",
    fonte: {
      label: "Folheto SmartXide Punto (DEKA)",
      url: "https://app.aico.swiss/19871/storage/files/Smartxide%20Punto%20Brochure%20ING%20Rev%203.0.pdf",
    },
    texto: `Número de pulsos consecutivos sobre o mesmo DOT (1 a 5). Aprofunda a coluna sem alargá-la tanto: segundo a DEKA, ao subir o nível o canal de ablação fica mais estreito por efeito de retração.
- Stack 1: superficial (manchas, textura, pele fina).
- Stack 2–3: o mais usado em cicatrizes e estrias.
- Stack 4–5: cicatrizes profundas em pele espessa; acumula muito calor no mesmo ponto.
Para ganhar profundidade, subir o stack é mais seguro do que subir o dwell, porque concentra o efeito em profundidade e não lateralmente.`,
  },
  {
    id: "param-modos-psd",
    titulo: "Modos de emissão (SP, DP, HP)",
    origem: "protocolo_treinamento",
    fonte: { label: PROTOCOLO_FONTE.label },
    texto: `Segundo o treinamento Premium (ver "premium-pulsos"), a forma do pulso decide a relação entre ablação e calor:
- SP (Smart Pulse): maior dano térmico, menor ablação. Para estimular colágeno e retrair com calor em profundidade: rejuvenescimento suave, corporal suave, pálpebras.
- DP (Deka Pulse): menor dano térmico, maior ablação. Rejuvenescimento intenso, cicatrizes de acne, cicatrizes atróficas e estrias brancas.
- HP (High Pulse): muita ablação, dano térmico mínimo (pulso frio); o time não se ajusta. Manchas, hipertróficas, CoolPeel e opções com pouco downtime em fototipo 3–4.
- CW (contínuo): só com peça focada, para corte e vaporização. Nunca recomende CW para resurfacing fracionado.`,
  },
  {
    id: "param-varredura",
    titulo: "Modo de varredura (SmartTrack, Interlaced, Normal)",
    origem: "fabricante",
    fonte: {
      label: "Folheto Tetra PRO (DEKA)",
      url: "https://app.aico.swiss/19871/storage/files/Tetra-PRO-Brochure-Dermatology-ING-Rev-1.2.pdf",
    },
    texto: `Define a ordem em que os DOTs são disparados dentro da área.
- SmartTrack: algoritmo da DEKA que otimiza o caminho para minimizar o aumento local de temperatura — não dispara DOTs vizinhos em sequência. Menos acúmulo de calor, menos dor, menos risco de mancha. Padrão recomendado, obrigatório com dwell longo, stack ≥ 3 ou fototipo IV–VI.
- Interlaced: intercala linhas; intermediário.
- Normal: linha a linha, sequencial; acumula mais calor.
O modo Scattered aplica uma borda que se dilui, evitando DOTs sobrepostos entre um disparo e o seguinte.`,
  },
  {
    id: "param-forma-area",
    titulo: "Forma e tamanho da área de scan",
    origem: "fabricante",
    fonte: {
      label: "Folheto SmartXide Punto (DEKA)",
      url: "https://app.aico.swiss/19871/storage/files/Smartxide%20Punto%20Brochure%20ING%20Rev%203.0.pdf",
    },
    texto: `O HiScan DOT permite escolher forma (quadrado, hexágono, triângulo, elipse, ponto), tamanho e proporção da área de cada disparo.
- Áreas grandes e planas (malar, fronte, abdome): quadrado ou hexágono grandes, encaixados lado a lado sem sobrepor.
- Contornos (nariz, lábio, pálpebra, linha mandibular): triângulo, elipse ou área pequena.
- Cicatriz isolada ou icepick: ponto ou área mínima, focal.
Sobrepor disparos dobra a dose na faixa sobreposta: é uma causa comum de mancha e cicatriz em linha.`,
  },
  {
    id: "param-interacoes",
    titulo: "Como os parâmetros se combinam",
    origem: "consenso",
    texto: `Três grandezas resumem o tratamento:
- Profundidade: potência, dwell time, SmartStack.
- Calor residual: time, modo de pulso (HP < DP < SP), modo de varredura.
- Densidade: spacing (e número de passadas).
Regras:
- Mude um parâmetro por vez entre sessões, 10–20% de cada vez, e só se a sessão anterior cicatrizou sem mancha.
- Fototipo alto: siga o padrão do protocolo — menos watts, menos time e spacing maior, juntos.
- Cicatriz profunda: ganhe profundidade com stack antes de subir dwell.
- Pele fina (pálpebra, pescoço, colo, mãos): reduza potência E densidade juntas.
- Segunda passada na mesma sessão soma densidade; só com spacing aberto e em pele espessa.
O valor em J/cm² mostrado na tela do aparelho usa o cálculo da DEKA; use-o para comparar sessões no mesmo aparelho, não entre aparelhos.`,
  },

  // ==========================================================================
  //  Fototipo e região
  // ==========================================================================
  {
    id: "fototipo-risco",
    titulo: "Fototipo e risco de hiperpigmentação pós-inflamatória (HPI)",
    origem: "consenso",
    texto: `O risco de HPI cresce do fototipo I ao VI e é o principal efeito adverso do CO2 fracionado em pele brasileira.
O protocolo Premium já embute o ajuste por fototipo em cada tabela: do grupo 1–2 para o 5–6, menos watts, menos time e spacing maior. Use a linha do grupo do paciente.
Além disso:
- IV–VI: SmartTrack, intervalo ≥ 6 semanas, preparo clareador, teste em área pequena na primeira sessão.
- Quando a tabela da indicação não tem linha para 5–6 (ex.: rejuvenescimento intenso, acne), não use a linha de 3–4 sem ajustar: extrapole para baixo e diga isso.
- VI: considerar alternativas menos ablativas (CoolPeel) ou não ablativas.
A HPI costuma aparecer 3–6 semanas após a sessão. Hipopigmentação tardia (meses) também ocorre, mais com alta densidade.`,
  },
  {
    id: "fototipo-preparo",
    titulo: "Preparo de pele em fototipos III–VI",
    origem: "consenso",
    texto: `Em fototipos III–VI, ou em quem já teve HPI:
- Fotoproteção diária rigorosa 2–4 semanas antes.
- Clareador tópico (hidroquinona 2–4% ou alternativa) 2–4 semanas antes, suspenso 3–5 dias antes da sessão e retomado após a reepitelização.
- Nada de bronzeado: pele bronzeada absorve mais e mancha mais; adiar a sessão até a pele voltar ao tom basal.`,
  },
  {
    id: "regiao-face",
    titulo: "Face: regiões e espessura",
    origem: "consenso",
    texto: `A face tem muitas unidades pilossebáceas, que são a fonte da reepitelização: por isso cicatriza mais rápido que qualquer outra área.
- Malar e nariz: pele espessa e sebácea; toleram os maiores parâmetros.
- Fronte: espessura média, osso próximo; parâmetros médios.
- Perioral: rugas finas pedem mais densidade, mas é área de herpes: profilaxia antiviral.
- Linha mandibular e transição para o pescoço: reduza os parâmetros nas bordas (feathering) para evitar linha de demarcação.`,
  },
  {
    id: "regiao-periorbital",
    titulo: "Periorbital e pálpebras",
    origem: "consenso",
    texto: `A pálpebra tem a pele mais fina do corpo. Use a tabela "premium-palpebras" (10–15 W, stack 2, time 600–800 µs, spacing 700–800 µm conforme o fototipo; o documento não indica o pulso).
- Dentro do rebordo orbitário, protetor ocular metálico interno (escudo corneano); todos na sala com óculos para 10.600 nm.
- Pálpebra inferior: tratamento agressivo pode retrair e causar ectrópio. Não passe do stack 2 nem feche o spacing além da tabela.`,
  },
  {
    id: "regiao-extrafacial",
    titulo: "Pescoço, colo, mãos e corpo",
    origem: "consenso",
    texto: `Fora da face há muito menos unidades pilossebáceas: a cicatrização é mais lenta e o risco de cicatriz e de HPI é maior.
- Pescoço, colo, mãos e braços: tabela "premium-corporal-suave" (SP, 10–15 W, stack 2, time 600–800 µs, spacing 800–900 µm).
- Cicatrizes atróficas e estrias brancas no corpo: "premium-corporal-forte" (DP, stack 3), marcada como intensa no documento.
- Pescoço e colo: risco de cicatriz hipertrófica em faixa; não passe da tabela.
- Faça uma única passada fora da face; intervalo ≥ 6–8 semanas.`,
  },

  // ==========================================================================
  //  Indicações
  // ==========================================================================
  {
    id: "ind-rejuvenescimento",
    titulo: "Rejuvenescimento e fotoenvelhecimento por grau de Glogau",
    origem: "consenso",
    texto: `Use o grau de Glogau para escolher a tabela do protocolo Premium:
- Glogau I, ou quem quer recuperação mínima: CoolPeel ("premium-coolpeel": HP, 1,5–4 W, spacing 950) ou rejuvenescimento suave em HP.
- Glogau II–III: rejuvenescimento suave ("premium-rejuv-suave"): SP para mais calor e retração; DP para mais ablação com menos calor.
- Glogau IV: rejuvenescimento intenso ("premium-rejuv-intenso"): DP stack 3; examinar lesões actínicas antes. Downtime de 7–10 dias.
Séries de 2–4 sessões com 4–6 semanas de intervalo. Grau sem informação: rejuvenescimento suave, na linha do fototipo.`,
  },
  {
    id: "ind-cicatriz-acne",
    titulo: "Cicatrizes de acne por tipo e grau de Goodman & Baron",
    origem: "consenso",
    texto: `Por tipo:
- Rolling: responde bem ao fracionado; combinar com subcisão melhora o resultado.
- Boxcar: responde bem; boxcar profundo pede stack 2–3.
- Icepick: estreita e profunda; o fracionado sozinho responde pouco. Use área mínima ou modo ponto, focal, com stack alto, ou combine com TCA CROSS ou punch.
- Acne ativa na área: tratar antes; laser sobre acne inflamada piora.
Por grau (escala qualitativa de Goodman & Baron):
- Grau 1 (macular, só mancha): não é indicação de CO2 ablativo; mancha vermelha responde a laser vascular, pigmento a clareador. Se tratar, superficial.
- Grau 2 (leve): fracionado superficial a médio, stack 1–2, 2–3 sessões.
- Grau 3 (moderada, nivela ao esticar): é a melhor indicação do fracionado; stack 2–3, 3–4 sessões. Rolling: subcisão associada.
- Grau 4 (grave, não nivela ao esticar): o laser sozinho rende pouco. Associe subcisão (rolling), TCA CROSS ou punch (icepick e boxcar profundos) e programe série mais longa; a primeira sessão continua conservadora.
Tabela do protocolo: lesões isoladas → "premium-acne-cicatriz" (DP 10 W, stack 2, ou 3 se profunda, spacing 300, só sobre a cicatriz); região inteira → "premium-acne-resurfacing" (DP 15–20 W, stack 3).
Habitualmente 3 sessões com 4–6 semanas de intervalo, avaliando 3 meses após a última.`,
  },
  {
    id: "ind-cicatriz-cirurgica",
    titulo: "Cicatrizes cirúrgicas e traumáticas por aspecto",
    origem: "consenso",
    texto: `- Plana (incomoda cor ou textura): fracionado superficial a médio, densidade média.
- Elevada (hipertrófica): tabela "premium-hipertroficas" (HP, 6–10 W, stack 2/3, spacing 200–300 µm); associar corticoide tópico ou intralesional logo após a sessão (laser-assisted drug delivery).
- Deprimida (atrófica): tabela "premium-corporal-forte" (DP, stack 3) sobre a cicatriz; considerar preenchimento ou subcisão associados.
- Com retração ou aderência: o fracionado melhora a elasticidade, mas retração importante é cirúrgica (zetaplastia, liberação); o laser entra como complemento.
- Momento: pode começar 4–12 semanas após a cirurgia, quando o resultado tende a ser melhor.
- Histórico de queloide é fator de risco para a pele ao redor: teste em área pequena.`,
  },
  {
    id: "ind-estrias",
    titulo: "Estrias por tipo, largura e quantidade",
    origem: "consenso",
    texto: `- Albas (antigas, brancas): tabela "premium-corporal-forte" (DP, stack 3).
- Rubras (recentes, avermelhadas): tabela "premium-corporal-suave" (SP, stack 2). Lasers vasculares também são opção.
- Finas e poucas: tratamento só sobre as estrias (área pequena), 2–3 sessões.
- Largas ou numerosas: série de 3–5 sessões; resultado parcial é a expectativa realista.
- Largas e numerosas com atrofia: melhora modesta; combine expectativa, considere associações (PRP, drug delivery).
- Corpo cicatriza devagar: intervalos de 6–8 semanas.`,
  },
  {
    id: "ind-pigmento-melasma",
    titulo: "Manchas, lentigos e melasma",
    origem: "consenso",
    texto: `- Lentigos solares e manchas epidérmicas: tabela "premium-manchas" (SP, DP ou HP; time de 300 µs; spacing 200–350 µm conforme o fototipo). Lesão isolada também pode ir com a peça focada ("premium-focada": discromias superficiais).
- Melasma: o CO2 fracionado NÃO é primeira linha nem monoterapia. A primeira abordagem é tópica (clareadores, fotoproteção) e ácido tranexâmico. O CO2 tem lugar no melasma REFRATÁRIO (≥ 3 meses de tratamento tópico adequado sem resposta), com parâmetros baixos e quase sempre como veículo para ácido tranexâmico aplicado logo após o laser. Ver o trecho "ind-melasma-protocolo".
- Paciente com melasma e outra queixa: trate a outra queixa com parâmetros mínimos fora das áreas de melasma, ou prefira outro método.`,
  },
  {
    id: "ind-melasma-protocolo",
    titulo: "Melasma refratário: quando e como usar o CO2",
    origem: "consenso",
    texto: `Critérios para considerar o CO2 fracionado no melasma:
- Refratário a ≥ 3 meses de tratamento tópico adequado com fotoproteção.
- Paciente ciente do risco de piora, HPI e recidiva, e disposto a manter clareador depois.
- Sem exposição solar intensa prevista.
Como fazer, segundo os protocolos publicados:
- Baixa densidade e pulso curto: na ordem de 12 W, spacing ~800 µm, dwell ~300 µs, stack 1, SmartTrack.
- Ácido tranexâmico aplicado logo após o laser (tópico ou intradérmico): os estudos comparativos mostram o combinado melhor que o laser sozinho.
- 3 sessões com intervalo de 4–6 semanas.
- Clareador tópico de manutenção depois da série: sem ele a recidiva é a regra.
Tipo de melasma: o dérmico e o misto têm pigmento mais profundo e respondem pior ao tópico, por isso aparecem mais entre os refratários; o epidérmico costuma responder ao tópico antes de precisar de laser.
Fototipo IV–VI: risco ainda maior de HPI; teste em área pequena obrigatório.`,
  },
  {
    id: "estudo-melasma-metanalise-2022",
    titulo: "Meta-análise 2022 — lasers no melasma",
    origem: "estudo",
    fonte: {
      label: "Laser therapy in the treatment of melasma: systematic review and meta-analysis (2022)",
      url: "https://pubmed.ncbi.nlm.nih.gov/35122202/",
    },
    texto: `22 estudos, 694 pacientes. O CO2 fracionado ablativo reduziu o MASI (diferença média −9,36; IC 95% −12,51 a −6,21). O laser não ablativo de 1550 nm e o picossegundo não tiveram redução significativa nessa análise.
Os autores destacam o risco de hiper e hipopigmentação pós-inflamatória em pele mais escura.`,
  },
  {
    id: "estudo-melasma-revisoes",
    titulo: "Revisões: recidiva e HPI do laser ablativo no melasma",
    origem: "estudo",
    fonte: {
      label: "The use of ablative lasers in the treatment of facial melasma (An Bras Dermatol 2013)",
      url: "https://new.scielo.br/j/abd/a/KqfcVBZwNfK36vHSzmBrMmM/?lang=en",
    },
    texto: `- Revisão brasileira (An Bras Dermatol, 2013; 75 pacientes em séries e ensaios pequenos): HPI e dificuldade de manter o resultado são as principais limitações; com CO2, melhores resultados com pulso curto e baixa densidade; creme clareador de manutenção foi necessário e eficaz; recomenda reservar o ablativo para casos refratários.
- Revisão de lasers e luz no melasma (Int J Womens Dermatol, 2017): todos parecem eficazes, mas a recidiva com o tempo é alta; os ablativos fracionados têm risco muito alto de hipo e hiperpigmentação pós-inflamatória e devem ser usados com cautela.`,
  },
  {
    id: "estudo-melasma-txa",
    titulo: "CO2 fracionado com ácido tranexâmico no melasma",
    origem: "estudo",
    fonte: {
      label: "Eassa et al., Lasers Med Sci 2025 (PubMed 40522526)",
      url: "https://pubmed.ncbi.nlm.nih.gov/40522526/",
    },
    texto: `- Eassa et al., 2025: 40 pacientes, comparação entre os dois lados da face. CO2 fracionado de baixa potência seguido de ácido tranexâmico 10% de um lado e vitamina C 20% do outro. Os dois funcionaram, com vantagem para o ácido tranexâmico.
- Estudo randomizado: CO2 fracionado sozinho × CO2 seguido de ácido tranexâmico 5%, 3 sessões com 4 semanas de intervalo; o combinado foi mais eficaz.
- Ensaio registrado NCT03899233: CO2 a 12 W, spacing 800 µm (densidade 7,3%), dwell 300 µs, 3 sessões a cada 6 semanas, com ácido tranexâmico intradérmico.
São estudos pequenos, com vias e concentrações diferentes; a direção é consistente, a magnitude não.`,
  },
  {
    id: "ind-outras",
    titulo: "Poros, flacidez palpebral e queratoses actínicas",
    origem: "consenso",
    texto: `- Poros e textura: superficial a médio, densidade média, stack 1.
- Flacidez palpebral leve: CO2 fracionado na pálpebra produz retração modesta; flacidez com excesso de pele é cirúrgica (blefaroplastia).
- Queratoses actínicas (campo cancerizável): o CO2 fracionado é usado sozinho ou antes de terapia fotodinâmica, para aumentar a penetração do fotossensibilizante. Lesão suspeita de carcinoma não deve ser tratada com laser sem biópsia.`,
  },

  // ==========================================================================
  //  Fatores do caso
  // ==========================================================================
  {
    id: "fator-idade",
    titulo: "Idade do paciente",
    origem: "consenso",
    texto: `- Acima de ~60 anos: pele mais fina, menos anexos e cicatrização mais lenta. Reduza densidade, prefira stack baixo e alongue o intervalo. A resposta em rugas costuma ser boa, mas o eritema dura mais.
- Adolescentes e adultos jovens com cicatriz de acne: tolerância boa; o que pesa é a acne ainda ativa e o uso recente de isotretinoína.
- Idade não muda o fototipo: um paciente jovem de fototipo V continua com risco alto de HPI.`,
  },
  {
    id: "fator-gravidade",
    titulo: "Grau da queixa: como usar as escalas",
    origem: "consenso",
    texto: `Cada indicação tem a sua escala; o grau vem descrito no caso. Regras gerais:
- Rejuvenescimento: escala de Glogau (I a IV), ver "ind-rejuvenescimento".
- Cicatriz de acne: escala qualitativa de Goodman & Baron (1 a 4), ver "ind-cicatriz-acne".
- Cicatriz cirúrgica ou traumática: aspecto (plana, elevada, deprimida, com retração), ver "ind-cicatriz-cirurgica".
- Estrias: largura e quantidade, ver "ind-estrias".
- Melasma: extensão e intensidade (leve, moderado, grave). Grau maior não autoriza parâmetro maior: no melasma o limite é o risco de HPI e rebote, não a intensidade da mancha. Grau maior pede mais sessões e manutenção mais rigorosa.
Em todas: grau maior pede mais profundidade e mais sessões, mas chegue lá aos poucos (primeira sessão conservadora, depois suba o stack), e costuma pedir associação. O grau nunca justifica, sozinho, ignorar a regra do fototipo ou da região.
Grau não informado: siga a ponta conservadora e pergunte o grau em "perguntas_pendentes" se ele mudaria a recomendação.`,
  },
  {
    id: "fator-caracteristicas-pele",
    titulo: "Características da pele",
    origem: "consenso",
    texto: `- Oleosa e espessa: muitas unidades pilossebáceas, cicatriza rápido; tolera parâmetros um pouco maiores dentro da faixa.
- Fina ou atrófica: trate como pele fina (potência e densidade menores, stack 1–2), mesmo na face.
- Sensível ou com rosácea: eritema mais longo e mais reativo; reduza dwell e densidade, avise do eritema prolongado.
- Acne inflamatória ativa: trate a acne antes; laser sobre lesão inflamada piora a inflamação e o risco de infecção e cicatriz.
- Fotodano intenso: boa indicação de rejuvenescimento; procure lesões suspeitas antes (biópsia se houver dúvida).`,
  },
  {
    id: "fator-extensao",
    titulo: "Região inteira × lesões isoladas",
    origem: "consenso",
    texto: `- Região inteira: áreas grandes encaixadas sem sobreposição, bordas com parâmetros reduzidos (feathering) para não deixar demarcação.
- Lesões isoladas (cicatriz única, icepick, estria localizada): área pequena ou modo ponto, só sobre a lesão. Pode usar profundidade maior do que trataria a região inteira, porque a área total é pequena; mesmo assim respeite o fototipo.`,
  },
  {
    id: "fator-exposicao-solar",
    titulo: "Exposição solar prevista",
    origem: "consenso",
    texto: `A pele tratada fica mais sensível à luz até 4–6 semanas depois.
- Baixa: segue o plano.
- Moderada: reforce fotoproteção e prefira a ponta conservadora da faixa em fototipo III–VI.
- Alta (trabalho ao sol, praia, viagem): o risco de HPI sobe muito; o mais seguro é adiar a sessão. Se não der para adiar, parâmetros mínimos e fotoproteção física.`,
  },
  {
    id: "fator-associacoes",
    titulo: "Procedimentos combinados na mesma sessão",
    origem: "consenso",
    texto: `- Drug delivery (ácido tranexâmico, vitamina C e outros ativos aplicados logo após o laser): o objetivo é abrir canais, não ablação profunda. Densidade baixa a média, dwell curto, stack 1. Use só produtos estéreis e próprios para aplicação em pele aberta.
- Subcisão: na mesma sessão para cicatriz rolling; faça a subcisão antes do laser ou em outro dia se houver muito sangramento.
- PRP: aplicado após o laser, ajuda a recuperação; não muda os parâmetros.
- Corticoide intralesional: em cicatriz hipertrófica, logo após o laser; densidade baixa.
- TCA CROSS: para icepick; não aplique o laser sobre o ponto tratado com TCA na mesma sessão.`,
  },
  {
    id: "fator-idade-cicatriz",
    titulo: "Idade da cicatriz",
    origem: "consenso",
    texto: `- Cicatriz cirúrgica ou traumática com menos de 6 meses: é o momento em que o laser rende mais. Pode começar 4–12 semanas após a cirurgia, com parâmetros moderados e densidade baixa.
- 6–12 meses: ainda remodelando; tratamento padrão.
- Mais de 12 meses: cicatriz madura; pede mais profundidade (stack) e mais sessões para o mesmo ganho.
- Cicatriz hipertrófica ainda vermelha e elevada: densidade baixa, associar corticoide.`,
  },
  {
    id: "fator-sessao-anterior",
    titulo: "Usar a sessão anterior para decidir a próxima",
    origem: "consenso",
    texto: `Com os parâmetros da sessão anterior em mãos:
- Cicatrizou no prazo, sem mancha, resultado parcial ou sem melhora: suba UM parâmetro em 10–20% (de preferência stack ou potência).
- Resultado bom: mantenha; não há motivo para subir.
- Teve HPI ou eritema muito prolongado (> 2× o esperado): repita ou reduza. Nenhum parâmetro mais agressivo que o anterior, e espere a mancha clarear antes da próxima sessão.
- Sem o registro dos parâmetros anteriores: trate como primeira sessão.`,
  },

  // ==========================================================================
  //  Estudos publicados com o SmartXide DOT
  // ==========================================================================
  {
    id: "estudo-omi-2011",
    titulo: "Omi et al. 2011 — cicatriz de acne",
    origem: "estudo",
    fonte: {
      label: "Omi T. et al., J Cosmet Dermatol 2011",
      url: "https://pubmed.ncbi.nlm.nih.gov/22151938/",
    },
    texto: `7 voluntários japoneses com cicatriz atrófica de acne, SmartXide DOT.
Parâmetros: 10 W, 600 µs, spacing 800 µm, stack 2 (0,91 J/cm² segundo os autores). 3 sessões, biópsias antes, logo após e 3 semanas depois.
É o protocolo publicado mais conservador para cicatriz de acne com este scanner, em pele asiática.`,
  },
  {
    id: "estudo-dot-resultados-iniciais",
    titulo: "Fractional Laser Skin Resurfacing with SmartXide DOT — resultados iniciais",
    origem: "estudo",
    fonte: {
      label: "ResearchGate — SmartXide DOT: Initial Results",
      url: "https://www.researchgate.net/publication/306188030_Fractional_Laser_Skin_Resurfacing_with_SmartXide_DOT_Initial_Results",
    },
    texto: `Relato inicial de casos com o SmartXide DOT:
- Cicatriz de acne: 30 W, spacing 1.000 µm, dwell 2 ms (3,3 J/cm²).
- Cicatriz de acne com componente fibrótico maior: 30 W, 800 µm, 2 ms (4,5 J/cm²).
- Pigmentação: 15 W, 500 µm, 300 µs (0,6 J/cm²).
São configurações agressivas para cicatriz, em série de casos; não use como ponto de partida em fototipo alto ou primeira sessão.`,
  },
  {
    id: "estudo-cicatrizes-eryag-co2",
    titulo: "Er:YAG fracionado × CO2 fracionado em cicatrizes maduras e imaturas",
    origem: "estudo",
    fonte: {
      label: "Estudo comparativo randomizado (PMC10796705)",
      url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10796705/",
    },
    texto: `Braço CO2 fracionado em cicatrizes: 10–15 W, dwell 600 µs, spacing 700 µm, densidade 3–5%, SmartStack nível 2.`,
  },
  {
    id: "estudo-estrias-nct04165226",
    titulo: "Ensaio NCT04165226 — estrias albas",
    origem: "estudo",
    fonte: {
      label: "ClinicalTrials.gov NCT04165226",
      url: "https://clinicaltrials.gov/study/NCT04165226",
    },
    texto: `CO2 fracionado em estrias albas (com LLLT em outro braço). Faixa de partida: 15–20 W, dwell 500–800 µs, spacing 200–500 µm, stack 2, ajustados por paciente.
O spacing deste protocolo é bem mais denso do que o de cicatrizes; ele trata só a estria, não a pele ao redor.`,
  },
  {
    id: "estudo-coolpeel",
    titulo: "CoolPeel — rejuvenescimento superficial",
    origem: "estudo",
    fonte: {
      label: "Laser-Assisted Exosome Delivery com CO2 fracionado (MDPI Cosmetics, 2025)",
      url: "https://www.mdpi.com/2079-9284/12/5/199",
    },
    texto: `Uma passada CoolPeel: 5 W, spacing 500 µm, modo HighPulse, para fotoenvelhecimento com discromia difusa e pouco downtime.
O aparelho do relato foi o SmartXide Tetra PRO com scanner DOT PRO; o princípio (HP, potência baixa) se aplica ao Punto, mas confira a equivalência no aparelho.`,
  },

  // ==========================================================================
  //  Segurança
  // ==========================================================================
  {
    id: "seg-contraindicacoes",
    titulo: "Contraindicações",
    origem: "consenso",
    texto: `Absolutas (não tratar):
- Gestação.
- Infecção ativa na área (herpes, bacteriana, fúngica).
- Lesão suspeita de malignidade sem diagnóstico.
Relativas (tratar só com ajuste e consentimento):
- Isotretinoína oral recente. A recomendação clássica era esperar 6–12 meses; o consenso da ASDS de 2017 concluiu que não há evidência suficiente para adiar procedimentos fracionados. Na dúvida, parâmetros leves e teste.
- Histórico de queloide ou cicatriz hipertrófica.
- Vitiligo ou psoríase ativos (fenômeno de Koebner).
- Bronzeado recente, melasma, HPI prévia.
- Diabetes descompensado, imunossupressão, tabagismo (cicatrização pior).
- Radioterapia prévia na área (menos anexos, cicatrização pior).
- Anticoagulantes (mais sangramento pontual e equimose).
- Lactação (sem contraindicação formal ao laser; cuidado com anestésico e medicações).
- Procedimento recente na área (peeling, laser, preenchimento) nas últimas 4 semanas.`,
  },
  {
    id: "seg-pre",
    titulo: "Antes da sessão",
    origem: "consenso",
    texto: `- Profilaxia antiviral (aciclovir ou valaciclovir, iniciando na véspera ou no dia, por 5–7 dias) em face total, perioral ou histórico de herpes.
- Suspender retinoides tópicos e ácidos 3–7 dias antes.
- Anestésico tópico 30–60 min, removido por completo e pele SECA: água residual absorve o CO2 e muda o efeito.
- Óculos para 10.600 nm para todos; escudo ocular metálico para pálpebra.
- Fotografia padronizada.
- Teste em área pequena e discreta quando: fototipo IV–VI, histórico de HPI ou queloide, primeira sessão com parâmetros médios ou altos, área extrafacial.`,
  },
  {
    id: "seg-intraoperatorio",
    titulo: "Durante a sessão: sinais a observar",
    origem: "consenso",
    texto: `- Esperado: eritema e edema leves, DOTs visíveis em grade.
- Pontos de sangramento: aceitáveis só em parâmetros profundos (stack alto, cicatriz).
- Alerta: branqueamento confluente ou pele "cozida" entre os DOTs = densidade ou calor excessivos; pare e reduza.
- Disparos lado a lado, sem sobreposição. Bordas da área com parâmetros reduzidos (feathering).`,
  },
  {
    id: "seg-pos",
    titulo: "Depois da sessão",
    origem: "consenso",
    texto: `- Compressas frias nas primeiras horas.
- Limpeza suave e oclusivo (vaselina ou creme reparador) até a reepitelização: cerca de 3–5 dias no superficial, 5–7 no fracionado médio, até 10 no intenso.
- Sem maquiagem, ácidos ou retinoides até reepitelizar.
- Fotoproteção rigorosa por pelo menos 4–6 semanas.
- Retorno em 7 dias.
- Se surgir HPI: clareador tópico e fotoproteção; não repetir a sessão enquanto houver mancha ativa.
Complicações a vigiar: eritema prolongado, HPI, infecção (herpes, bacteriana, cândida), milium e erupção acneiforme, cicatriz, ectrópio (pálpebra inferior), hipopigmentação tardia.`,
  },
  {
    id: "seg-sessoes",
    titulo: "Número de sessões, intervalo e progressão",
    origem: "consenso",
    texto: `- Face: 2–4 sessões, intervalo de 4–6 semanas.
- Fototipo IV–VI e áreas extrafaciais: intervalo de 6–8 semanas.
- Primeira sessão: sempre na ponta conservadora da faixa.
- Sessão seguinte: se cicatrizou no prazo esperado e sem mancha, suba UM parâmetro em 10–20% (de preferência stack ou potência). Se houve HPI ou eritema prolongado, volte ao nível anterior ou abaixo.`,
  },

  // ==========================================================================
  //  Pontos de partida conservadores (sem estudo específico do aparelho)
  // ==========================================================================
  {
    id: "regra-pontos-de-partida",
    titulo: "Pontos de partida conservadores sem protocolo publicado",
    origem: "regra_conservadora",
    texto: `Use estes valores SÓ quando não houver tabela do protocolo Premium para o caso (ex.: poros e textura isolados, regiões do corpo fora das tabelas) e diga ao médico que são pontos de partida conservadores, não protocolo:
- Poros e textura: como o rejuvenescimento suave da linha do fototipo, com stack 1, ou CoolPeel.
- Abdome, coxas, glúteos e dorso sem estrias: como o corporal suave da linha do fototipo.
Quando o protocolo e um estudo publicado divergirem, siga o protocolo e cite a divergência.`,
  },
];

/** Ids válidos, na ordem da base — vão para o enum de `fontes` no schema. */
export const IDS_BASE = BASE_CONHECIMENTO.map((t) => t.id);

export function trechoPorId(id: string): TrechoBase | undefined {
  return BASE_CONHECIMENTO.find((t) => t.id === id);
}

/** A base serializada para o prompt, sempre na mesma ordem e nos mesmos bytes. */
export function baseParaPrompt(): string {
  return BASE_CONHECIMENTO.map((t) => {
    const fonte = t.fonte ? `\nfonte: ${t.fonte.label}` : "";
    return `<trecho id="${t.id}" origem="${t.origem}">
titulo: ${t.titulo}${fonte}
${t.texto}
</trecho>`;
  }).join("\n\n");
}
