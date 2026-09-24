# Radar de Leads — WhatsApp + IA

Painel que lê as conversas do WhatsApp da empresa, agrupa por lead (médico ou
clínica), cruza com o histórico de locações da agenda e **recomenda que tipo de
mensagem mandar para cada um, com um rascunho pronto** para revisar e copiar.

Roda em `/derma-lux/leads`, atrás do mesmo login do resto do app.

**Escopo desta versão: recomendar.** O envio sai pelo seu WhatsApp, via link
`wa.me` — o sistema não dispara mensagem sozinho. Isso é deliberado; veja
"Risco de banimento" abaixo.

## Estrutura

```
src/app/derma-lux/
  leads-types.ts      Tipos (Lead, WaMessage, LeadAnalysis)
  leads-shared.ts     Prioridade, formatação de telefone, rótulos
  leads-data.ts       Leitura (Server Components)
  leads-actions.ts    Server Actions (reanalisar, editar, arquivar)
  (app)/leads/        Caixa de entrada, detalhe do lead, importação

src/lib/leads/        Telefone, planilha, detecção de colunas, taxonomia
src/lib/whatsapp/     Adaptador de provedor + ingestão + fixtures
src/lib/ai/           Prompt, schemas, custo e pipeline de análise

src/app/api/whatsapp/webhook    Mensagens novas
src/app/api/whatsapp/backfill   Histórico (NDJSON, retomável)
src/app/api/leads/import        Planilha (multipart)
src/app/api/leads/analyze       Análise em lote

supabase/migrations/0010_whatsapp_leads.sql
```

## Como colocar para funcionar

### 1. Banco

Rode `supabase/migrations/0010_whatsapp_leads.sql` no SQL Editor do Supabase.

**Passo obrigatório em seguida** — libere o seu acesso:

```sql
insert into public.lux_staff (user_id, email)
select id, email from auth.users where email = 'seu-email@exemplo.com'
on conflict (user_id) do nothing;
```

Sem isso o painel abre vazio. E é de propósito: veja "Por que o RLS é
diferente aqui".

### 2. Começar sem o WhatsApp

Dá para usar o painel imediatamente, só com a sua planilha de clientes:
`/derma-lux/leads/importar`. Ela detecta sozinha as colunas de telefone, nome,
clínica, especialidade, cidade e Instagram, e mostra o que entendeu antes de
gravar.

Qualquer outra coluna é guardada inteira em `extra` e aparece na ficha do lead
— nada da planilha é descartado.

Em desenvolvimento, `WHATSAPP_PROVIDER=mock` usa as conversas de exemplo em
`src/lib/whatsapp/fixtures/` — nenhum número real é tocado.

### 3. Conectar o WhatsApp (Evolution API)

A Evolution precisa de um servidor sempre ligado; a Vercel é serverless e não
sustenta o socket do WhatsApp.

**Configurando pelo celular?** Só este passo exige um servidor, e é o único da
lista que normalmente pediria terminal e SSH — coisa ruim de fazer no telefone.
Duas saídas, ambas pelo navegador:

- **Plataforma com deploy por imagem Docker** (Railway, Render e similares):
  você aponta para a imagem da Evolution API, define as variáveis na interface
  e ela sobe. Sem SSH em momento nenhum.
- **Provedor hospedado** (Z-API, UazAPI): não tem servidor nenhum para
  administrar — cria a instância, lê o QR e pronto. Custa mais por mês e exige
  um adaptador novo em `src/lib/whatsapp/`, que é barato de escrever porque a
  interface já está pronta.

Ler o QR Code é naturalmente uma tarefa de celular, então essa parte não muda.

1. Suba a Evolution API (VPS, plataforma Docker ou provedor hospedado).
2. Crie a instância e leia o QR Code **com um chip dedicado ao comercial**,
   não com o celular pessoal.
3. Preencha no `.env`: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`,
   `EVOLUTION_INSTANCE`, `WHATSAPP_WEBHOOK_SECRET` e `WHATSAPP_PROVIDER=evolution`.
4. Configure o webhook da instância apontando para
   `https://<seu-dominio>/api/whatsapp/webhook?s=<WHATSAPP_WEBHOOK_SECRET>`,
   marcando os eventos de mensagem **enviada e recebida** (o "enviada" é o que
   captura as respostas que a equipe manda pelo celular).
5. No painel, clique em **Sincronizar histórico** para trazer as conversas
   antigas. É retomável: se der timeout, clique de novo que continua de onde
   parou.

