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
clínica, especialidade e cidade, e mostra o que entendeu antes de gravar.

Em desenvolvimento, `WHATSAPP_PROVIDER=mock` usa as conversas de exemplo em
`src/lib/whatsapp/fixtures/` — nenhum número real é tocado.

### 3. Conectar o WhatsApp (Evolution API)

A Evolution precisa de um servidor sempre ligado; a Vercel é serverless e não
sustenta o socket do WhatsApp. Uma VPS pequena resolve.

1. Suba o container da Evolution API na VPS.
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
| **Redação** | Sonnet 5 | Só em lead quente ou morno, ou no botão "Gerar mensagem" |

A triagem classifica estágio, temperatura, intenção, objeções e equipamento de
interesse. A redação escolhe a ação e escreve a mensagem.

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
- Conciliar automaticamente `rentals.wa_lead_id`; hoje há um `update`
  comentado no fim da migração para rodar depois do primeiro backfill.
