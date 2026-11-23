-- ============================================================================
--  Lux Derma — trocar o telefone do lead sem perder nada, e dados do perfil
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  POR QUE
--
--  O lead é identificado pelo telefone (`phone_key`). Quando a prospecção acha
--  o celular de quem estava com o fixo, até agora a saída era importar o
--  celular como lead NOVO e arquivar o antigo à mão — perdendo a conversa, as
--  análises, as locações e o histórico de quem foi abordado.
--
--  O QUE GUARDA
--
--  `telefones_anteriores`  chaves (mesmo formato de `phone_key`) que este lead
--                          já usou. A sincronização do WhatsApp manda mensagem
--                          vinda de um número antigo para o lead atual, em vez
--                          de criar outro lead.
--  `perfil_url`            onde o médico foi achado (catálogo, Doctoralia,
--                          site). A origem sai do domínio do link.
--  `crm`, `rqe`            como vieram da fonte, texto livre ("CRM SP 123456").
--
--  O lead que troca de telefone também religa as locações soltas com o número
--  novo: o gatilho da 0030 passa a rodar no update de `phone_key`.
-- ============================================================================

alter table public.wa_leads
  add column if not exists telefones_anteriores text[] not null default '{}',
  add column if not exists perfil_url text,
  add column if not exists crm text,
  add column if not exists rqe text;

comment on column public.wa_leads.telefones_anteriores is
  'Chaves de telefone (formato de phone_key) que este lead já usou. Mensagem desses números cai neste lead.';
comment on column public.wa_leads.perfil_url is
  'Link do perfil onde o médico foi encontrado (catálogo, Doctoralia, site).';
comment on column public.wa_leads.crm is 'CRM como veio da fonte, ex: "CRM SP 123456".';
comment on column public.wa_leads.rqe is 'RQE como veio da fonte; pode ter mais de um.';

create index if not exists wa_leads_telefones_anteriores_idx
  on public.wa_leads using gin (telefones_anteriores);

-- ============================================================================
--  Gatilho da 0030 também na troca de telefone
-- ============================================================================
drop trigger if exists wa_leads_ligar_rentals on public.wa_leads;
create trigger wa_leads_ligar_rentals
  after insert or update of phone_key on public.wa_leads
  for each row execute function public.wa_leads_ligar_rentals();
