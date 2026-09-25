-- ============================================================================
--  Lux Derma — O telefone do lead tem WhatsApp?
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  Telefone fixo às vezes tem WhatsApp (o Business aceita fixo) e às vezes
--  não. Até aqui o único jeito de saber era tocar em "Abrir no WhatsApp" e
--  esperar o aplicativo dizer "isn't on WhatsApp".
--
--  Agora o painel pergunta ao próprio WhatsApp, pela Evolution API
--  (/chat/whatsappNumbers), e guarda a resposta aqui. Guardar importa: a
--  consulta é feita uma vez por número, não a cada abertura da ficha — muita
--  consulta de número desconhecido é padrão de spam para o WhatsApp.
--
--  whatsapp_existe nulo = ainda não verificado.
-- ============================================================================

alter table public.wa_leads
  add column if not exists whatsapp_existe boolean,
  add column if not exists whatsapp_verificado_em timestamptz;

comment on column public.wa_leads.whatsapp_existe is
  'Resposta do WhatsApp (via Evolution /chat/whatsappNumbers) para o telefone do lead. true = tem conta, false = não tem, nulo = não verificado.';
comment on column public.wa_leads.whatsapp_verificado_em is
  'Quando whatsapp_existe foi consultado.';
