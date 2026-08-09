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