# Lux Derma — Agenda de Aluguéis de Laser

Aplicação para controlar a agenda de aluguel dos seus lasers para médicos e clínicas.

Cada aluguel registra: **nome do cliente · endereço · telefone · equipamento (laser) · data ·
horário (início/término) · valor · observações**. E você tem:

- **📋 Agenda** — lista das suas próximas obrigações de aluguel, agrupadas por dia.
- **🕑 Disponibilidade** — visão rápida dos horários livres/ocupados de cada laser.
- **🔬 Equipamentos** — cadastro dos seus lasers.

## Dois modos de uso

O app escolhe o modo **automaticamente**, conforme o `config.js`:

| Modo | Quando | O que acontece |
|---|---|---|
| **💾 Local** | `config.js` em branco | Funciona na hora, sem login. Dados salvos **só neste navegador**. Bom para testar. |
| **☁️ Nuvem** | `config.js` preenchido | **Login** + dados na nuvem, **sincronizados em tempo real** entre celular, computador e tablet, e entre você e sua equipe. |

Para só testar, abra o `index.html` no navegador — já funciona em modo local.
Para acessar de **vários dispositivos**, siga a configuração abaixo (uma vez só, ~10 min).

---

## Configuração para acesso multi-dispositivo (Supabase — grátis)

### 1) Criar o projeto no Supabase
1. Acesse **https://supabase.com** e crie uma conta gratuita.
2. Clique em **New project**, dê um nome (ex.: `derma-lux`), defina uma senha de banco e crie.
3. Aguarde ~2 min até o projeto ficar pronto.

### 2) Criar as tabelas
1. No menu lateral, abra **SQL Editor**.
2. Abra o arquivo **`schema.sql`** (está nesta pasta), copie **todo** o conteúdo, cole no editor
   e clique em **Run**. Isso cria as tabelas, a segurança e o tempo real.

### 3) Pegar as chaves do projeto
1. Vá em **Project Settings** (engrenagem) → **API**.
2. Copie o **Project URL** e a chave **anon public**.
3. Abra o arquivo **`config.js`** desta pasta e cole nos campos:
   ```js
   window.DERMALUX_CONFIG = {
     supabaseUrl: "https://SEU-PROJETO.supabase.co",
     supabaseAnonKey: "eyJhbGciOi...(chave anon public)",
   };
   ```
   > A chave `anon` é pública por natureza — pode ficar no arquivo. Quem protege os dados é o
   > login + as regras de segurança (RLS) criadas pelo `schema.sql`: **só usuários logados acessam**.

### 4) Criar os logins (você e sua equipe)
1. No menu lateral, abra **Authentication** → **Users** → **Add user** → **Create new user**.
2. Informe **e-mail** e **senha** e marque **Auto Confirm User**. Repita para cada pessoa da equipe.
   Todos verão e editarão a mesma agenda da empresa.
3. (Opcional) Em **Authentication → Providers → Email**, desligue "Confirm email" para não exigir
   confirmação por e-mail ao criar usuários manualmente.

### 5) Publicar o app na internet
Para abrir de qualquer aparelho, os arquivos precisam estar num endereço (URL). Opções gratuitas:

- **Vercel** (recomendado): crie conta em https://vercel.com → **Add New → Project** →
  importe/arraste esta pasta `derma-lux` → **Deploy**. Você recebe uma URL tipo
  `https://derma-lux.vercel.app`.
- **Netlify**: https://app.netlify.com/drop → arraste a pasta `derma-lux` → recebe uma URL.
- **Cloudflare Pages**: também gratuito.

Abra a URL no celular e no computador, faça login e pronto — tudo sincronizado. 📱💻

> Dica: no celular, use "Adicionar à tela de início" no navegador para virar um "app".

---

## Perguntas frequentes

**Preciso saber programar?** Não. É criar a conta, rodar o `schema.sql`, colar 2 chaves e publicar.

**Os dados ficam seguros?** Sim. Só quem tem login criado por você acessa. A chave pública sozinha
não abre os dados por causa das regras de segurança (RLS).

**Perco os dados de teste do modo local ao configurar a nuvem?** O modo local e o da nuvem são
separados. Se você já cadastrou coisas no modo local e quer migrar, me avise que eu adiciono um
botão de exportar/importar.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | A interface do app |
| `app.js` | A lógica (login, agenda, nuvem/local) |
| `config.js` | Onde você cola as chaves do Supabase |
| `schema.sql` | Script para criar o banco no Supabase |
