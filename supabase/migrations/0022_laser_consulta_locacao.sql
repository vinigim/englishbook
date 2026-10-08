-- ============================================================================
--  Lux Derma — Ligar a consulta de parâmetros à locação
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  Até aqui a consulta de parâmetros do CO2 ficava solta: não dava para saber
--  para qual médico nem em qual dia ela serviu. Agora:
--
--  - rental_id liga a consulta à locação da agenda. A locação já diz o
--    médico (rentals.client), o dia e o aparelho. Apagar a locação não apaga
--    a consulta: o vínculo só fica nulo.
--  - parametros_realizados guarda o que o médico de fato usou, que pode ser
--    diferente do que a IA recomendou. É isso que se quer rever meses depois.
--  - reaproveitada_de marca a consulta que repetiu um caso já respondido. Cada
--    pedido vira uma linha própria (para poder ter locação e parâmetros
--    realizados próprios), mas sem pagar a IA de novo.
-- ============================================================================

alter table public.laser_consultas
  add column if not exists rental_id uuid references public.rentals(id) on delete set null,
  add column if not exists parametros_realizados jsonb,
  add column if not exists reaproveitada_de uuid references public.laser_consultas(id) on delete set null;

comment on column public.laser_consultas.rental_id is
  'Locação (agenda) em que os parâmetros foram usados. Dá o médico, o dia e o aparelho.';
comment on column public.laser_consultas.parametros_realizados is
  'O que o médico de fato usou: modo, potência, dwell, spacing, stack, varredura, passadas, notas e quando foi registrado.';
comment on column public.laser_consultas.reaproveitada_de is
  'Consulta original cuja resposta foi reaproveitada, sem nova chamada à IA.';

create index if not exists laser_consultas_rental_idx
  on public.laser_consultas (rental_id);