### 4. Ligar a IA

Preencha `ANTHROPIC_API_KEY`. Sem ela o painel funciona normalmente, só não
gera sugestões.

## Como a análise funciona

Dois níveis, para não gastar à toa:

| | Modelo | Quando roda |
|---|---|---|
| **Triagem** | Haiku 4.5 | Em todos os leads pendentes |
| **Redação** | Sonnet 5 (escolhível) | Só em lead quente ou morno, ou no botão "Gerar mensagem" |

A triagem classifica estágio, temperatura, intenção, objeções e equipamento de
interesse. A redação escolhe a ação e escreve a mensagem.

**Quem escreve dá para escolher por clique.** Na ficha do lead, um seletor
oferece Haiku 4.5, Sonnet 5 e Opus 5 (`src/lib/ai/models.ts`), cada um com a
estimativa em dólares de uma reanálise — calculada sobre o que as últimas 200
análises de fato gastaram, não sobre preço de tabela.

A escolha **vale só para aquele clique** e não é gravada em lugar nenhum: o
botão de analisar em lote continua no padrão, então não existe jeito de a
fatura crescer por uma opção esquecida ligada. A triagem nunca muda — ela roda
em todo mundo e custa quase nada.

O valor vem do navegador, então é validado contra a lista antes de virar o
`model` de uma chamada paga. Modelo fora de `cost.ts` é recusado: sem preço, a
análise gravaria custo zero, e número errado num relatório de fatura é pior que
número ausente.

**Cache por hash.** Antes de chamar a API, o sistema calcula um hash da
conversa + dados do lead + versão do prompt. Se já existe análise com aquele
hash, ela é reaproveitada e não se paga nada. Mudar `PROMPT_VERSION` em
`src/lib/ai/prompt.ts` invalida tudo de propósito.

**Cache de prompt.** O bloco estável (perfil da empresa, catálogo de
equipamentos, taxonomia, regras de tom) leva `cache_control` e vem antes do
contexto volátil. Numa rodada em lote, só a primeira análise paga por ele.

**Custo.** Cerca de US$ 0,002 por triagem e US$ 0,013 por rascunho. Para 300
leads por mês, metade recebendo rascunho, dá algo como **US$ 2 (~R$ 12)**. Toda
análise grava modelo, tokens e custo em `wa_lead_analyses`, e o total aparece no
topo da caixa de entrada — você não vai ser surpreendido pela fatura.

**A prioridade da lista não é da IA.** É uma fórmula em
`src/app/derma-lux/leads-shared.ts`, determinística e conferível: temperatura,
estágio, se o lead falou por último sem ser respondido, e há quanto tempo.

## Por que o RLS é diferente aqui

As tabelas do derma-lux (`rentals`, `equipment`, `blocks`) usam
`to authenticated using (true)` — qualquer usuário logado lê tudo.

**As tabelas de leads não fazem isso.** Estas conversas contêm dado sensível de
saúde (LGPD, art. 11), e o critério aqui é mais estrito por dois motivos:

1. Este projeto do Supabase carrega **contas antigas do EnglishBook**, o app que
   existia neste repositório antes. Elas continuam conseguindo autenticar. O
   cadastro público foi removido junto com aquele app, mas quem já tinha conta
   continua tendo.
2. Mesmo entre logins legítimos da empresa, faz sentido que acesso à carteira de
   clientes seja uma decisão explícita, não um efeito colateral de ter login.

Por isso o acesso é por allowlist (`lux_staff`), e cada pessoa entra nela à mão.
Vale considerar estender o mesmo a `rentals`, `equipment` e `blocks` depois.

## Deduplicação por telefone

O WhatsApp devolve números brasileiros antigos **sem o 9º dígito**
(`553588887777`), enquanto a planilha quase sempre traz ele
(`5535988887777`). Se a chave fosse o telefone como veio, o mesmo médico
viraria dois leads com a conversa dividida ao meio.

`waPhoneKey()` em `src/lib/leads/phone.ts` normaliza isso, e o `unique` do
banco é nessa chave.

## Instagram

A planilha de prospecção traz o Instagram escrito de todo jeito: `@fulana`,
`fulana`, `instagram.com/fulana`, o link inteiro com o `?igshid=` que o app
cola junto. `toInstagramHandle()` em `src/lib/leads/instagram.ts` reduz tudo ao
handle, e só o handle é guardado (`wa_leads.instagram`, migração 0015) — o link
do direct é montado na hora.

