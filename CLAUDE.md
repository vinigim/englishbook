# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run dev          # start dev server at localhost:3000
npm run build        # production build (type-check + compile)
```

There is no test suite, and **`npm run lint` has no config** (no `.eslintrc*` exists, so
`next lint` drops into interactive setup). **`npm run build` is the only static safety
net** — run it after every change.

## Architecture

**Lux Derma** is a Next.js 15 App Router app for a Brazilian company that rents medical
lasers to doctors and aesthetic clinics. It has two areas, both behind the same login:

| Path | What |
|---|---|
| `/derma-lux` | Rental agenda: equipment, rentals, availability, schedule blocks |
| `/derma-lux/leads` | Radar de Leads — WhatsApp conversations analyzed by AI |

`/` redirects to `/derma-lux` (`next.config.mjs`). UI language is pt-BR throughout.

> The repo began as **EnglishBook**, an unrelated English-lesson booking platform. That
> app was removed. Its tables still exist in Supabase but nothing reads them — see
> `supabase/migrations/0001_initial_schema.sql` for the details and the one live
> leftover (the `handle_new_user()` trigger).

### Auth

Plain "any authenticated user" — there are no roles. `src/app/derma-lux/(app)/layout.tsx`
calls `supabase.auth.getUser()` and redirects to `/derma-lux/login` when absent. Server
Actions repeat the check via a local `requireSupabase()` helper.

`src/middleware.ts` → `updateSession()` only refreshes the session cookie. It guards
nothing, but must keep running or sessions expire mid-use. Its matcher excludes
`api/webhooks` and `api/whatsapp`, which authenticate themselves.

Accounts are created from the Supabase dashboard, not from the app. Password recovery is
also triggered there; `/auth/callback` exchanges the emailed code for a session.

### Supabase client selection

| Import | Use when |
|---|---|
| `src/lib/supabase/server.ts` | Server Components, Server Actions, Route Handlers |
| `src/lib/supabase/client.ts` | Client Components (`"use client"`) |
| `src/lib/supabase/admin.ts` | Route Handlers that must bypass RLS (`SERVICE_ROLE_KEY`) |
| `src/lib/supabase/middleware.ts` | Only `src/middleware.ts` |

Never import `admin.ts` from client-side code.

⚠️ `config.ts` has the project URL and anon key **hardcoded as fallbacks**, but
`admin.ts` reads `process.env.NEXT_PUBLIC_SUPABASE_URL!` directly. If that env var is
unset, the browser/server clients silently work and only the admin paths break — at
runtime, never at build.

### Radar de Leads

Full documentation in `src/app/derma-lux/LEADS.md`. The short version:

1. **Ingest** — `/api/whatsapp/webhook` (new messages) and `/api/whatsapp/backfill`
   (history, NDJSON, resumable). Both funnel through `src/lib/whatsapp/ingest.ts`.
2. **Provider adapter** — `src/lib/whatsapp/provider.ts` is the interface;
   `evolution.ts` talks to a self-hosted Evolution API; `mock.ts` replays fixtures
   through the *same parser*, so tests exercise production code.
3. **Analyze** — `src/lib/ai/lead-analysis.ts`. Haiku triages every lead, Sonnet drafts
   the message only for hot/warm leads or on demand.
4. **Suggest** — the lead page shows the draft with a copy button and a `wa.me` link.

Sending is deliberately **not** wired to the UI. `provider.sendText()` exists but no
button calls it: bulk sending through an unofficial provider is what gets numbers
banned, so messages go out through the owner's own WhatsApp.

### Two caching layers in the AI pipeline (this is the owner's money)

- **Content hash** — `contentHash()` hashes the transcript + lead data + `PROMPT_VERSION`.
  A matching row in `wa_lead_analyses` is reused with no API call. Bumping
  `PROMPT_VERSION` in `src/lib/ai/prompt.ts` invalidates everything on purpose.
- **Prompt cache** — the stable system block carries `cache_control` and precedes the
  volatile context, so in a batch only the first analysis pays for it. Keep the
  equipment catalog sorted deterministically or the prefix breaks.

Every analysis records model, tokens and `cost_usd`. Prices live in `src/lib/ai/cost.ts`.

### Database

Migrations are numbered `NNNN_snake_case.sql` and **applied by hand in the Supabase SQL
Editor** — there is no Supabase CLI setup and no `config.toml`.

`0004`–`0009` are the agenda. `0010` is the Radar. `0001`–`0003` are dead EnglishBook
schema kept as documentation.

Style (follow `0004` and `0010`): `create table if not exists public.x`,
`gen_random_uuid()`, `text + check (...)` instead of new enums, `drop policy if exists`
before `create policy`, realtime registration inside a
`do $$ ... exception when duplicate_object then null` block, Portuguese comments with
`-- ===` banners. Everything must be safe to re-run.

**RLS differs between the two areas, on purpose:**

- Agenda tables (`rentals`, `equipment`, `blocks`) use `for all to authenticated using (true)`.
- Lead tables use an allowlist — `exists (select 1 from lux_staff where user_id = auth.uid())`.
  They hold WhatsApp conversations that can contain patient data (LGPD art. 11), and the
  Supabase project is shared with legacy accounts. New rows in `lux_staff` are inserted
  manually.

### Key conventions

- Timestamps are `timestamptz` in UTC; display converts at render time (`America/Sao_Paulo`)
- Agenda prices are `numeric(10,2)` in BRL (note: **not** cents)
- Zod validates every Route Handler body and Server Action input
- Server Actions return `ActionResult = { ok: boolean; error?: string }`, use
  `parsed.error.issues[0]?.message`, and end with `revalidatePath()`
- Route Handlers: `export const runtime = "nodejs"`, `export const dynamic = "force-dynamic"`,
  errors as `NextResponse.json({ error: "snake_case" }, { status })`, logs prefixed `[route-name]`
- `src/components/ui/` holds Button, Card, Badge, Alert, Input, Container — prefer these.
  There is no Table, Select, Textarea, Modal or Tabs; modals are hand-rolled per feature
  (see `RentalModal.tsx`). `Alert` lives inside `Badge.tsx`.
- `src/lib/utils.ts` has only `cn()`. Formatting helpers are per-area: `shared.ts` for the
  agenda, `leads-shared.ts` for the Radar.
- Server Actions are capped at 2 MB (`next.config.mjs`), so file uploads must go through a
  Route Handler with `formData()`

### Known gaps

- **No `vercel.json`, so no cron runs in production.** It was deleted when the
  EnglishBook crons blocked a Hobby-plan deploy. Creating it is a prerequisite for
  automatic follow-up; Hobby allows 2 crons at daily granularity.
- No password-reset page — recovery is triggered from the Supabase dashboard
- No way to send a WhatsApp message from the panel (deliberate, see above)
