-- ============================================================================
--  Lux Derma — resfriador Freddo no aluguel
--  ----------------------------------------------------------------------------
--  freddo       : true = vai o Freddo junto, false = não, null = não informado
--  freddo_price : valor cobrado pelo Freddo (entra no total da confirmação)
--  Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.
-- ============================================================================

alter table public.rentals add column if not exists freddo       boolean;
alter table public.rentals add column if not exists freddo_price numeric(10,2);
