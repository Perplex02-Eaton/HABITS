-- ============================================================
-- HABITS · Esquema de Supabase para la sincronización en la nube
-- Ejecuta esto en el Editor SQL de tu proyecto Supabase
-- (Dashboard > SQL Editor > New query) una sola vez.
-- ============================================================

-- Tabla única que guarda todos los datos del usuario como JSON.
create extension if not exists "pgcrypto";

create table if not exists public.habits_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id)
);

-- Permite que cada usuario solo vea y edite su propio registro.
alter table public.habits_data enable row level security;

drop policy if exists "select own data" on public.habits_data;
create policy "select own data"
  on public.habits_data
  for select
  using (auth.uid() = user_id);

drop policy if exists "insert own data" on public.habits_data;
create policy "insert own data"
  on public.habits_data
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own data" on public.habits_data;
create policy "update own data"
  on public.habits_data
  for update
  using (auth.uid() = user_id);

-- ============================================================
-- CUENTAS, PROPIETARIO Y SUSCRIPCIONES
-- ============================================================

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
-- No se crean políticas de escritura: solo service_role/SQL puede nombrar admins.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'mercadopago',
  provider_subscription_id text unique,
  plan text not null check (plan in ('student_monthly', 'student_yearly')),
  status text not null default 'pending',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);
alter table public.subscriptions enable row level security;

drop policy if exists "select own subscription" on public.subscriptions;
create policy "select own subscription" on public.subscriptions
  for select using (auth.uid() = user_id);

create table if not exists public.payment_events (
  id text primary key,
  provider text not null default 'mercadopago',
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
alter table public.payment_events enable row level security;

create or replace function public.get_my_access()
returns table(plan text, is_owner boolean, subscription_status text, period_end timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select
    case
      when exists(select 1 from public.app_admins a where a.user_id = auth.uid()) then 'owner'
      when s.status = 'authorized' and (s.current_period_end is null or s.current_period_end > now()) then 'student'
      else 'free'
    end,
    exists(select 1 from public.app_admins a where a.user_id = auth.uid()),
    coalesce(s.status, 'none'),
    s.current_period_end
  from (select 1) seed
  left join lateral (
    select status, current_period_end
    from public.subscriptions
    where user_id = auth.uid()
    order by updated_at desc
    limit 1
  ) s on true;
$$;

revoke all on function public.get_my_access() from public;
grant execute on function public.get_my_access() to authenticated;

create or replace function public.has_premium_access()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists(select 1 from public.app_admins a where a.user_id = auth.uid())
    or exists(
      select 1 from public.subscriptions s
      where s.user_id = auth.uid()
        and s.status = 'authorized'
        and (s.current_period_end is null or s.current_period_end > now())
    );
$$;
revoke all on function public.has_premium_access() from public;
grant execute on function public.has_premium_access() to authenticated;

-- La nube es premium; los datos locales siguen funcionando para el plan gratis.
drop policy if exists "select own data" on public.habits_data;
create policy "select own premium data" on public.habits_data
  for select using (auth.uid() = user_id and public.has_premium_access());
drop policy if exists "insert own data" on public.habits_data;
create policy "insert own premium data" on public.habits_data
  for insert with check (auth.uid() = user_id and public.has_premium_access());
drop policy if exists "update own data" on public.habits_data;
create policy "update own premium data" on public.habits_data
  for update using (auth.uid() = user_id and public.has_premium_access())
  with check (auth.uid() = user_id and public.has_premium_access());

-- DESPUÉS de crear tu cuenta, ejecuta UNA VEZ reemplazando el correo:
-- insert into public.app_admins(user_id)
-- select id from auth.users where email = 'TU_CORREO@EJEMPLO.COM'
-- on conflict (user_id) do nothing;
