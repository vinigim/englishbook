# 📡 Radar de Vagas Mainframe

Procura todo dia vagas de **mainframe a partir de sênior** (Sênior, Especialista, Tech Lead,
Coordenador, Gerente), no Brasil e no exterior, avalia cada uma com IA, ajuda a montar a
candidatura e acompanha o funil até a proposta.

## O que ele faz

| Tela | O quê |
|---|---|
| **Vagas** | Lista com nota de aderência (0–100), nível, modelo de trabalho, faixa salarial quando informada, filtros e busca. Abas: relevantes, aguardando triagem, descartadas e arquivadas. Botão **Buscar agora** e **Vaga manual** (para vagas achadas por indicação, grupo, site). |
| **Vaga** | Resumo da IA, motivos da nota, descrição. **Gerar materiais**: CV adaptado (pronto para salvar em PDF), carta, mensagem para o recrutador, respostas para o formulário, lacunas, palavras-chave que faltam no CV e perguntas prováveis de entrevista. Painel de acompanhamento com status, datas, contatos, notas e linha do tempo. |
| **Candidaturas** | Quadro (Interessado → Aplicado → Entrevista → Proposta → Encerrado), taxa de entrevista e follow-ups vencidos. Ao marcar "aplicado", o follow-up já fica agendado para 7 dias depois. |
| **Meu CV** | CV base estruturado. Importa de PDF ou texto colado (a IA preenche os campos, você revisa). Versões adaptadas por vaga ficam listadas ao lado. |
| **Perfil e fontes** | O que você procura (usado na nota), termos de busca, modelos de trabalho, cidades, empresas-alvo, custo de IA no mês e histórico das buscas. |

## De onde vêm as vagas

| Fonte | Como | Observação |
|---|---|---|
| **Gupy** | API pública do portal (`portal.api.gupy.io`) | Busca pelos termos do seu perfil no título da vaga. Cobre muitos bancos, seguradoras e grandes empresas. |
| **LinkedIn, Indeed, Glassdoor, Catho** | E-mails de alerta lidos no Gmail (IMAP) | Esses sites não têm API pública e proíbem robôs. Você cria os alertas lá; o radar lê os e-mails e extrai as vagas. |
| **Empresas-alvo** | JSON público das páginas de carreira (Greenhouse, Lever, SmartRecruiters, Workable, Workday) | Você cadastra as empresas que quer vigiar. |

**Não há candidatura automática, de propósito.** Robôs que se candidatam sozinhos violam os
termos de uso do LinkedIn e afins e podem bloquear sua conta. O radar prepara tudo; o clique
final é seu.

### Como a busca decide o que mostrar

1. **Coleta** das fontes acima. Cada fonte falha sozinha (se a Gupy cair, o Gmail continua).
2. **Pré-filtro** sem custo: descarta títulos de estágio/júnior e vagas que não citam
   nenhuma tecnologia de mainframe (COBOL, CICS, JCL, z/OS, "alta plataforma", Natural/Adabas,
   IMS, VSAM, PL/I, REXX…). Alertas de e-mail pulam esse passo porque não trazem descrição.
3. **Deduplicação** por título + empresa: a mesma vaga vinda da Gupy e do LinkedIn vira uma só.
4. **Triagem por IA** (Claude Haiku 5.5, barato): é mainframe de verdade? Qual o nível? Nota de
   aderência ao seu perfil e CV. Fica em "Relevantes" o que é mainframe **e** sênior ou acima.
   Se a IA errar, você traz a vaga de volta com um clique.

## Instalação

### 1. Supabase (banco e login)

