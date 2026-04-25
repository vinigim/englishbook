# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run dev          # start dev server at localhost:3000
npm run build        # production build (type-check + compile)
npm run lint         # ESLint via next lint
```

There is no test suite. Type correctness is the primary static safety net — `npm run build` catches type errors.

For local Stripe webhook testing:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# use the whsec_... CLI secret as STRIPE_WEBHOOK_SECRET in .env.local
```

Cron routes can be called manually in dev without auth (no `CRON_SECRET` required locally):
```bash
curl http://localhost:3000/api/cron/release-holds
```

## Architecture

**EnglishBook** is a Next.js 15 App Router platform where students (`aluno`) book English lessons from teachers (`professor`) and pay via Stripe.

### Route structure

| Path prefix | Who | What |
|---|---|---|
| `/(auth)/` | Public | Login, signup, forgot-password |
| `/aluno/` | Students | Dashboard, booking, history, preferences |
| `/professor/` | Teachers | Dashboard, availability slots, agenda, profile |
| `/agendamento/` | Post-Stripe | Success and cancelled landing pages |
| `/api/checkout` | Server | Creates hold + Stripe Checkout Session |
| `/api/webhooks/stripe` | Stripe | Receives events, idempotency, confirms/cancels bookings |
| `/api/cron/*` | Vercel Cron | Automated maintenance tasks |
| `/auth/callback` | Supabase | Email confirmation / OAuth code exchange |

### Two-role system

Every user has a `profiles` row with `role: "aluno" | "professor"`. On signup the DB trigger `handle_new_user()` automatically creates either a `students` or `teachers` row.

Use `requireUser(role?)` from `src/lib/auth.ts` at the top of every protected Server Component page — it fetches the session, loads the profile, and redirects if the role doesn't match.

### Supabase client selection

Four clients exist — always pick the right one:

| Import | Use when |
|---|---|
| `src/lib/supabase/server.ts` | Server Components, Server Actions, Route Handlers that need auth context |
| `src/lib/supabase/client.ts` | Client Components (`"use client"`) |
| `src/lib/supabase/admin.ts` | API routes / webhooks that need to bypass RLS (uses `SERVICE_ROLE_KEY`) |
| `src/lib/supabase/middleware.ts` | Only used in `src/middleware.ts` for session refresh |

Never import `admin.ts` from client-side code.

### Atomic booking flow (the critical path)

The slot reservation is race-condition-proof because it runs entirely in Postgres:

1. Student POSTs `slot_id` to `/api/checkout`
2. API calls `hold_slot(slot_id, student_id, 15)` — Postgres function that uses `FOR UPDATE` to lock the slot row, validates availability, sets `status = 'pending'`, creates a `bookings` row with `status = 'pending_payment'`, returns `booking_id`
3. API creates a Stripe Checkout Session with `metadata.booking_id` and a 30-minute expiry
4. Stripe webhook `checkout.session.completed` → `confirm_booking(booking_id)` → slot `booked`, booking `confirmed`
5. Cron `release-holds` (every 5 min) calls `release_expired_holds()` to free slots whose 15-min hold expired

The three Postgres RPCs that mutate state are `hold_slot`, `confirm_booking`, and `cancel_booking` — all `security definer` functions in `0001_initial_schema.sql`.

### Webhook idempotency

Before processing any Stripe event, the webhook handler inserts `event.id` into `stripe_webhook_events` (PK = event id). Duplicate key error `23505` → return 200 immediately. On handler failure, the event row is deleted so Stripe can retry.

### Cron jobs

All three cron routes authenticate via `validateCronRequest()` from `src/lib/cron.ts`, which checks `Authorization: Bearer <CRON_SECRET>`. In dev without `CRON_SECRET` set, auth is skipped.

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/release-holds` | Every 5 min | Free expired holds, cancel orphaned `pending_payment` bookings, email affected students |
| `/api/cron/complete-past-bookings` | Hourly | Mark `confirmed` bookings past `scheduled_end_at` as `completed` |
| `/api/cron/daily-availability-email` | 11:00 UTC (08:00 BRT) | Send available-slots digest to students with opt-in |

### Email

Emails are sent via Resend (`src/lib/email/`). Sending functions in `send.ts` never throw — errors are caught and logged so a failing email never aborts a webhook or cron. Each email has a template file under `src/lib/email/templates/` that returns `{ subject, html, text }`.

### Key conventions

- All timestamps stored as `timestamptz` in UTC; display conversion happens at render time (default timezone `America/Sao_Paulo`)
- Prices are always in **cents** (`price_cents: integer`, currency `BRL`)
- Zod is used for request body validation in API routes
- `src/lib/utils.ts` contains `cn()` (clsx + tailwind-merge) for conditional class names
- `src/components/ui/` contains the design system primitives (Button, Card, Input, Badge, Container) — prefer these over raw HTML elements
- Route Handlers that need the raw request body (Stripe webhook) must set `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`

### Known intentional gaps

- No UI for students to cancel a paid booking (done manually by support)
- No "set new password" page (forgot-password flow sends the link, but `/reset-password` page was not built)
- No teacher notifications when a booking is made (could be added in the webhook handler)
- No admin dashboard
