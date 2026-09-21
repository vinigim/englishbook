# Lux Derma — agenda de aluguéis

Área principal do app, em `/derma-lux`:

- **Login** (e-mail/senha) via Supabase Auth — `/derma-lux/login`
- **Agenda** (próximas obrigações) — `/derma-lux`
- **Disponibilidade Locação** — `/derma-lux/disponibilidade`
- **Disponibilidade Clínica Dra Gabriella** — `/derma-lux/disponibilidade-clinica`
- **Equipamentos** — `/derma-lux/equipamentos`
- **Sincronização em tempo real** entre todos os aparelhos e usuários da empresa

O Radar de Leads do WhatsApp fica em `/derma-lux/leads` e tem documentação própria em
[`LEADS.md`](LEADS.md).

## Estrutura

```
src/app/derma-lux/
  types.ts            Tipos (Equipment, Rental, Block)
  shared.ts           Utilidades puras (datas, conflito, formatação, link wa.me)
  data.ts             Busca de dados (Server Component)
  actions.ts          Server Actions (CRUD de aluguéis, equipamentos e fechamentos)
  auth-actions.ts     Login / logout
  login/              Tela de login
  (app)/              Área autenticada (layout com guarda de sessão)
    page.tsx                    Agenda
    disponibilidade/            Disponibilidade da locação
    disponibilidade-clinica/    Disponibilidade da clínica
    equipamentos/               Equipamentos
    leads/                      Radar de Leads (ver LEADS.md)
```

Os dados ficam em `equipment`, `rentals` e `blocks`.

| Migração | O que traz |
|---|---|
| `0004_derma_lux.sql` | Tabelas `equipment` e `rentals` + RLS + realtime |
| `0005`–`0007` | Campos extras do aluguel: especialidade, ponteiras, esterilização, frete, técnica especializada |
| `0008`–`0009` | Fechamentos de agenda (`blocks`) com motivo |

## Configuração (uma vez)

1. **Banco**: no **SQL Editor** do Supabase, rode `0004` a `0009` em ordem.
2. **Variáveis de ambiente** (veja `.env.example`):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
   Na Vercel, em **Project Settings → Environment Variables**.
3. **Logins da equipe**: em **Authentication → Users → Add user**, crie e-mail e senha
   para você e para cada funcionário (marque *Auto Confirm User*). Todos veem a mesma
   agenda. Não existe cadastro público no app.

## Rodar localmente

```bash
npm install
npm run dev
# http://localhost:3000  (a raiz já redireciona para /derma-lux)
```

## Segurança

As tabelas da agenda usam RLS `to authenticated using (true)`: qualquer usuário logado
lê e escreve tudo. Como os logins são criados só por você no painel do Supabase, na
prática isso equivale a "a equipe inteira".

Uma ressalva: este projeto do Supabase ainda tem contas antigas do EnglishBook, o app
que existia neste repositório antes. Elas continuam conseguindo autenticar e, por
consequência, enxergam a agenda. Se isso incomodar, dá para estender a allowlist
`lux_staff` — criada na migração `0010` e já usada pelas tabelas de leads — também para
`rentals`, `equipment` e `blocks`.
