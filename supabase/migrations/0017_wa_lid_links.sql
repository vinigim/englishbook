-- ============================================================================
--  Lux Derma — vincular à mão uma conversa por LID a um lead
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  O PROBLEMA
--
--  O WhatsApp passou a endereçar muitos contatos por LID, um id interno que
--  não é telefone. A sincronização só liga uma conversa por LID a um lead
--  quando descobre o telefone por trás dele — pelo `remoteJidAlt` de alguma
--  mensagem ou pelo nome na agenda. Um contato que nunca respondeu, ou uma
--  empresa atendida pelo serviço da Meta, não dá nenhuma das duas pistas, e a
--  versão da Evolution em uso não devolve o LID a partir do telefone.
--
--  Resultado: a conversa existe no WhatsApp, chega ao servidor, e o lead da
--  planilha continua "sem conversa".
--
--  A SAÍDA
--
--  O dono diz a qual lead cada conversa pertence, uma vez. Esta tabela guarda
--  o par LID → telefone; a sincronização e o webhook passam a usá-lo como
--  verdade (vale mais que o cruzamento por nome, que é inferência).
-- ============================================================================

create table if not exists public.wa_lid_links (
  -- Só os dígitos do LID, sem o "@lid" — o mesmo formato dos mapas do backfill.
  lid          text primary key check (lid ~ '^[0-9]+$'),
  phone_e164   text not null,
  lead_id      uuid references public.wa_leads(id) on delete cascade,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

comment on table public.wa_lid_links is
  'Vínculo manual LID → telefone, feito na tela "Conversas não identificadas". Vale mais que o cruzamento por nome.';

alter table public.wa_lid_links enable row level security;

-- Mesma allowlist das outras tabelas do Radar: é conversa de WhatsApp, e pode
-- ter dado de paciente (LGPD art. 11).
drop policy if exists "wa_lid_links_staff" on public.wa_lid_links;
create policy "wa_lid_links_staff"
  on public.wa_lid_links for all to authenticated
  using      (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()))
  with check (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()));
