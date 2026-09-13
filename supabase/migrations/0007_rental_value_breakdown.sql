-- ============================================================================
--  Lux Derma — valores de frete e técnica especializada no aluguel
--  ----------------------------------------------------------------------------
--  freight_price   : valor do frete (0 = isento, null = não informado)
--  technique_price : valor da técnica especializada (quando aplicável)
--  Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.
-- ============================================================================

alter table public.rentals add column if not exists freight_price   numeric(10,2);
alter table public.rentals add column if not exists technique_price numeric(10,2);
