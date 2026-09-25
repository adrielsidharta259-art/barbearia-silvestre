# Barbearia Silvestre

Aplicativo web responsivo para a Barbearia Silvestre, feito com React + Vite + Supabase.

## O que já está no projeto

- Página pública com os planos.
- Cadastro com nome, telefone, e-mail opcional e senha.
- Login por e-mail **ou** telefone.
- Painel do cliente com assinatura e agendamentos.
- Contratação de plano pelo fluxo do Supabase Edge Function (`manual` no MVP).
- Cadastro de agendamento com serviço, barbeiro, data e horário.
- Painel do barbeiro com a própria agenda.
- Painel administrativo com indicadores básicos.
- Banco Supabase com RLS, planos, serviços, assinaturas, pagamentos, agendamentos e estrutura financeira.
- Edge Functions para bootstrap do administrador e integração de pagamentos.

## Rodar localmente

```bash
npm install
cp .env.example .env.local
# preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run build
npm run dev
```

## Supabase

1. Crie um projeto no Supabase.
2. Execute `supabase/migrations/0001_initial.sql` no SQL Editor.
3. Habilite o método de autenticação que será usado (e-mail e/ou telefone + senha).
4. Configure as variáveis do frontend em `.env.local` ou no host de produção.
5. Publique as Edge Functions em `supabase/functions/`.

### Primeiro administrador

Não há senha de administrador no SQL. Use a Edge Function `bootstrap-admin` com `BOOTSTRAP_SECRET` e troque a senha inicial imediatamente.

### Pagamentos

O fluxo de pagamento online depende das credenciais reais do provedor. Nunca coloque tokens de Mercado Pago ou InfinitePay no frontend. Para o MVP, a contratação manual cria a assinatura como `pending_payment`; ela só deve ser marcada como paga após confirmação real.

## Produção

- Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no host.
- Não publique `.env`, `.env.local` ou segredos de Edge Functions.
- Rode `npm run build` antes do deploy.
- Configure os webhooks e secrets dos provedores somente no Supabase.
