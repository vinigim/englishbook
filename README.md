# EnglishBook

Plataforma web onde alunos agendam aulas de inglês com professores. Pagamento via cartão efetiva o agendamento.

**Stack:** Next.js 15 (App Router) · Supabase (Postgres + Auth + RLS) · Stripe · Resend · Tailwind · Vercel.

---

## Setup local

```bash
npm install
cp .env.example .env.local
# preencha as variáveis em .env.local
npm run dev
```

### Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Stripe**: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- **Resend**: `RESEND_API_KEY`, `EMAIL_FROM` (ex: `"EnglishBook <no-reply@seudominio.com>"`)
- **App**: `NEXT_PUBLIC_APP_URL`, `CRON_SECRET` (string aleatória grande)

---

## Supabase

### Primeiro deploy

No SQL Editor do Supabase, rode as migrations **em ordem**:

1. `supabase/migrations/0001_initial_schema.sql` — schema inicial completo (tabelas, RLS, funções atômicas)
2. `supabase/migrations/0002_view_security_invoker.sql` — aplica `security_invoker` na view `student_monthly_lessons`
3. `supabase/migrations/0003_complete_past_bookings.sql` — função SQL que marca bookings passados como `completed`

### Auth

Em Authentication → URL Configuration:
- **Site URL**: `https://seu-dominio.com`
- **Redirect URLs**: adicione `https://seu-dominio.com/auth/callback`

---

## Stripe

### Produtos

Não usamos Products do Stripe — cada Checkout Session é criada com `price_data` inline a partir do preço do professor.

### Webhook

No Stripe Dashboard → Developers → Webhooks, criar endpoint:

- **URL**: `https://seu-dominio.com/api/webhooks/stripe`
- **Eventos**:
  - `checkout.session.completed`
  - `checkout.session.expired`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `payment_intent.payment_failed`

Copie o signing secret (`whsec_...`) para `STRIPE_WEBHOOK_SECRET`.

### Teste local

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Use o secret do CLI como `STRIPE_WEBHOOK_SECRET` em desenvolvimento.
Cartão de teste: `4242 4242 4242 4242`, qualquer CVC/data futura.

---

## Resend

1. Crie a conta e verifique um domínio em resend.com
2. Gere uma API key em Settings → API Keys
3. Configure `EMAIL_FROM` usando um endereço do domínio verificado

---

## Vercel — Deploy

### Crons

O arquivo `vercel.json` configura três crons automaticamente no deploy:

| Rota | Schedule | Função |
|---|---|---|
| `/api/cron/release-holds` | `*/5 * * * *` | A cada 5 min — libera slots presos em `pending` cujo hold expirou + manda e-mail |
| `/api/cron/complete-past-bookings` | `0 * * * *` | Hora em hora — marca bookings `confirmed` cujo `scheduled_end_at` já passou como `completed` |
| `/api/cron/daily-availability-email` | `0 11 * * *` | 11:00 UTC = 8:00 BRT — envia digest diário para alunos com opt-in |

Todos os crons exigem header `Authorization: Bearer <CRON_SECRET>`. A Vercel faz isso automaticamente quando `CRON_SECRET` está configurado nas env vars do projeto.

### Teste manual dos crons

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://seu-dominio.com/api/cron/release-holds
```

---

## Arquitetura do agendamento

O coração do sistema é o fluxo atômico de reserva:

1. Aluno clica em um slot disponível → `POST /api/checkout`
2. Backend chama `hold_slot(slot_id, student_id)` — função Postgres que **com `FOR UPDATE`** trava a linha, valida, muda slot para `pending` e cria booking `pending_payment`. Race conditions impossíveis: dois alunos simultâneos → só um vence
3. Backend cria Stripe Checkout Session com `metadata.booking_id` e redireciona
4. Stripe envia webhook `checkout.session.completed` → `confirm_booking(booking_id)` move slot para `booked` e booking para `confirmed`
5. Cron `release-holds` roda a cada 5 min e libera slots cujo hold (15min) expirou

### Idempotência de webhooks

Toda chamada de webhook insere `event.id` em `stripe_webhook_events` antes de processar. Tentativas repetidas do Stripe (duplicate key 23505) → retorna 200 sem reprocessar.

### Transição `confirmed → completed`

Cron `complete-past-bookings` roda hora em hora e atualiza bookings cuja aula já terminou. A função SQL `complete_past_bookings()` faz um único UPDATE atômico.

---

## Estrutura

```
src/
├── app/
│   ├── (auth)/            # login, signup, forgot-password
│   ├── agendamento/       # success/cancel páginas pós-Stripe
│   ├── aluno/             # área do aluno (dashboard, agendar, histórico, preferências)
│   ├── professor/         # área do professor (dashboard, disponibilidade, agenda, perfil)
│   ├── api/
│   │   ├── checkout/      # POST — cria hold + Checkout Session
│   │   ├── cron/          # 3 rotas de cron (auth via Bearer)
│   │   └── webhooks/
│   │       └── stripe/    # recebe eventos, valida assinatura, idempotência
│   └── auth/callback/     # troca code por session (confirmação de email, OAuth)
├── components/
│   ├── AppNav.tsx         # nav da área logada
│   ├── PublicNav.tsx      # nav pública
│   └── ui/                # Button, Card, Input, Badge, Container
└── lib/
    ├── auth.ts            # requireUser(role) helper
    ├── cron.ts            # validação Bearer
    ├── email/             # Resend client + templates
    ├── slots.ts           # agrupar por dia
    ├── bookings.ts        # agrupar por mês
    ├── supabase/          # clients (browser, server, admin, middleware)
    ├── stripe.ts
    ├── types.ts
    └── utils.ts
```

---

## O que **não** está neste projeto (por decisão de escopo)

- Cancelamento de aula paga pelo aluno pela UI — feito só pelo suporte
- Reset de senha (endpoint `/reset-password`) — fluxo de "esqueci senha" manda o link, mas a página de definir nova senha não foi criada
- Lembrete de aula próxima (1h antes, por ex.) — pode ser adicionado como novo cron
- Dashboard de admin / suporte
- Notificações para o professor quando uma aula é agendada — pode ser adicionado no webhook

---
