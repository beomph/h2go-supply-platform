-- H2GO 회원가입 DB 스키마 (Supabase SQL Editor에서 실행)
-- 비밀번호는 auth.users 에만 저장. 프로필: 사업자분류(복수), 사용자명, 회원권한, 로그인 아이디.
-- 기존 DB가 이미 있는 경우: 먼저 supabase_member_profiles_migrate_simplify.sql 실행.

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'business_party') then
    create type public.business_party as enum ('supplier', 'transporter', 'consumer');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'member_authority') then
    create type public.member_authority as enum ('admin', 'manager', 'monitoring');
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.member_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_parties public.business_party[] not null default array['consumer']::public.business_party[],
  username text not null,
  login_id text not null unique,
  authority public.member_authority not null default 'manager',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_profiles_business_parties_nonempty check (cardinality(business_parties) >= 1)
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
