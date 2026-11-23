-- ============================================================================
--  Lux Derma — ligar cada locação ao lead na hora em que ela é gravada
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  POR QUE
--
--  A 0014 criou `conciliar_rentals()`, mas ela só roda no fim do "Sincronizar
--  histórico". Locação cadastrada na agenda depois disso ficava sem
--  `wa_lead_id` até a próxima sincronização — em 23/11, 11 das 16 locações com
--  telefone estavam soltas. Sem a ligação, o lead não aparece como cliente, a
--  fila "Reativar ex-cliente" não o vê e a IA o analisa como quem nunca alugou.
--
--  O QUE FAZ
--
--  Dois gatilhos, um para cada lado da ligação, com a mesma regra da 0014
--  (8 últimos dígitos do telefone, que ignora DDI, formatação e o 9º dígito):
--
--    1. Locação criada, ou com o telefone editado → procura o lead.
--       Telefone trocado religa (ou desliga, se o novo não casa com ninguém):
--       o vínculo antigo era do número antigo. Editar outra coluna não mexe.
--    2. Lead novo (WhatsApp, planilha, manual) → pega as locações soltas com
--       o telefone dele. Só as soltas: nunca tira locação de outro lead.
--
--  Com mais de um lead no mesmo número, vale o não arquivado, depois o mais
--  antigo — determinístico, ao contrário do update da 0014.
--
--  security definer porque quem grava na agenda pode não estar em `lux_staff`,
--  e o RLS de `wa_leads` esconderia o lead; o search_path é fixado para a
--  função não poder ser sequestrada por um schema no caminho.
-- ============================================================================

-- ============================================================================
--  1. Locação → lead
-- ============================================================================
create or replace function public.rentals_ligar_lead()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  final8 text := right(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), 8);
begin
  if tg_op = 'UPDATE'
     and new.phone is not distinct from old.phone
     and new.wa_lead_id is not null then
    return new;
  end if;

  if length(final8) < 8 then
    new.wa_lead_id := null;
    return new;
  end if;

  select l.id
    into new.wa_lead_id
    from public.wa_leads l
   where right(l.phone_key, 8) = final8
   order by l.archived, l.created_at
   limit 1;

  return new;
end $$;

comment on function public.rentals_ligar_lead() is
  'Gatilho: liga a locação ao lead pelos 8 últimos dígitos do telefone ao criar ou trocar o telefone.';

drop trigger if exists rentals_ligar_lead on public.rentals;
create trigger rentals_ligar_lead
  before insert or update of phone on public.rentals
  for each row execute function public.rentals_ligar_lead();

-- ============================================================================
--  2. Lead novo → locações soltas
-- ============================================================================
create or replace function public.wa_leads_ligar_rentals()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.rentals r
     set wa_lead_id = new.id
   where r.wa_lead_id is null
     and r.phone is not null
     and right(regexp_replace(r.phone, '\D', '', 'g'), 8) = right(new.phone_key, 8);
  return null;
end $$;

comment on function public.wa_leads_ligar_rentals() is
  'Gatilho: lead novo pega as locações sem lead com o mesmo telefone (8 últimos dígitos).';

drop trigger if exists wa_leads_ligar_rentals on public.wa_leads;
create trigger wa_leads_ligar_rentals
  after insert on public.wa_leads
  for each row execute function public.wa_leads_ligar_rentals();

-- ============================================================================
--  3. Recupera o que ficou solto antes desta migração
-- ============================================================================
select public.conciliar_rentals();
