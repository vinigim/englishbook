-- ============================================================================
--  Lux Derma — ligar os aluguéis aos leads, e derivar quem é cliente
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  POR QUE
--
--  A agenda sempre soube quem alugou, mas `rentals.wa_lead_id` nasceu nulo e a
--  conciliação ficou comentada no fim da 0010, esperando o primeiro backfill.
--  Nunca foi executada. Consequências que ninguém via:
--
--    - a seção "Locações" da ficha do lead aparece vazia para TODO MUNDO;
--    - `loadAnalysisInput` entrega à IA um histórico de locações vazio, então
--      ela vinha analisando clientes antigos como se nunca tivessem alugado.
--
--  Depois desta migração dá para saber quem é cliente pelo FATO — alugou — em
--  vez de por um rótulo que alguém teria que manter em centenas de leads.
-- ============================================================================

-- ============================================================================
--  1. Conciliação
--  ----------------------------------------------------------------------------
--  Casa pelos 8 últimos dígitos, o que ignora DDI, formatação e o 9º dígito.
--  Oito bastam: são o número local sem o DDD, e a chance de dois clientes da
--  mesma carteira colidirem aí é desprezível perto do ganho.
--
--  Idempotente por construção: só toca em aluguel com wa_lead_id nulo, então
--  rodar de novo pega o que entrou depois sem desfazer o que já ligou.
-- ============================================================================
update public.rentals r
   set wa_lead_id = l.id
  from public.wa_leads l
 where r.wa_lead_id is null
   and r.phone is not null
   and right(regexp_replace(r.phone, '\D', '', 'g'), 8) = right(l.phone_key, 8);

-- ============================================================================
--  2. Locações por lead
--  ----------------------------------------------------------------------------
--  security_invoker = on pelo mesmo motivo da 0011: sem ele a view roda com os
--  privilégios de quem a criou e ignora o RLS das tabelas por baixo.
-- ============================================================================
drop view if exists public.wa_lead_rentals;
create view public.wa_lead_rentals
  with (security_invoker = on)
  as
select r.wa_lead_id           as lead_id,
       count(*)::int          as total,
       max(r.date)            as ultima,
       min(r.date)            as primeira,
       sum(r.price)           as total_brl
  from public.rentals r
 where r.wa_lead_id is not null
 group by r.wa_lead_id;

comment on view public.wa_lead_rentals is
  'Uma linha por lead que já alugou: quantas vezes, quando foi a primeira e a última, e quanto somou.';

create index if not exists rentals_wa_lead_date_idx
  on public.rentals (wa_lead_id, date desc)
  where wa_lead_id is not null;

-- ============================================================================
--  3. `status` vira o rótulo MANUAL
--  ----------------------------------------------------------------------------
--  A coluna já existia com os cinco valores certos e uma Server Action que a
--  escreve — mas nenhuma tela lia nem gravava, e todas as linhas ficaram no
--  default 'novo'.
--
--  Agora ela passa a ser o que `temperature_manual` é para a temperatura: nulo
--  significa "derive da agenda", preenchido significa "o dono decidiu".
--
--  O update zera só quem está no default. Se alguma linha tiver um valor
--  escolhido de propósito, ela sobrevive.
-- ============================================================================
alter table public.wa_leads alter column status drop not null;
alter table public.wa_leads alter column status drop default;

update public.wa_leads set status = null where status = 'novo';

comment on column public.wa_leads.status is
  'Situação marcada pelo dono. Prevalece sobre a derivação da agenda. Nulo = derivar.';

-- ============================================================================
--  4. A conciliação como função, para o backfill chamar
--  ----------------------------------------------------------------------------
--  O vínculo envelhece toda vez que entram leads novos — ou seja, ao fim de
--  cada sincronização. Deixar isso a cargo de um botão seria repetir o erro
--  que já aconteceu com o teste de conexão e com a limpeza: a capacidade
--  existe, e ninguém lembra de usar.
--
--  security definer porque a rota chama com a service role, mas o search_path
--  é fixado para a função não poder ser sequestrada por um schema no caminho.
-- ============================================================================
create or replace function public.conciliar_rentals()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  afetados integer;
begin
  update public.rentals r
     set wa_lead_id = l.id
    from public.wa_leads l
   where r.wa_lead_id is null
     and r.phone is not null
     and right(regexp_replace(r.phone, '\D', '', 'g'), 8) = right(l.phone_key, 8);

  get diagnostics afetados = row_count;
  return afetados;
end $$;

comment on function public.conciliar_rentals() is
  'Liga aluguéis a leads pelos 8 últimos dígitos do telefone. Idempotente: só toca em wa_lead_id nulo.';
