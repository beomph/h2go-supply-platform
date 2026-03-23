-- H2GO 회원가입 DB 스키마 (Supabase SQL Editor에서 실행)

do $$
begin
  if not exists (select 1 from pg_type where typname = 'participant_type') then
    create type public.participant_type as enum ('supplier', 'transporter', 'consumer');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('user', 'admin');
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.member_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null,
  business_number varchar(10) not null unique,
  representative_name text not null,
  participant_types public.participant_type[] not null,
  username text not null,
  login_id text not null unique,
  authority public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_number_format check (business_number ~ '^[0-9]{10}$')
);

drop trigger if exists trg_member_profiles_updated_at on public.member_profiles;
create trigger trg_member_profiles_updated_at
before update on public.member_profiles
for each row execute function public.set_updated_at();

alter table public.member_profiles enable row level security;

drop policy if exists "select own profile" on public.member_profiles;
create policy "select own profile"
on public.member_profiles
for select
using (auth.uid() = id);

drop policy if exists "update own profile" on public.member_profiles;
create policy "update own profile"
on public.member_profiles
for update
using (auth.uid() = id);

drop policy if exists "insert own profile" on public.member_profiles;
create policy "insert own profile"
on public.member_profiles
for insert
with check (auth.uid() = id);
