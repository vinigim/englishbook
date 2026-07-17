# Derma Lux — versão Next.js (deploy a partir deste repositório)

Esta é a versão do Derma Lux integrada ao app Next.js, para você **publicar direto
na Vercel** a partir deste repositório. Ela roda em `/derma-lux`, com:

- **Login** (e-mail/senha) via Supabase Auth — rota `/derma-lux/login`
- **Agenda** (próximas obrigações) — rota `/derma-lux`
- **Disponibilidade** (horários livres/ocupados) — rota `/derma-lux/disponibilidade`
- **Equipamentos** — rota `/derma-lux/equipamentos`
- **Sincronização em tempo real** entre todos os aparelhos e usuários da empresa

> Existe também uma versão estática, sem build, na pasta `/derma-lux` da raiz do repositório
> (abre direto no navegador). Esta aqui é a versão para deploy no mesmo domínio do app.

## Estrutura

```
src/app/derma-lux/
  types.ts            Tipos (Equipment, Rental)
  shared.ts           Utilidades puras (datas, conflito, formatação)
  data.ts             Busca de dados (Server Component)
  actions.ts          Server Actions (CRUD de aluguéis e equipamentos)
  auth-actions.ts     Login / logout
  login/              Tela de login
  (app)/              Área autenticada (layout com guarda de sessão)
    page.tsx          Agenda
    disponibilidade/  Disponibilidade
    equipamentos/     Equipamentos
supabase/migrations/0004_derma_lux.sql   Tabelas dl_equipment e dl_rentals + RLS + realtime
```

Os dados ficam em tabelas próprias com prefixo `dl_` — independentes do schema do EnglishBook.

## Configuração (uma vez)

1. **Supabase**: crie um projeto grátis em https://supabase.com (ou reutilize o mesmo do
   EnglishBook).
2. **Banco**: no **SQL Editor**, cole e rode o arquivo
   `supabase/migrations/0004_derma_lux.sql`.
3. **Variáveis de ambiente** (as mesmas do EnglishBook — veja `.env.example`):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
   No deploy da Vercel, adicione-as em **Project Settings → Environment Variables**.
4. **Logins da equipe**: em **Authentication → Users → Add user**, crie e-mail/senha para
   você e para cada funcionário (marque *Auto Confirm User*). Todos veem a mesma agenda.

## Rodar localmente

```bash
npm install
npm run dev
# acesse http://localhost:3000/derma-lux
```

## Publicar na Vercel

1. Conecte este repositório na Vercel (https://vercel.com → Add New → Project).
2. Configure as variáveis de ambiente acima.
3. Deploy. Acesse `https://SEU-APP.vercel.app/derma-lux` no celular e no computador.

## Segurança

As tabelas usam **RLS**: só usuários autenticados (logados) acessam os dados. A chave
`anon` é pública por natureza; quem protege os dados é o login + as políticas do
`0004_derma_lux.sql`.
