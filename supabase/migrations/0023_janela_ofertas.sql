-- ============================================================================
--  Lux Derma — Ofertas de janela enviadas pelo Instagram
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  POR QUE
--
--  Pelo direct, o médico não responde no WhatsApp: ele teria que copiar o
--  número, abrir outro app e escrever. A mensagem da janela leva um link curto
--  (/j/<codigo>) que abre o WhatsApp da Lux já com "tenho interesse na janela
--  de quinta, 15/10, em Araçatuba — código K7P3QX" escrito. Ele só toca em
--  enviar.
--
--  Cada linha é uma janela oferecida a um lead. Ela registra três fatos:
--
--    - o link existe (gravado quando o dono copia a mensagem do Instagram);
--    - o médico tocou no link (cliques, primeiro_clique_em);
--    - a mensagem com o código chegou no WhatsApp da empresa (respondida_em),
--      de qual lead ela veio (resposta_lead_id — muitas vezes outro número,
--      porque o lead do Instagram costuma não ter WhatsApp cadastrado).
--
--  Sem esta tabela as janelas funcionam como antes; o link cai num texto
--  genérico em vez de dizer qual janela era.
-- ============================================================================

create table if not exists public.janela_ofertas (
  id                  uuid primary key default gen_random_uuid(),
  -- Seis caracteres sem 0/O/1/I/L, para ditar ou digitar sem engano. Derivado
  -- de lead + equipamento + dia, então a mesma janela tem sempre o mesmo código.
  codigo              text not null unique check (codigo ~ '^[A-Z2-9]{6}$'),
  lead_id             uuid not null references public.wa_leads(id) on delete cascade,
  equip_id            uuid references public.equipment(id) on delete set null,
  data                date not null,
  periodo             text not null check (periodo in ('dia', 'manha', 'tarde')),
  -- O texto do link, congelado: o que o médico viu na mensagem não muda se a
  -- agenda mudar depois.
  equip_nome          text not null,
  cidade              text not null,
  criada_em           timestamptz not null default now(),
  cliques             integer not null default 0,
  primeiro_clique_em  timestamptz,
  respondida_em       timestamptz,
  resposta_lead_id    uuid references public.wa_leads(id) on delete set null
);

create index if not exists janela_ofertas_lead_idx on public.janela_ofertas (lead_id);
create index if not exists janela_ofertas_data_idx on public.janela_ofertas (data);

-- ============================================================================
--  Segurança (RLS) — allowlist, como as tabelas de leads
--  ----------------------------------------------------------------------------
--  O link público (/j/<codigo>) e o webhook leem e escrevem com a service
--  role, que ignora o RLS. Ninguém de fora lê esta tabela diretamente.
-- ============================================================================
alter table public.janela_ofertas enable row level security;

drop policy if exists "janela_ofertas_staff" on public.janela_ofertas;
create policy "janela_ofertas_staff"
  on public.janela_ofertas for all to authenticated
  using      (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()))
  with check (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()));

-- ============================================================================
--  Clique no link, atômico
--  ----------------------------------------------------------------------------
--  Dois toques seguidos não podem se perder num ler-somar-gravar. Devolve o
--  que o link precisa para montar o texto do WhatsApp. Só a service role
--  executa: a rota pública chama com ela.
-- ============================================================================
create or replace function public.janela_registrar_clique(p_codigo text)
returns table (equip_nome text, cidade text, data date, periodo text)
language sql
security definer
set search_path = public
as $$
  update public.janela_ofertas o
     set cliques = o.cliques + 1,
         primeiro_clique_em = coalesce(o.primeiro_clique_em, now())
   where o.codigo = upper(p_codigo)
  returning o.equip_nome, o.cidade, o.data, o.periodo;
$$;

revoke all on function public.janela_registrar_clique(text) from public, anon, authenticated;
grant execute on function public.janela_registrar_clique(text) to service_role;
