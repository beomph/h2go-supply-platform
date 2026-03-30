-- H2GO 주문 데이터베이스 스키마 (Supabase SQL Editor에서 실행)

create extension if not exists pgcrypto;

create table if not exists public.h2go_orders (
  id text primary key,
  consumer_name text not null,
  consumer_address text not null,
  supplier_name text not null,
  supplier_address text not null,
  order_requested_at timestamptz not null,
  order_accepted_at timestamptz,
  delivery_due_at timestamptz,
  supply_condition text not null check (supply_condition in ('delivery', 'ex_factory')),
  order_status text not null,
  consumer_note text,
  tube_trailers integer not null default 1,
  inbound_tt_numbers text[] not null default '{}',
  inbound_driver_name text,
  inbound_started_at timestamptz,
  outbound_tt_numbers text[] not null default '{}',
  outbound_driver_name text,
  outbound_at timestamptz,
  outbound_quantity_kg numeric(10,2),
  supplier_signer_name text,
  consumer_signer_name text,
  change_history jsonb not null default '[]'::jsonb,
  transport_info jsonb not null default '{}'::jsonb,
  change_request jsonb,
  cancel_request jsonb,
  last_change jsonb,
  last_cancel jsonb,
  extra_payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_h2go_orders_supplier_name on public.h2go_orders (supplier_name);
create index if not exists idx_h2go_orders_consumer_name on public.h2go_orders (consumer_name);
create index if not exists idx_h2go_orders_due_at on public.h2go_orders (delivery_due_at);
create index if not exists idx_h2go_orders_status on public.h2go_orders (order_status);

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

drop trigger if exists trg_h2go_orders_updated_at on public.h2go_orders;
create trigger trg_h2go_orders_updated_at
before update on public.h2go_orders
for each row execute function public.h2go_set_updated_at();

alter table public.h2go_orders enable row level security;

drop policy if exists "h2go_orders_select_authenticated" on public.h2go_orders;
create policy "h2go_orders_select_authenticated"
on public.h2go_orders
for select
to authenticated
using (true);

drop policy if exists "h2go_orders_insert_authenticated" on public.h2go_orders;
create policy "h2go_orders_insert_authenticated"
on public.h2go_orders
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists "h2go_orders_update_authenticated" on public.h2go_orders;
create policy "h2go_orders_update_authenticated"
on public.h2go_orders
for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);
