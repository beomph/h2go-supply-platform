-- H2GO 수소 튜브트레일러(T/T) · 운반기사 마스터 (Supabase SQL Editor에서 실행)
-- 로그인 사용자(authenticated)별로 본인 행만 CRUD (RLS)
-- 참고: `h2go_orders`용 `h2go_set_updated_at`가 이미 있으면 그대로 재사용됩니다.

create extension if not exists pgcrypto;

create or replace function public.h2go_set_updated_at()
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

-- T/T: 차량번호, 소유자, 차량검사일, 압력용기검사일, 기타
create table if not exists public.h2go_tube_trailers (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references auth.users (id) on delete cascade,
  vehicle_number text not null,
  owner_name text not null default '',
  vehicle_inspection_date date,
  pressure_vessel_inspection_date date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint h2go_tt_owner_vehicle_unique unique (owner_member_id, vehicle_number)
);

create index if not exists idx_h2go_tt_owner on public.h2go_tube_trailers (owner_member_id);

drop trigger if exists trg_h2go_tube_trailers_updated_at on public.h2go_tube_trailers;
create trigger trg_h2go_tube_trailers_updated_at
before update on public.h2go_tube_trailers
for each row execute function public.h2go_set_updated_at();

-- 운반기사: 기사명, 트랙터 번호, 연식, 모델명, 차량검사일, 기타
create table if not exists public.h2go_transport_drivers (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references auth.users (id) on delete cascade,
  driver_name text not null,
  tractor_plate_number text not null default '',
  vehicle_model_year text not null default '',
  vehicle_model_name text not null default '',
  vehicle_inspection_date date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_h2go_drv_owner on public.h2go_transport_drivers (owner_member_id);

-- updated_at 트리거: h2go_orders와 동일 함수 재사용
drop trigger if exists trg_h2go_transport_drivers_updated_at on public.h2go_transport_drivers;
create trigger trg_h2go_transport_drivers_updated_at
before update on public.h2go_transport_drivers
for each row execute function public.h2go_set_updated_at();

alter table public.h2go_tube_trailers enable row level security;
alter table public.h2go_transport_drivers enable row level security;

-- T/T policies
drop policy if exists "h2go_tt_select_own" on public.h2go_tube_trailers;
create policy "h2go_tt_select_own"
on public.h2go_tube_trailers for select to authenticated
using (owner_member_id = auth.uid());

drop policy if exists "h2go_tt_insert_own" on public.h2go_tube_trailers;
create policy "h2go_tt_insert_own"
on public.h2go_tube_trailers for insert to authenticated
with check (owner_member_id = auth.uid());

drop policy if exists "h2go_tt_update_own" on public.h2go_tube_trailers;
create policy "h2go_tt_update_own"
on public.h2go_tube_trailers for update to authenticated
using (owner_member_id = auth.uid())
with check (owner_member_id = auth.uid());

drop policy if exists "h2go_tt_delete_own" on public.h2go_tube_trailers;
create policy "h2go_tt_delete_own"
on public.h2go_tube_trailers for delete to authenticated
using (owner_member_id = auth.uid());

-- Driver policies
drop policy if exists "h2go_drv_select_own" on public.h2go_transport_drivers;
create policy "h2go_drv_select_own"
on public.h2go_transport_drivers for select to authenticated
using (owner_member_id = auth.uid());

drop policy if exists "h2go_drv_insert_own" on public.h2go_transport_drivers;
create policy "h2go_drv_insert_own"
on public.h2go_transport_drivers for insert to authenticated
with check (owner_member_id = auth.uid());

drop policy if exists "h2go_drv_update_own" on public.h2go_transport_drivers;
create policy "h2go_drv_update_own"
on public.h2go_transport_drivers for update to authenticated
using (owner_member_id = auth.uid())
with check (owner_member_id = auth.uid());

drop policy if exists "h2go_drv_delete_own" on public.h2go_transport_drivers;
create policy "h2go_drv_delete_own"
on public.h2go_transport_drivers for delete to authenticated
using (owner_member_id = auth.uid());
