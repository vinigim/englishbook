# WhatsApp Prospector

Ferramenta para **upload de uma planilha de contatos** e **disparo de mensagens
personalizadas** (com o nome de cada lead) via **WhatsApp Cloud API oficial** da
Meta.

É um projeto **autocontido** — vive na pasta `whatsapp-prospector/` mas não tem
nenhuma relação com o resto do repositório EnglishBook. Você pode extrair para um
repositório próprio a qualquer momento (veja o fim deste README).

---

## O que ela faz

1. **Upload** de `.csv`, `.xlsx` ou `.xls`.
2. **Detecção automática das colunas** (nome, telefone, e-mail, empresa) — por
   nome do cabeçalho e por conteúdo (uma coluna que "parece telefone" é
   reconhecida mesmo sem cabeçalho claro).
3. **Normalização dos telefones** para o formato E.164 (ciente do padrão
   brasileiro: DDI, DDD e 9º dígito). Números inválidos são separados e pulados.
4. **Composição da mensagem** a partir de um template aprovado na Meta, com
   variáveis `{{1}}`, `{{2}}`… mapeadas para colunas (ex: `{{1}}` = primeiro nome).
5. **Preview** de como cada contato receberá a mensagem.
6. **Disparo automatizado** com controle de ritmo (intervalo configurável entre
   envios), barra de progresso ao vivo e **relatório em CSV** ao final.
7. **Modo simulação (dry run)** para testar todo o fluxo sem gastar envios reais.

---

## ⚠️ Regras importantes do WhatsApp (leia antes de usar)

A Cloud API **não** permite mandar texto livre para quem nunca te escreveu. Para
iniciar conversa você é obrigado a usar um **template pré-aprovado** pela Meta.
Além disso:

- Envie apenas para contatos que **consentiram** em receber sua mensagem (opt-in).
- Prospecção fria para números que nunca interagiram gera denúncias e pode
  **derrubar a qualidade/registro do seu número**.
- Sempre ofereça uma forma de **opt-out** ("responda SAIR para não receber mais").
- Respeite o intervalo entre envios (padrão 4s). Não existe número mágico seguro
  para spam — a ferramenta reduz risco, não elimina.

---

## Pré-requisitos na Meta (uma vez)

1. Crie um app em <https://developers.facebook.com/> e adicione o produto
   **WhatsApp**.
2. Em **WhatsApp → API Setup**, pegue:
   - **Phone number ID** (`WHATSAPP_PHONE_NUMBER_ID`) — não é o número em si.
   - **WhatsApp Business Account ID** (`WHATSAPP_BUSINESS_ACCOUNT_ID`).
   - Um **token de acesso**. O token temporário de 24h serve para testar; para
     produção crie um **System User Token** permanente.
3. Em **WhatsApp → Message Templates**, crie e **aprove** um template de
   marketing/utilidade com variável de corpo, ex:

   ```
   Olá {{1}}! Aqui é da [Sua Empresa]. Podemos te enviar mais informações?
   ```

   Anote o **nome** do template (ex: `prospeccao_inicial`) e o **idioma**
   (ex: `pt_BR`) — você vai informá-los na tela de composição.

---

## Rodando localmente

```bash
cd whatsapp-prospector
npm install
cp .env.example .env.local   # preencha as credenciais
npm run dev                  # abre em http://localhost:3100
```

O app roda na porta **3100** (para não conflitar com o EnglishBook na 3000).

### Variáveis de ambiente (`.env.local`)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | sim | Token de acesso da Cloud API |
| `WHATSAPP_PHONE_NUMBER_ID` | sim | ID do número (não o número) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | não | Necessário só para listar templates |
| `WHATSAPP_API_VERSION` | não | Padrão `v21.0` |
| `SEND_DELAY_MS` | não | Intervalo entre envios (padrão 4000) |

> Sem credenciais você ainda consegue usar o **modo simulação (dry run)** para
> testar upload, detecção de colunas e preview.

---

## Como funciona por dentro

```
src/
  app/
    page.tsx                 UI: wizard (upload → colunas → mensagem → disparo)
    api/parse/route.ts       lê a planilha e detecta colunas
    api/templates/route.ts   lista templates aprovados na Meta
    api/send/route.ts        dispara em stream (NDJSON) com intervalo
  lib/
    spreadsheet.ts           parsing de csv/xlsx (SheetJS)
    columns.ts               detecção de papel das colunas
    phone.ts                 normalização E.164 (libphonenumber-js)
    message.ts               1º nome + render de {{n}} para preview
    whatsapp.ts              cliente da Cloud API (enviar / listar templates)
```

O envio é **sequencial e transmitido**: a rota `/api/send` devolve uma linha
JSON por contato conforme processa, então a UI mostra o progresso em tempo real
sem esperar terminar tudo.

---

## Extrair para um repositório próprio

Quando quiser tirar daqui:

```bash
# a partir da raiz do englishbook
cp -r whatsapp-prospector /caminho/para/novo-projeto
cd /caminho/para/novo-projeto
git init && git add . && git commit -m "init whatsapp-prospector"
```

Como a pasta já tem `package.json`, `tsconfig.json`, configs próprias e não
importa nada do EnglishBook, ela funciona isolada sem ajustes.

---

## Limitações conhecidas (v1)

- Sem banco de dados: o estado vive na sessão do navegador. Recarregar perde o
  progresso (o relatório CSV é a forma de persistir resultados).
- Sem retry automático de mensagens que falharam (o CSV mostra o erro; reenvie
  filtrando a planilha).
- Um número de origem por vez (o configurado no `.env`).
- Sem agendamento — o disparo roda enquanto a aba estiver aberta.
