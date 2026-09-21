-- ============================================================================
--  Lux Derma — temperatura marcada à mão pelo dono
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  POR QUE UMA COLUNA NOVA, E NÃO SOBRESCREVER A DA IA
--
--  A temperatura que a IA conclui mora em wa_lead_analyses.temperature. Aquela
--  tabela é VERSIONADA e nunca sobrescrita (unique (lead_id, version)): ela é o
--  registro do que o modelo disse, e é o que o cache por content_hash
--  reaproveita.
--
--  Gravar a opinião do dono lá dentro teria dois defeitos: sumiria na próxima
--  reanálise, e falsificaria o histórico do que a IA de fato concluiu.
--
--  Então a marcação do dono vive no LEAD, ao lado da análise. A tela usa a
--  manual quando existe e a da IA caso contrário — e mostra as duas quando
--  divergem, para a leitura do modelo não sumir de vista.
--
--  OS VALORES
--
--  Os três primeiros são os mesmos que a IA usa, para o dono poder discordar
--  dentro da escala dela. Os dois "confirmado" só existem aqui: a IA nunca os
--  produz, porque confirmar é julgamento de quem conhece o cliente.
-- ============================================================================

alter table public.wa_leads
  add column if not exists temperature_manual text;

-- Constraint separada do add column para a migração ser re-executável.
do $$
begin
  alter table public.wa_leads
    add constraint wa_leads_temperature_manual_check
    check (temperature_manual in (
      'quente', 'morno', 'frio', 'quente_confirmado', 'frio_confirmado'
    ));
exception
  when duplicate_object then null;
end $$;

comment on column public.wa_leads.temperature_manual is
  'Temperatura marcada pelo dono. Prevalece sobre wa_lead_analyses.temperature na exibição. Nulo = seguir a IA.';

-- O filtro da caixa de entrada passa por aqui.
create index if not exists wa_leads_temperature_manual_idx
  on public.wa_leads (temperature_manual)
  where temperature_manual is not null;
