# Lux Derma

App interno da Lux Derma — aluguel de lasers para médicos e clínicas.

Duas áreas, atrás do mesmo login:

- **Agenda** (`/derma-lux`) — equipamentos, aluguéis, disponibilidade e fechamentos,
  com sincronização em tempo real entre aparelhos.
- **Radar de Leads** (`/derma-lux/leads`) — lê as conversas do WhatsApp da empresa,
  agrupa por lead, cruza com o histórico de aluguéis e sugere que tipo de mensagem
  mandar para cada um, com rascunho pronto.

Next.js 15 (App Router) + Supabase + Claude API. Deploy na Vercel.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha as chaves do Supabase
npm run dev                  # http://localhost:3000
```

`npm run build` é a única verificação estática do projeto: não há suíte de testes e o
`npm run lint` não tem configuração. Rode o build antes de cada commit.

Em desenvolvimento, `WHATSAPP_PROVIDER=mock` usa as conversas de exemplo em
`src/lib/whatsapp/fixtures/` — nenhum número real é tocado.

## Banco de dados

As migrações ficam em `supabase/migrations/` e são aplicadas **à mão no SQL Editor do
Supabase**, em ordem. O projeto não usa a CLI do Supabase.

| Arquivo | O que é |
|---|---|
| `0001`–`0003` | Legado do EnglishBook. **Não rode em banco novo** — veja o aviso no topo do `0001`. |
| `0004`–`0009` | Agenda: equipamentos, aluguéis, campos extras, fechamentos |
| `0010` | Radar de Leads |

## Colocar o Radar de Leads no ar

Passo a passo completo em [`src/app/derma-lux/LEADS.md`](src/app/derma-lux/LEADS.md),
incluindo o risco de banimento do número e as notas de LGPD. Resumo:

1. Rodar `supabase/migrations/0010_whatsapp_leads.sql`.
2. Liberar o seu acesso — sem isso o painel abre vazio:
   ```sql
   insert into public.lux_staff (user_id, email)
   select id, email from auth.users where email = 'SEU-EMAIL-DO-LOGIN';
   ```
3. Importar a planilha de clientes em `/derma-lux/leads/importar`. Já funciona sem
   WhatsApp nenhum.
4. Preencher `ANTHROPIC_API_KEY` para ligar as sugestões (~US$ 2/mês para 300 leads).
5. Conectar o WhatsApp: subir a Evolution API numa VPS, ler o QR com um chip dedicado
   ao comercial, preencher as variáveis `EVOLUTION_*` e apontar o webhook para
   `https://<dominio>/api/whatsapp/webhook?s=<WHATSAPP_WEBHOOK_SECRET>`.

## Contas

Usuários são criados pelo painel do Supabase (Authentication → Users), não pelo app —
não existe cadastro público. A recuperação de senha também parte de lá; o app só recebe
o link de volta em `/auth/callback`.

## Histórico

O repositório começou como **EnglishBook**, uma plataforma de aulas de inglês sem
relação com este negócio. Aquele app foi removido; as tabelas dele continuam paradas no
Supabase, sem nada lendo ou escrevendo.
