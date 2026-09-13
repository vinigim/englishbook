-- ============================================================================
--  Lux Derma — campos extras no aluguel
--  ----------------------------------------------------------------------------
--  Adiciona à tabela rentals:
--    - specialty   : especialidade do médico
--    - tips_used   : ponteiras utilizadas
--    - sterilized  : esterilização (true = sim, false = não, null = não informado)
--  Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.
-- ============================================================================

alter table public.rentals add column if not exists specialty  text;
alter table public.rentals add column if not exists tips_used  text;
alter table public.rentals add column if not exists sterilized boolean;
