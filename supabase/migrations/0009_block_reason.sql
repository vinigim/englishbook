-- ============================================================================
--  Lux Derma — motivo do fechamento de agenda
--  ----------------------------------------------------------------------------
--  reason:
--    'patient'  = fechar agenda com paciente  → indisponível na Clínica E na Locação
--    'locacao'  = fechar agenda para locação  → indisponível somente na Locação
--  Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.
-- ============================================================================

alter table public.blocks add column if not exists reason text;

-- Fechamentos antigos (sem motivo) passam a valer como "para locação",
-- mantendo o comportamento anterior (só afetavam a Locação).
update public.blocks set reason = 'locacao' where reason is null;
