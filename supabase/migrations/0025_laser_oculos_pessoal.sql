-- ============================================================================
--  Lux Derma — Código pessoal do óculos Even G2
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  POR QUE
--
--  O código por locação (0024) foi pensado para o médico que aluga: vale só
--  perto do dia e mostra só as consultas daquela locação. Quem usa o óculos é
--  o dono, que quer ver as consultas recentes, com ou sem locação, sem gerar
--  um código a cada aluguel. Este é um código fixo por usuário do painel.
--  Gerar de novo troca o código; apagar a linha corta o acesso.
-- ============================================================================

create table if not exists public.laser_oculos_pessoal (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  -- Mesmo formato do código por locação: oito caracteres sem 0/O/1/I/L.
  codigo            text not null unique check (codigo ~ '^[A-HJKMNP-Z2-9]{8}$'),
  criado_em         timestamptz not null default now(),
  ultimo_acesso_em  timestamptz
);

-- ============================================================================
--  Segurança (RLS) — cada um só vê e troca o próprio código, e só se estiver
--  no lux_staff. A rota pública do óculos lê com a service role.
-- ============================================================================
alter table public.laser_oculos_pessoal enable row level security;

drop policy if exists "laser_oculos_pessoal_dono" on public.laser_oculos_pessoal;
create policy "laser_oculos_pessoal_dono"
  on public.laser_oculos_pessoal for all to authenticated
  using (
    user_id = auth.uid()
    and exists (select 1 from public.lux_staff s where s.user_id = auth.uid())
  )
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.lux_staff s where s.user_id = auth.uid())
  );
