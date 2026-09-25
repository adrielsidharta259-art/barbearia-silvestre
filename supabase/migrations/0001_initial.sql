create extension if not exists pgcrypto;

create type public.app_role as enum ('admin','barber','client');
create type public.subscription_status as enum ('pending_payment','active','payment_pending','overdue','paused','cancelled','expired','payment_failed');
create type public.payment_status as enum ('pending','approved','rejected','cancelled','refunded','charged_back','failed');
create type public.payment_type as enum ('one_time','recurring');
create type public.payment_origin as enum ('manual','mercado_pago','infinitepay');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 role public.app_role not null,
 display_name text not null,
 username text unique,
 phone text,
 phone_normalized text unique,
 must_change_password boolean not null default false,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.barbers (
 id uuid primary key default gen_random_uuid(),
 profile_id uuid unique not null references public.profiles(id) on delete cascade,
 name text not null,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.clients (
 id uuid primary key references public.profiles(id) on delete cascade,
 name text not null,
 phone text not null,
 phone_normalized text not null unique,
 email text,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.services (
 id uuid primary key default gen_random_uuid(),
 name text not null unique,
 default_price numeric(12,2) not null default 0 check(default_price>=0),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.plans (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 price numeric(12,2) not null check(price>=0),
 description text not null default '',
 benefits jsonb not null default '[]'::jsonb,
 limits jsonb not null default '{}'::jsonb,
 is_public boolean not null default false,
 active boolean not null default true,
 sort_order integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.special_offers (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 price numeric(12,2) not null check(price>=0),
 benefits jsonb not null default '[]'::jsonb,
 limits jsonb not null default '{}'::jsonb,
 valid_from date,
 valid_until date,
 active boolean not null default true,
 created_at timestamptz not null default now()
);

create table public.special_offer_links (
 id uuid primary key default gen_random_uuid(),
 offer_id uuid not null references public.special_offers(id) on delete cascade,
 token text not null unique default encode(gen_random_bytes(24),'hex'),
 active boolean not null default true,
 expires_at timestamptz,
 created_at timestamptz not null default now()
);

create table public.subscriptions (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete restrict,
 plan_id uuid references public.plans(id) on delete set null,
 special_offer_id uuid references public.special_offers(id) on delete set null,
 contracted_amount numeric(12,2) not null check(contracted_amount>=0),
 status public.subscription_status not null default 'pending_payment',
 starts_at timestamptz,
 ends_at timestamptz,
 next_billing_date date,
 payment_provider public.payment_origin,
 payment_type public.payment_type,
 provider_subscription_id text,
 provider_customer_id text,
 responsible_barber_id uuid references public.barbers(id) on delete set null,
 paused_from date,
 paused_until date,
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(payment_provider,provider_subscription_id)
);

create table public.subscription_cycles (
 id uuid primary key default gen_random_uuid(),
 subscription_id uuid not null references public.subscriptions(id) on delete cascade,
 cycle_number integer not null,
 billing_date date,
 due_date date,
 amount numeric(12,2) not null check(amount>=0),
 status public.payment_status not null default 'pending',
 provider_invoice_id text,
 created_at timestamptz not null default now(),
 unique(subscription_id,cycle_number),
 unique(provider_invoice_id)
);

create table public.payments (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete restrict,
 subscription_id uuid references public.subscriptions(id) on delete set null,
 cycle_id uuid references public.subscription_cycles(id) on delete set null,
 amount numeric(12,2) not null check(amount>=0),
 status public.payment_status not null default 'pending',
 payment_type public.payment_type not null default 'one_time',
 origin public.payment_origin not null default 'manual',
 provider_payment_id text,
 provider_order_id text,
 provider_invoice_id text,
 external_reference text,
 paid_at timestamptz,
 status_detail text,
 metadata jsonb not null default '{}'::jsonb,
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(origin,provider_payment_id),
 unique(origin,provider_invoice_id)
);

create table public.payment_events (
 id uuid primary key default gen_random_uuid(),
 provider public.payment_origin not null,
 event_id text not null,
 event_type text not null,
 external_id text,
 payload jsonb,
 received_at timestamptz not null default now(),
 processed_at timestamptz,
 status text not null default 'received',
 unique(provider,event_id)
);

create table public.appointments (
 id uuid primary key default gen_random_uuid(),
 client_id uuid references public.clients(id) on delete set null,
 barber_id uuid not null references public.barbers(id) on delete restrict,
 service_id uuid references public.services(id) on delete set null,
 subscription_id uuid references public.subscriptions(id) on delete set null,
 appointment_date date not null,
 appointment_time time,
 amount numeric(12,2) not null default 0 check(amount>=0),
 kind text not null check(kind in ('AVULSO','ASSINATURA')),
 notes text,
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now()
);

create table public.subscription_usages (
 id uuid primary key default gen_random_uuid(),
 subscription_id uuid not null references public.subscriptions(id) on delete restrict,
 client_id uuid not null references public.clients(id) on delete restrict,
 service_id uuid references public.services(id) on delete set null,
 barber_id uuid not null references public.barbers(id) on delete restrict,
 used_on date not null,
 week_reference text not null,
 created_at timestamptz not null default now()
);

create table public.vouchers (
 id uuid primary key default gen_random_uuid(), barber_id uuid not null references public.barbers(id) on delete restrict,
 amount numeric(12,2) not null check(amount>=0), voucher_date date not null, reason text, notes text,
 created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now()
);
create table public.advances (
 id uuid primary key default gen_random_uuid(), barber_id uuid not null references public.barbers(id) on delete restrict,
 amount numeric(12,2) not null check(amount>=0), advance_date date not null, reason text, notes text,
 created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now()
);
create table public.discounts (
 id uuid primary key default gen_random_uuid(), barber_id uuid not null references public.barbers(id) on delete restrict,
 amount numeric(12,2) not null check(amount>=0), discount_date date not null, reason text, notes text,
 created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now()
);

create table public.settlements (
 id uuid primary key default gen_random_uuid(), period_start date not null, period_end date not null,
 status text not null default 'open' check(status in ('open','locked')),
 gross_amount numeric(12,2) not null default 0, barber_amount numeric(12,2) not null default 0,
 shop_amount numeric(12,2) not null default 0, vouchers_amount numeric(12,2) not null default 0,
 advances_amount numeric(12,2) not null default 0, discounts_amount numeric(12,2) not null default 0,
 net_payable numeric(12,2) not null default 0, locked_at timestamptz, locked_by uuid references public.profiles(id) on delete set null,
 reopened_at timestamptz, reopened_by uuid references public.profiles(id) on delete set null, reopen_reason text,
 created_at timestamptz not null default now()
);
create table public.settlement_items (
 id uuid primary key default gen_random_uuid(), settlement_id uuid not null references public.settlements(id) on delete cascade,
 barber_id uuid not null references public.barbers(id) on delete restrict, source_type text not null, source_id uuid,
 amount numeric(12,2) not null, created_at timestamptz not null default now()
);

create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id) on delete set null,
 action text not null, entity_type text, entity_id uuid, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create table public.barbershop_settings (
 id boolean primary key default true,
 shop_name text not null default 'Barbearia Silvestre', logo_url text,
 phone text, address text, hours jsonb not null default '{}'::jsonb,
 barber_percentage numeric(5,2) not null default 60 check(barber_percentage>=0 and barber_percentage<=100),
 shop_percentage numeric(5,2) not null default 40 check(shop_percentage>=0 and shop_percentage<=100),
 sunday_barber_percentage numeric(5,2) not null default 100,
 sunday_shop_percentage numeric(5,2) not null default 0,
 recess_start date, recess_end date, payment_provider text default 'manual', updated_at timestamptz not null default now()
);
insert into public.barbershop_settings(id) values(true) on conflict do nothing;

insert into public.plans(name,price,description,benefits,limits,is_public,sort_order) values
('Essencial',99.90,'1 corte por semana', '["1 corte por semana","Agendamento prioritário","Mais praticidade","Profissionais qualificados"]','{"haircut_per_week":1,"beard_per_week":0,"eyebrow_unlimited":false}',true,1),
('Completo',169.90,'1 corte + 1 barba por semana','["1 corte por semana","1 barba por semana","Agendamento prioritário","Mais praticidade","Profissionais qualificados"]','{"haircut_per_week":1,"beard_per_week":1,"eyebrow_unlimited":false}',true,2),
('Premium',279.90,'Corte + barba + sobrancelha ilimitados','["Corte ilimitado","Barba ilimitada","Sobrancelha ilimitada","Agendamento prioritário","Mais praticidade","Profissionais qualificados"]','{"haircut_per_week":null,"beard_per_week":null,"eyebrow_unlimited":true}',true,3);
insert into public.services(name,default_price) values ('Corte',45),('Barba',25),('Sobrancelha',15),('Corte + Barba',70),('Outro',0) on conflict(name) do nothing;

create index idx_profiles_role on public.profiles(role);
create index idx_clients_phone on public.clients(phone_normalized);
create index idx_subscriptions_client_status on public.subscriptions(client_id,status);
create index idx_subscriptions_provider on public.subscriptions(payment_provider,provider_subscription_id);
create index idx_payments_client on public.payments(client_id,created_at desc);
create index idx_payments_subscription on public.payments(subscription_id,created_at desc);
create index idx_payments_provider on public.payments(origin,provider_payment_id);
create index idx_payments_order on public.payments(origin,provider_order_id);
create index idx_appointments_date on public.appointments(appointment_date);
create index idx_usages_subscription_week on public.subscription_usages(subscription_id,week_reference);

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and active=true); $$;
create or replace function public.is_barber() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='barber' and active=true); $$;
create or replace function public.is_client() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='client' and active=true); $$;

