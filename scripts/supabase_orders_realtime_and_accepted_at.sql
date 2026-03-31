-- Supabase SQL Editor (또는 마이그레이션)에서 이미 적용된 경우 스킵 가능
-- 1) 대시보드 동기화용 order_accepted_at
-- 2) Supabase Realtime으로 h2go_orders 변경 구독 (다중 탭·사용자 반영)

alter table public.h2go_orders
  add column if not exists order_accepted_at timestamptz;

comment on column public.h2go_orders.order_accepted_at is '공급자 접수(또는 변경 접수) 시각. extra_payload.acceptedAt과 동기화.';

alter publication supabase_realtime add table public.h2go_orders;
