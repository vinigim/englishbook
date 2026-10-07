/**
 * Base de conhecimento do SmartXide Punto (DEKA) com scanner HiScan DOT.
 *
 * Por que não é um RAG com busca vetorial
 * ---------------------------------------
 * A base inteira, com as instruções, tem por volta de 6 mil tokens. Isso cabe com folga no
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
 * Folhetos da DEKA, fichas técnicas de distribuidores e estudos publicados
 * com o SmartXide DOT, encontrados por busca em out/2026. As páginas não
 * puderam ser abertas na íntegra no ambiente em que esta base foi escrita:
 * os valores vêm dos resumos da busca. Confira cada um no manual do aparelho
 * antes de tratá-lo como definitivo.
 */

export const KB_VERSAO = 1;

export const ORIGENS = [
  "fabricante",
  "estudo",
  "consenso",
  "regra_conservadora",
] as const;
export type Origem = (typeof ORIGENS)[number];

export const ORIGEM_LABEL: Record<Origem, string> = {
  fabricante: "Fabricante",
  estudo: "Estudo publicado",
  consenso: "Consenso clínico",
  regra_conservadora: "Regra conservadora",
};

export type TrechoBase = {
  id: string;
  titulo: string;
  origem: Origem;
  fonte?: { label: string; url: string };
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
- Dwell time (tempo por DOT): 200 a 2.000 µs (0,2 a 2 ms).
- Spacing / DOT pitch (distância entre DOTs): 200 a 1.000 µm.
- SmartStack: 1 a 5 pulsos sobre o mesmo DOT.
- Diâmetro do DOT: cerca de 350 µm.
- Potência: a literatura com o DOT usa até 30 W; o Punto permite até 50 W, mas valores acima de 30 W não aparecem nos estudos do sistema fracionado.
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
    texto: `O sistema DOT entrega energia ablativa num spot de cerca de 350 µm, com até 30 W no tecido.
Como o DOT tem ~350 µm, um spacing de 350 µm ou menos faz as colunas se tocarem: o efeito deixa de ser fracionado e se aproxima do resurfacing total, com mais downtime e mais risco.`,
  },

  // ==========================================================================
  //  Cada parâmetro
  // ==========================================================================
  {
    id: "param-potencia",
    titulo: "Potência (W)",
    origem: "consenso",
    texto: `Energia que o feixe entrega por segundo. Mais potência = coluna mais profunda e um pouco mais larga.
- 5–15 W: ablação superficial. Manchas, textura, rejuvenescimento leve, pele fina.
- 15–20 W: rejuvenescimento moderado, estrias, cicatrizes leves a moderadas.
- 20–30 W: cicatrizes profundas e fibrose, em pele espessa (malar, nariz).
A energia de cada DOT é potência × dwell time: 10 W × 600 µs = 6 mJ.`,
  },
  {
    id: "param-dwell",
    titulo: "Dwell time (µs)",
    origem: "consenso",
    texto: `Quanto tempo o laser dispara sobre cada DOT. É o principal controle de CALOR RESIDUAL.
- Curto (200–500 µs): ablação mais limpa, pouco calor lateral, recuperação rápida, menos risco de hiperpigmentação. Preferido em fototipos altos e pele fina.
- Médio (500–800 µs): uso geral.
- Longo (800–2.000 µs): mais coagulação, mais retração e estímulo de colágeno; mais dias de eritema e mais risco de mancha. Reservado a fototipos I–III com cicatriz fibrótica ou rugas profundas.
Subir o dwell aumenta profundidade E calor ao mesmo tempo; para ganhar profundidade com menos calor, prefira subir o SmartStack.`,
  },
  {
    id: "param-spacing",
    titulo: "Spacing / DOT pitch (µm)",
    origem: "consenso",
    texto: `Distância entre o centro de DOTs vizinhos. É o controle de DENSIDADE.
A área tratada por cm² cai com o quadrado do spacing: passar de 800 para 400 µm quadruplica a dose média.
- 800–1.000 µm: baixa densidade; pele íntegra entre colunas cicatriza rápido. Fototipos IV–VI, pescoço, colo, mãos, corpo, primeira sessão.
- 500–700 µm: uso geral na face.
- 200–400 µm: alta densidade, próximo do resurfacing total; só fototipos I–III, face, com experiência.
A densidade é o fator que mais pesa no risco de hiperpigmentação pós-inflamatória em pele morena: reduzir densidade protege mais do que reduzir potência.`,
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
    titulo: "Modos de emissão (PSD: SP, DP, HP)",
    origem: "fabricante",
    fonte: {
      label: "Folheto Tetra PRO (DEKA)",
      url: "https://app.aico.swiss/19871/storage/files/Tetra-PRO-Brochure-Dermatology-ING-Rev-1.2.pdf",
    },
    texto: `A tecnologia PSD (Pulse Shape Design) define a forma de cada pulso: um pico inicial alto vaporiza a epiderme e a cauda do pulso aquece a derme.
- HP (HighPulse): pico alto, pulso curto. Ablação limpa e pouco calor. É o modo do protocolo CoolPeel (superficial, pouco downtime). Bom para manchas, textura e fototipos altos.
- SP (SmartPulse): equilíbrio entre ablação e efeito térmico. Modo padrão do resurfacing fracionado com DOT; controla profundidade (energia) e dano térmico (dwell) ao mesmo tempo.
- DP (DEKAPulse): pulso mais longo e mais térmico; mais coagulação e retração. Rugas e flacidez em fototipos I–III.
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
- Calor residual: dwell time, modo de pulso (HP < SP < DP), modo de varredura.
- Densidade: spacing (e número de passadas).
Regras:
- Mude um parâmetro por vez entre sessões, 10–20% de cada vez, e só se a sessão anterior cicatrizou sem mancha.
- Fototipo alto: reduza densidade e dwell antes de reduzir potência.
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
- I–III: tolera densidade média a alta e dwell longo.
- IV: densidade baixa a média (spacing ≥ 600–700 µm), dwell ≤ 800 µs, SmartTrack, intervalo ≥ 6 semanas, preparo clareador.
- V: densidade baixa (spacing ≥ 800 µm), dwell curto (≤ 500 µs), stack 1–2, HP ou SP, SmartTrack, intervalo 6–8 semanas, teste obrigatório.
- VI: ablativo fracionado só com muita cautela, teste prévio obrigatório e expectativa de mais sessões leves; considerar alternativas não ablativas.
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
    texto: `A pálpebra tem a pele mais fina do corpo.
- Reduza potência e densidade em relação à face: ponto de partida conservador em torno de 6–10 W, dwell 200–400 µs, spacing 700–1.000 µm, stack 1.
- Dentro do rebordo orbitário, protetor ocular metálico interno (escudo corneano); todos na sala com óculos para 10.600 nm.
- Pálpebra inferior: tratamento agressivo pode retrair e causar ectrópio. Evite stack alto e alta densidade.
Não foi encontrado protocolo publicado do SmartXide DOT específico para pálpebra: os números acima são ponto de partida conservador.`,
  },
  {
    id: "regiao-extrafacial",
    titulo: "Pescoço, colo, mãos e corpo",
    origem: "consenso",
    texto: `Fora da face há muito menos unidades pilossebáceas: a cicatrização é mais lenta e o risco de cicatriz e de HPI é maior.
- Reduza densidade em cerca de metade em relação à face (spacing 800–1.000 µm) e reduza potência.
- Pescoço e colo: pele fina, risco de cicatriz hipertrófica em faixa; stack 1, dwell curto.
- Mãos: pele fina sobre tendões; parâmetros leves.
- Abdome, coxas, glúteos, braços, dorso: estrias e cicatrizes; potência média, densidade baixa, intervalo ≥ 6–8 semanas.
- Faça uma única passada fora da face.`,
  },

  // ==========================================================================
  //  Indicações
  // ==========================================================================
  {
    id: "ind-rejuvenescimento",
    titulo: "Rejuvenescimento e fotoenvelhecimento",
    origem: "consenso",
    texto: `- Leve (textura, linhas finas, poros): superficial. HP (CoolPeel) ou SP com potência baixa, dwell curto, spacing 500–700 µm, stack 1. Downtime de 2–4 dias.
- Moderado (rugas, fotodano): SP, potência média, dwell 500–800 µs, spacing 500–700 µm, stack 1–2.
- Intenso (rugas profundas, fototipos I–III): SP ou DP, potência mais alta, dwell 800–1.000 µs, spacing 400–600 µm, stack 2. Downtime de 7–10 dias.
Séries de 2–4 sessões com 4–6 semanas de intervalo.`,
  },
  {
    id: "ind-cicatriz-acne",
    titulo: "Cicatrizes de acne por tipo",
    origem: "consenso",
    texto: `- Rolling: responde bem ao fracionado; combinar com subcisão melhora o resultado.
- Boxcar: responde bem; boxcar profundo pede stack 2–3.
- Icepick: estreita e profunda; o fracionado sozinho responde pouco. Use área mínima ou modo ponto, focal, com stack alto, ou combine com TCA CROSS ou punch.
- Acne ativa na área: tratar antes; laser sobre acne inflamada piora.
Habitualmente 3 sessões com 4–6 semanas de intervalo, avaliando 3 meses após a última.`,
  },
  {
    id: "ind-cicatriz-cirurgica",
    titulo: "Cicatrizes cirúrgicas, traumáticas e hipertróficas",
    origem: "consenso",
    texto: `- Cicatriz cirúrgica: pode começar cedo, 4–12 semanas após a cirurgia, quando o resultado tende a ser melhor.
- Hipertrófica ou queloide: densidade baixa e profundidade maior; pode ser combinada com corticoide tópico ou injetado logo após a sessão (laser-assisted drug delivery).
- Histórico de queloide é fator de risco para a pele ao redor: teste em área pequena.`,
  },
  {
    id: "ind-estrias",
    titulo: "Estrias",
    origem: "consenso",
    texto: `- Albas (antigas, brancas): CO2 fracionado tem boa evidência; potência média, densidade média a alta dentro da estria, stack 2.
- Rubras (recentes, avermelhadas): lasers vasculares costumam ser a primeira escolha; o CO2 funciona, mas com parâmetros mais leves.
- Corpo cicatriza devagar: intervalos de 6–8 semanas.`,
  },
  {
    id: "ind-pigmento-melasma",
    titulo: "Manchas, lentigos e melasma",
    origem: "consenso",
    texto: `- Lentigos solares e manchas epidérmicas: ablação superficial, HP ou SP com dwell curto (≤ 300 µs), potência baixa a média, stack 1.
- Melasma: CO2 ablativo NÃO é recomendado como tratamento do melasma. O calor pode piorar e causar rebote e HPI. Se o paciente tem melasma e outra queixa, use parâmetros mínimos fora das áreas de melasma, ou prefira outro método. Alternativas: tratamento tópico, ácido tranexâmico, tecnologias não ablativas de baixa energia.`,
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
    texto: `Para estas situações não há estudo publicado com o SmartXide DOT. Os valores são derivados das faixas publicadas, na ponta conservadora, e devem ser validados com o manual e o treinamento da DEKA:
- Rejuvenescimento facial moderado: SP, 12–18 W, 500–800 µs, spacing 500–700 µm, stack 1–2.
- Pálpebras e periorbital: SP ou HP, 6–10 W, 200–400 µs, spacing 700–1.000 µm, stack 1.
- Pescoço e colo: SP ou HP, 8–12 W, 300–500 µs, spacing 800–1.000 µm, stack 1.
- Dorso das mãos: SP ou HP, 8–12 W, 300–500 µs, spacing 800–1.000 µm, stack 1.
Ao usar estes valores, diga ao médico que são pontos de partida conservadores e não protocolo publicado.`,
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