O que não dá para afirmar que é um perfil (`não tem`, `-`, o link de um post,
um endereço de site) vira `null` e **volta para `extra`**, em vez de sumir: a
ficha continua mostrando o valor como a planilha escreveu.

O botão "Abrir no Instagram" usa `ig.me/m/<handle>`, o equivalente do `wa.me`.
A diferença é que ele **não aceita o texto da mensagem na URL** — por isso o
clique copia o rascunho para a área de transferência no mesmo gesto.

Leads importados antes da 0015 não precisam de reimportação: quando a coluna
está vazia, a tela procura o Instagram entre as colunas extras.

### Sincronização do direct (parada: depende da revisão da Meta)

**Estado atual:** o código existe, mas os botões foram tirados do radar. Com o
app em modo desenvolvimento, a Meta aceita o token e responde, mas devolve
**zero conversas** — em todas as variantes da consulta, inclusive com um perfil
testador conversando com a conta. Ler o direct exige o acesso avançado de
`instagram_business_manage_messages`, que passa pela revisão do app, e o dono
decidiu não fazer. Para religar depois da revisão: devolver os botões de
`InboxActions.tsx` (commit "Radar: sincronizar o direct do Instagram…" e o do
diagnóstico com variantes) — a rota e a biblioteca continuam no lugar.

O que o código faz: lê o direct do @luxderma.lasers pela API oficial da Meta
(Instagram API com login do Instagram; app "Lux Derma Radar", portfólio
luxderma.lasers). Código em `src/lib/instagram/` e `/api/instagram/sync`.

- **Onde cai:** em `wa_messages`, com `provider = 'instagram'` e
  `chat_id = 'ig:<id da pessoa>'`. A conversa é colada no lead cujo
  `wa_leads.instagram` é o @ da pessoa. Perfil que não é de nenhum lead **não**
  cria lead (lead nasce de telefone) — a tela lista essas conversas para o dono
  pôr o @ no lead certo. Dois leads com o mesmo @ também ficam de fora.
- **Datas:** resposta dele vai para `last_inbound_at` (e marca
  `needs_analysis`); mensagem nossa vai para `instagram_sent_at`, a mesma
  coluna do botão manual.
- **Limite da Meta:** só as 20 mensagens mais recentes de cada conversa.
- **Incremental:** `ig_conta.ultima_sync_em` (migração 0018) guarda a última
  leitura completa; a próxima para na primeira conversa mais velha que ela.
  "Reler Instagram" ignora a marca.
- **Sem estado no servidor:** cada chamada devolve o cursor `after` e a tela
  encadeia, como no "Analisar pendentes".
- **Token:** `INSTAGRAM_ACCESS_TOKEN` na Vercel, 60 dias. Cada sincronização o
  renova (a partir de 3 dias de idade) e guarda o novo em `ig_conta`, que tem
  RLS sem policy — só o service role lê. Trocar a variável na Vercel invalida o
  guardado (compara um hash). Basta sincronizar pelo menos uma vez a cada 60
  dias.
- **Sem tempo real:** o webhook da Meta exige o app publicado, o que passa por
  revisão. Por isso a leitura é sob demanda.
- "Testar Instagram" mostra a conta conectada e a resposta crua das 3 conversas
  mais recentes, sem gravar nada.

### "Já enviei pelo Instagram" continua existindo

Mensagem que sai pelo WhatsApp **volta** na sincronização: o `last_outbound_at`
do lead se atualiza sozinho e o painel sabe. Pelo direct, até a migração 0018,
não volta nada enquanto a sincronização estiver parada (ver acima).

Por isso `wa_leads.instagram_sent_at` (migração 0016) nasceu como um botão
na ficha, e não como um evento. O botão fica: marca na hora, sem sincronizar. É data e não booleano porque "mandei há três
meses e não respondeu" é outra situação que "mandei ontem".

O clique em "Abrir no Instagram" **não** marca sozinho: abrir não é enviar, e um
lead marcado por engano some da fila sem nunca ter recebido nada.

A marca entra no contexto da IA junto com o handle — sem ela o modelo lê um lead
já abordado como alguém com quem nunca se falou, e volta a sugerir primeiro
contato.

### De quem é a bola

`estadoContato(lead)` (em `leads-shared.ts`) reduz o lead a um de três estados
**excludentes** — todo lead está em exatamente um, e a soma dos três chips fecha
com o total da carteira:

