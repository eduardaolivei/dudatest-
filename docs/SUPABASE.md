# Configurar a sincronização na nuvem (Supabase)

Tempo: ~10 minutos. Grátis.

## 1. Criar o projeto
1. Entre em **https://supabase.com** → **Start your project** → entre com o GitHub ou e-mail.
2. **New project**:
   - **Name:** `our-money`
   - **Database Password:** crie uma senha forte e guarde (não é usada no app).
   - **Region:** **Sydney (ap-southeast-2)**.
3. Clique em **Create new project** e espere ~2 minutos.

## 2. Criar as tabelas (colar o script)
1. No menu da esquerda: **SQL Editor** → **New query**.
2. Abra o arquivo `supabase/setup.sql` deste projeto, copie **tudo** e cole.
3. Clique em **Run**. Deve aparecer *Success. No rows returned*.

## 3. Desligar a confirmação de e-mail (recomendado)
**Authentication** → **Sign In / Providers** → **Email** → desligue **Confirm email** → **Save**.
(Se deixar ligado, cada um precisa clicar no link do e-mail antes do primeiro login.)

## 4. Copiar as duas informações
**Project Settings** (engrenagem) → **API** — ou o botão **Connect** no topo:
- **Project URL** — ex.: `https://abcdefgh.supabase.co`
- **anon public** key (ou **publishable** key)

⚠️ Nunca use a **service_role** / secret key no app.

## 5. No app
1. **Settings → Cloud sync** → cole as duas informações → **Connect**.
2. **New account** → seu e-mail e senha → **Create account**.
3. **Create** (cria a household e envia seus dados para a nuvem).
4. Copie o **Invite code**.

## 6. No celular do Patrick
**Settings → Cloud sync** → mesmas duas informações → **New account** com o e-mail dele → cole o **Invite code** → **Join**.

> Para usar no celular, o app precisa estar publicado na internet (ex.: Vercel). No computador, `localhost` funciona.
> Na Vercel, configure as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` para não precisar colar em cada aparelho.
