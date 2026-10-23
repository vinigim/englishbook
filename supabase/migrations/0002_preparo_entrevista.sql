-- =====================================================================
-- Radar de Vagas Mainframe — preparo para entrevista
-- Rodar no SQL Editor do Supabase. Seguro para rodar de novo.
-- =====================================================================

-- =====================================================================
-- preparos_entrevista: roteiro gerado pela IA para uma vaga, em pt-BR e
-- inglês na mesma linha (conteudo = { pt: {...}, en: {...} })
-- =====================================================================
create table if not exists public.preparos_entrevista (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vaga_id uuid not null references public.vagas(id) on delete cascade,
  conteudo jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists preparos_entrevista_por_vaga
  on public.preparos_entrevista (vaga_id, created_at desc);

alter table public.preparos_entrevista enable row level security;
drop policy if exists "dono" on public.preparos_entrevista;
create policy "dono" on public.preparos_entrevista for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