| Estado | Quando | O que aparece no card |
|---|---|---|
| `devo_responder` | ele falou por último | selo `responder ele` |
| `aguardando_ele` | a última saída foi nossa (WhatsApp ou Instagram) | `✓ mandei no <canal> há N dias` |
| `nunca_abordado` | nenhuma saída registrada | nada — a ausência é o sinal |

A regra do `devo_responder` é a mesma de sempre, agora num lugar só: ela estava
copiada na lista, no `priorityScore` e no prompt da IA, e as três cópias tinham
de concordar para a tela não mentir.

**Cópia do rascunho e clique em "Abrir no WhatsApp" não contam como envio.**
Abrir o app não é ter enviado, e foi decisão do dono que só o fato conte. O preço
é o atraso: mensagem mandada pelo WhatsApp só entra no painel quando volta do
celular, em "Sincronizar histórico". A ficha avisa isso em quem está como
`nunca_abordado` e tem telefone — sem o aviso, o primeiro lead abordado e ainda
não sincronizado parece defeito. No Instagram vale o botão manual.

"Ele falou por último" compara `last_inbound_at` com a nossa saída mais recente
por **qualquer** canal (`last_outbound_at` ou `instagram_sent_at`). Sem isso,
uma resposta dada no direct deixava o lead em "Devo responder".

O chip da barra ainda se chama `aguardando_resposta` no código — é o `id`
original, usado como chave de `Record` em vários pontos. O rótulo na tela virou
**"Devo responder"** porque "Esperando resposta" dizia o contrário do que o
filtro faz.

## Privacidade

- **Mídia não é baixada.** Guardamos url e mimetype; o binário nunca entra no
  Storage nem é enviado à IA. Foto de paciente armazenada é um problema de
  compliance que este projeto não precisa ter.
- Na transcrição enviada ao modelo, mídia vira rótulo (`[imagem]`,
  `[áudio]`), e o prompt proíbe explicitamente repetir qualquer identificação
  de paciente.
- Vale limpar `wa_messages.raw` e `wa_webhook_events` com mais de 90 dias — é
  onde o payload bruto se acumula.

## Risco de banimento

A Evolution API não é oficial e contraria os termos da Meta. Onde isso morde:

- **Ler é quase sem risco.** Um número que só recebe e sincroniza tem perfil de
  uso igual ao de um humano.
- **Enviar em volume é o que derruba número.** Por isso `sendText()` existe no
  adaptador mas **não tem botão no painel**: a mensagem sai pelo `wa.me`, ou
  seja, pelo seu WhatsApp de verdade.
- **Use um chip dedicado.** Se o número cair, você perde o número comercial e o
  histórico junto — e o banco passa a ser a sua cópia de segurança dele.

## Testar sem número real

```bash
# entrega normal
curl -X POST "http://localhost:3000/api/whatsapp/webhook?s=$WHATSAPP_WEBHOOK_SECRET" \
  -H "content-type: application/json" \
  --data @src/lib/whatsapp/fixtures/messages-upsert.json

# a mesma chamada de novo -> {"received":true,"duplicate":true}
# segredo errado -> 401
```

No SQL Editor:

```sql
select count(*) from public.wa_leads;
select direction, count(*) from public.wa_messages group by direction;
select version, temperature, recommended_action, model, cost_usd
  from public.wa_lead_analyses order by created_at desc limit 10;
select sum(cost_usd) from public.wa_lead_analyses;
```

O teste de RLS que mais importa: entre com uma conta que **não** esteja em
`lux_staff` — por exemplo uma das contas antigas do EnglishBook — e tente
`supabase.from("wa_messages").select("*")` no navegador. Tem que voltar vazio.

## O que ficou para depois

- Enviar pelo painel (`wa_outbound.channel = 'api'` + `provider.sendText`).
- Follow-up automático: o campo `snoozed_until` e um cron já estão previstos,
  mas **`vercel.json` não existe neste repo**, então hoje nenhum cron roda em
  produção. O arquivo foi apagado quando os crons do EnglishBook bloqueavam o
  deploy no plano Hobby; com aquele app removido, os 2 slots do Hobby estão
  livres.
- ~~Conciliar automaticamente `rentals.wa_lead_id`~~ — feito na 0014: a
  conciliação virou a função `conciliar_rentals()`, chamada ao fim de cada
  backfill.
