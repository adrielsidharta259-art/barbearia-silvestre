# Deploy — Barbearia Silvestre

## 1. Frontend

```bash
npm install
cp .env.example .env.local
# preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run build
```

Publique a pasta `dist/` em Vercel, Netlify, Cloudflare Pages ou outro host estático.

## 2. Supabase

Execute `supabase/migrations/0001_initial.sql` no SQL Editor e configure Auth.

Depois, faça o deploy das funções:

```bash
supabase functions deploy bootstrap-admin
supabase functions deploy create-payment
supabase functions deploy mercadopago-webhook
supabase functions deploy infinitepay-webhook
```

## 3. Secrets

Somente no Supabase Edge Functions:

- `BOOTSTRAP_SECRET`
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_WEBHOOK_SECRET`
- `APP_URL`

Nunca coloque esses valores em `VITE_*`.

## 4. Primeiro administrador

Use `bootstrap-admin` uma única vez para criar o administrador. Depois altere a senha inicial.

## 5. Checklist antes de produção

- [ ] `npm run build` sem erros.
- [ ] Cadastro e login testados.
- [ ] RLS testado com cliente, barbeiro e administrador.
- [ ] Serviços e barbeiros cadastrados.
- [ ] Agendamento testado.
- [ ] Webhooks de pagamento testados com credenciais de teste.
- [ ] Domínio HTTPS configurado.
