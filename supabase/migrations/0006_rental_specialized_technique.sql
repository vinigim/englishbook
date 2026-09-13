-- ============================================================================
--  Lux Derma — campo "Técnica especializada" no aluguel
--  ----------------------------------------------------------------------------
--  specialized_technique: true = sim, false = não, null = não informado
--  Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.
-- ============================================================================

alter table public.rentals add column if not exists specialized_technique boolean;