1. Crie um projeto em [supabase.com](https://supabase.com) (plano gratuito serve).
2. **SQL Editor** → cole e rode `supabase/migrations/0001_schema.sql`.
3. **Authentication → Users → Add user**: crie seu usuário com e-mail e senha.
4. **Project Settings → API**: copie a URL, a `anon key` e a `service_role key`.

### 2. Chave da Anthropic

Crie em [console.anthropic.com](https://console.anthropic.com) → API Keys.

### 3. Gmail (opcional, mas é o que traz LinkedIn/Indeed/Glassdoor/Catho)

1. Ative a verificação em duas etapas na sua conta Google.
2. Gere uma **senha de app** em [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
3. Crie alertas **diários** com termos como `mainframe`, `COBOL`, `CICS`, `z/OS`, `alta plataforma`:
   - LinkedIn: pesquise a vaga → "Criar alerta".
   - Indeed / Glassdoor / Catho: pesquise → "Receber vagas por e-mail".

### 4. Rodar localmente

```bash
cp .env.example .env.local   # preencha os valores
npm install
npm run dev                  # http://localhost:3000
```

### 5. Publicar na Vercel (para a busca diária)

1. Importe o repositório em [vercel.com](https://vercel.com).
2. Em **Settings → Environment Variables**, cadastre as variáveis do `.env.example`.
   Para `CRON_SECRET`, use um texto aleatório longo.
3. O `vercel.json` agenda `/api/cron/buscar` todo dia às 10:00 UTC (7:00 em Brasília).
   O plano Hobby permite isso (cron diário).

## Empresas-alvo: como achar o "slug"

Abra a página de vagas da empresa e olhe a URL:

| Se a URL for… | ATS | Slug |
|---|---|---|
| `boards.greenhouse.io/empresa` ou `job-boards.greenhouse.io/empresa` | greenhouse | `empresa` |
| `jobs.lever.co/empresa` | lever | `empresa` |
| `jobs.smartrecruiters.com/Empresa` | smartrecruiters | `Empresa` |
| `apply.workable.com/empresa` | workable | `empresa` |
| `empresa.wd5.myworkdayjobs.com/pt-BR/SiteDeVagas` | workday | `empresa.wd5.myworkdayjobs.com/SiteDeVagas` (sem o `pt-BR/`) |

Empresas com muita vaga de mainframe costumam ser consultorias de infraestrutura e
modernização, bancos, seguradoras, adquirentes e órgãos públicos/estatais. Muitos bancos
brasileiros publicam na Gupy, que já está coberta.

## Quanto custa

Cada chamada fica registrada em `uso_ia` e o total do mês aparece em **Perfil**. Estimativas:

| Tarefa | Modelo | Custo aproximado |
|---|---|---|
| Triagem de uma vaga | Claude Haiku 5.5 | ~US$ 0,0003 (50 vagas/dia ≈ US$ 0,50/mês) |
| Extrair vagas de um e-mail de alerta | Claude Haiku 5.5 | ~US$ 0,001 |
| Materiais de uma candidatura | Claude Opus 5.5 | ~US$ 0,10–0,20 |
| Importar o CV | Claude Opus 5.5 | ~US$ 0,05–0,10 |

Os modelos podem ser trocados pelas variáveis `MODELO_TRIAGEM` e `MODELO_ESCRITA`. Nas
chamadas do Opus está ligado o fallback no servidor (`fallbacks: "default"`): se o modelo
recusar a tarefa, a API tenta de novo em outro modelo automaticamente.

## Limites conhecidos

- **Gupy**: o endpoint público não é documentado oficialmente; se mudar de formato, a fonte
  aparece com erro no topo da tela de vagas e as outras continuam funcionando.
- **Alertas de e-mail** trazem só título, empresa e local. Para materiais melhores, abra a vaga
  e cadastre-a como "Vaga manual" colando a descrição.
- **SmartRecruiters e Workday** não trazem descrição na listagem, então essas vagas passam
  pela triagem só com o título.
- Cada rodada tria até 80 vagas e para antes do limite de 5 minutos da Vercel; o que sobrar
  fica "aguardando triagem" para a rodada seguinte.

## Próximas ideias

- **Resumo diário por e-mail ou Telegram** com as vagas novas de nota alta.
- **Mapa de mercado**: quais empresas mais abrem vagas de mainframe, faixas salariais
  observadas e as tecnologias mais pedidas, a partir do histórico.
- **Simulador de entrevista**: chat com perguntas técnicas (COBOL, CICS, DB2, JCL, performance,
  modernização) e comportamentais de liderança, com feedback.
- **Lembretes de follow-up** por e-mail no dia agendado.
- **Plano de estudos/certificações** a partir das lacunas que mais se repetem nas vagas
  (ex.: IBM Z, Zowe, DevOps para mainframe, cloud para modernização).
- **Ganchos para networking**: lista de recrutadores e líderes das empresas-alvo para
  abordar no LinkedIn (manualmente).
