-- ============================================================================
--  Lux Derma — juntar dois leads que são a mesma pessoa
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  POR QUE
--
--  O lead é identificado pelo telefone. Quando a recepção passa o número
--  particular do médico, a mesma pessoa vira dois leads: o da clínica e o
--  particular. O "Trocar telefone" (0031) não resolve, porque o número novo já
--  é de outro lead, e arquivar um deles esconde as mensagens que ainda chegarem
--  por ele.
--
--  O QUE FAZ
--
--  `juntar_leads(origem, destino)` passa tudo da origem para o destino —
--  mensagens, locações, envios, buscas de Instagram, vínculos de LID e o
--  estado da sincronização —, põe o telefone da origem em
--  `telefones_anteriores` do destino (a sincronização passa a mandar as
--  mensagens desse número para o destino), completa os campos vazios do
--  destino com os da origem e apaga a origem. As análises da origem são
--  apagadas: o destino é reanalisado com a conversa inteira.
--
--  Roda com as permissões de quem chama (RLS vale) e confere `lux_staff`.
--
--  Também: a locação com o telefone antigo de um lead passa a se ligar a ele
--  (antes só valia o telefone atual).
-- ============================================================================

create or replace function public.juntar_leads(p_origem uuid, p_destino uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  o public.wa_leads;
  d public.wa_leads;
  n_msgs int;
  n_locacoes int;
begin
  -- Pelo app, só a equipe. Pelo SQL Editor (postgres), sem essa conferência.
  if current_user in ('anon', 'authenticated')
     and not exists (select 1 from public.lux_staff s where s.user_id = auth.uid()) then
    raise exception 'sem_permissao';
  end if;
  if p_origem = p_destino then
    raise exception 'mesmo_lead';
  end if;

  -- Trava os dois, sempre na mesma ordem, contra duas junções cruzadas.
  perform 1 from public.wa_leads
   where id in (p_origem, p_destino)
   order by id
   for update;

  select * into o from public.wa_leads where id = p_origem;
  select * into d from public.wa_leads where id = p_destino;
  if o.id is null or d.id is null then
    raise exception 'lead_nao_encontrado';
  end if;
  if o.is_group or d.is_group then
    raise exception 'grupo';
  end if;

  update public.wa_messages set lead_id = d.id where lead_id = o.id;
  get diagnostics n_msgs = row_count;
  update public.rentals set wa_lead_id = d.id where wa_lead_id = o.id;
  get diagnostics n_locacoes = row_count;
  update public.wa_outbound set lead_id = d.id where lead_id = o.id;
  update public.wa_sync_state set lead_id = d.id where lead_id = o.id;
  update public.wa_lid_links set lead_id = d.id where lead_id = o.id;
  update public.wa_instagram_buscas set lead_id = d.id where lead_id = o.id;
  delete from public.wa_lead_analyses where lead_id = o.id;

  -- Apaga antes de gravar o número velho no destino: a origem ainda ocupa a
  -- unique de phone_key.
  delete from public.wa_leads where id = o.id;

  update public.wa_leads set
    telefones_anteriores = array(
      select distinct t
        from unnest(d.telefones_anteriores || o.telefones_anteriores || array[o.phone_key]) t
       where t <> d.phone_key
    ),
    display_name   = coalesce(d.display_name, o.display_name),
    sheet_name     = coalesce(d.sheet_name, o.sheet_name),
    clinic_name    = coalesce(d.clinic_name, o.clinic_name),
    specialty      = coalesce(d.specialty, o.specialty),
    city           = coalesce(d.city, o.city),
    uf             = coalesce(d.uf, o.uf),
    status         = coalesce(d.status, o.status),
    temperature_manual = coalesce(d.temperature_manual, o.temperature_manual),
    instagram      = coalesce(d.instagram, o.instagram),
    instagram_escolhido_em = coalesce(d.instagram_escolhido_em, o.instagram_escolhido_em),
    perfil_url     = coalesce(d.perfil_url, o.perfil_url),
    crm            = coalesce(d.crm, o.crm),
    rqe            = coalesce(d.rqe, o.rqe),
    notes = case
      when nullif(trim(o.notes), '') is null then d.notes
      when nullif(trim(d.notes), '') is null then o.notes
      else d.notes || E'\n\n' || o.notes
    end,
    -- O destino ganha nas chaves repetidas.
    extra = o.extra || d.extra,
    source = case when d.source = o.source then d.source else 'ambos' end,
    first_seen_at    = least(d.first_seen_at, o.first_seen_at),
    last_message_at  = greatest(d.last_message_at, o.last_message_at),
    last_inbound_at  = greatest(d.last_inbound_at, o.last_inbound_at),
    last_outbound_at = greatest(d.last_outbound_at, o.last_outbound_at),
    instagram_sent_at = greatest(d.instagram_sent_at, o.instagram_sent_at),
    -- Arquivado só se os dois estavam.
    archived = d.archived and o.archived,
    needs_analysis = true
  where id = d.id;

  return jsonb_build_object('mensagens', n_msgs, 'locacoes', n_locacoes);
end $$;

comment on function public.juntar_leads(uuid, uuid) is
  'Passa tudo do lead origem para o destino (o telefone da origem vira telefone anterior) e apaga a origem.';

revoke execute on function public.juntar_leads(uuid, uuid) from public, anon;
grant execute on function public.juntar_leads(uuid, uuid) to authenticated;

-- ============================================================================
--  Locação nova com o telefone antigo de um lead também se liga a ele
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

  if new.wa_lead_id is null then
    select l.id
      into new.wa_lead_id
      from public.wa_leads l
     where exists (
       select 1 from unnest(l.telefones_anteriores) t where right(t, 8) = final8
     )
     order by l.archived, l.created_at
     limit 1;
  end if;

  return new;
end $$;