alter table public.profiles enable row level security;
alter table public.barbers enable row level security;
alter table public.clients enable row level security;
alter table public.services enable row level security;
alter table public.plans enable row level security;
alter table public.special_offers enable row level security;
alter table public.special_offer_links enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_cycles enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.appointments enable row level security;
alter table public.subscription_usages enable row level security;
alter table public.vouchers enable row level security;
alter table public.advances enable row level security;
alter table public.discounts enable row level security;
alter table public.settlements enable row level security;
alter table public.settlement_items enable row level security;
alter table public.audit_logs enable row level security;
alter table public.barbershop_settings enable row level security;

create policy profiles_self on public.profiles for select using (id=auth.uid() or public.is_admin());
create policy profiles_admin on public.profiles for all using(public.is_admin()) with check(public.is_admin());
create policy barbers_read_own on public.barbers for select using(profile_id=auth.uid() or public.is_admin());
create policy barbers_public on public.barbers for select using(active=true);
create policy barbers_admin on public.barbers for all using(public.is_admin()) with check(public.is_admin());
create policy clients_self on public.clients for select using(id=auth.uid() or public.is_admin());
create policy clients_update_self on public.clients for update using(id=auth.uid()) with check(id=auth.uid());
create policy clients_admin on public.clients for all using(public.is_admin()) with check(public.is_admin());
create policy services_public on public.services for select using(active=true or public.is_admin());
create policy services_admin on public.services for all using(public.is_admin()) with check(public.is_admin());
create policy plans_public on public.plans for select using((is_public=true and active=true) or public.is_admin());
create policy plans_admin on public.plans for all using(public.is_admin()) with check(public.is_admin());
create policy offers_admin on public.special_offers for all using(public.is_admin()) with check(public.is_admin());
create policy offer_links_admin on public.special_offer_links for all using(public.is_admin()) with check(public.is_admin());
create policy subscriptions_client on public.subscriptions for select using(client_id=auth.uid() or public.is_admin());
create policy subscriptions_barber on public.subscriptions for select using(public.is_admin() or exists(select 1 from public.barbers b where b.id=responsible_barber_id and b.profile_id=auth.uid()));
create policy subscriptions_admin on public.subscriptions for all using(public.is_admin()) with check(public.is_admin());
create policy cycles_client on public.subscription_cycles for select using(exists(select 1 from public.subscriptions s where s.id=subscription_id and (s.client_id=auth.uid() or public.is_admin())));
create policy cycles_admin on public.subscription_cycles for all using(public.is_admin()) with check(public.is_admin());
create policy payments_client on public.payments for select using(client_id=auth.uid() or public.is_admin());
create policy payments_admin on public.payments for all using(public.is_admin()) with check(public.is_admin());
create policy appointments_client on public.appointments for select using(client_id=auth.uid() or public.is_admin());
create policy appointments_client_insert on public.appointments for insert with check(client_id=auth.uid());
create policy appointments_barber on public.appointments for select using(public.is_admin() or exists(select 1 from public.barbers b where b.id=barber_id and b.profile_id=auth.uid()));
create policy appointments_admin on public.appointments for all using(public.is_admin()) with check(public.is_admin());
create policy usages_client on public.subscription_usages for select using(client_id=auth.uid() or public.is_admin());
create policy usages_barber on public.subscription_usages for select using(public.is_admin() or exists(select 1 from public.barbers b where b.id=barber_id and b.profile_id=auth.uid()));
create policy usages_admin on public.subscription_usages for all using(public.is_admin()) with check(public.is_admin());
create policy vouchers_barber on public.vouchers for select using(public.is_admin() or exists(select 1 from public.barbers b where b.id=barber_id and b.profile_id=auth.uid()));
create policy vouchers_admin on public.vouchers for all using(public.is_admin()) with check(public.is_admin());
create policy advances_barber on public.advances for select using(public.is_admin() or exists(select 1 from public.barbers b where b.id=barber_id and b.profile_id=auth.uid()));
create policy advances_admin on public.advances for all using(public.is_admin()) with check(public.is_admin());
create policy discounts_barber on public.discounts for select using(public.is_admin() or exists(select 1 from public.barbers b where b.id=barber_id and b.profile_id=auth.uid()));
create policy discounts_admin on public.discounts for all using(public.is_admin()) with check(public.is_admin());
create policy settlements_barber on public.settlements for select using(public.is_admin());
create policy settlements_admin on public.settlements for all using(public.is_admin()) with check(public.is_admin());
create policy settlement_items_admin on public.settlement_items for all using(public.is_admin()) with check(public.is_admin());
create policy audit_admin on public.audit_logs for select using(public.is_admin());
create policy settings_admin on public.barbershop_settings for all using(public.is_admin()) with check(public.is_admin());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,role,display_name,username,phone,phone_normalized,must_change_password)
 values(new.id,'client',coalesce(new.raw_user_meta_data->>'display_name','Cliente'),null,new.raw_user_meta_data->>'phone',new.raw_user_meta_data->>'phone_normalized',false)
 on conflict(id) do nothing;
 insert into public.clients(id,name,phone,phone_normalized,email)
 values(new.id,coalesce(new.raw_user_meta_data->>'display_name','Cliente'),coalesce(new.raw_user_meta_data->>'phone',''),coalesce(new.raw_user_meta_data->>'phone_normalized',''),new.email)
 on conflict(id) do nothing;
 return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
