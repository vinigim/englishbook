# CLAUDE.md

## Commands

```bash
npm install
npm run dev     # localhost:3000
npm run build   # the only static check (type-check + compile); run after every change
```

No test suite and no lint config.

## Architecture

Next.js 15 App Router + Supabase (Postgres + auth) + Anthropic SDK. UI and code identifiers
are pt-BR. Single-owner app: accounts are created in the Supabase dashboard; every table has
RLS `user_id = auth.uid()`.

- `src/lib/busca.ts` — one search round per user: collect → pre-filter (`filtro.ts`) →
  dedupe by normalized title+company (`vagas.chave`, unique per user) → AI triage of pending
  rows. Each source fails independently and reports into `execucoes_busca.resumo`.
- `src/lib/fontes/` — `gupy.ts` (public portal API, undocumented — parse defensively),
  `ats.ts` (Greenhouse/Lever/SmartRecruiters/Workable/Workday public JSON), `gmail.ts`
  (IMAP + app password, reads job-alert e-mails; processed ids in `emails_processados`).
  LinkedIn/Indeed/Glassdoor/Catho are only ever read through alert e-mails — never scrape them.
- `src/lib/ai/` — `triagem.ts` and `extracao-email.ts` use `MODELO_TRIAGEM` (Haiku 5.5);
  `materiais.ts` and `importar-cv.ts` use `MODELO_ESCRITA` (Opus 5.5) with
  `fallbacks: "default"`. All use structured outputs via zod. Every call goes through
  `registrarUso()` (prices in `cliente.ts`).
- The SDK sends zod enums only as a description hint, so enum-like fields are `z.string()`
  and normalized in code (`normalizarTriagem`).
- Extracted e-mail URLs are kept only if they literally appear in the e-mail text.
- "+ Vaga manual" fills its fields from the pasted link: `POST /api/vagas/extrair` →
  `fontes/link.ts` (public http(s) only, private IPs rejected on every redirect; LinkedIn,
  Indeed, Glassdoor and Catho refused) reads JSON-LD `JobPosting` first, then public Notion
  pages through Notion's undocumented `loadPageChunk`, then page text; `ai/extracao-link.ts`
  only calls Haiku when the JSON-LD is missing or thin. Nothing is saved until the user clicks Salvar.
- Interview prep (`ai/entrevista.ts`, `POST /api/vagas/[id]/entrevista`, table
  `preparos_entrevista` from `0002`): Opus writes one script in `pt` and `en` in a single call
  (`conteudo = { pt, en }`, same shape), from the CV, `perfil.resumo_profissional`, the job and the
  candidatura timeline. The vaga page reads it with `maybeSingle()`, so a missing table just shows nothing.
- The AI must never invent CV facts; the tailored CV is stored as a `cvs` row (`base = false`)
  so `/cv/imprimir/[id]` prints both.
- No auto-apply, on purpose (ToS / account bans).

Cron: `vercel.json` → `GET /api/cron/buscar` with `Authorization: Bearer $CRON_SECRET`, service
role, `maxDuration = 300`; triage stops at 240 s and leaves the rest pending.

## Conventions

- Migrations in `supabase/migrations/`, applied by hand in the SQL Editor, safe to re-run.
- Server Actions in `src/app/actions.ts` return `ActionResult`, validate with zod, end with
  `revalidatePath()`. Uploads go through Route Handlers (`/api/cv/importar`).
- Route Handlers: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, errors as
  `{ error: "snake_case" }`, logs prefixed `[route-name]`.
