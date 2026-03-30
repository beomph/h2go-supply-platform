-- 기존 프로젝트: Supabase SQL Editor에서 한 번 실행
-- 공급자 접수 일시(UTC). 대시보드에는 표시하지 않으며 동기화·분석용입니다.

alter table public.h2go_orders
  add column if not exists order_accepted_at timestamptz;

comment on column public.h2go_orders.order_accepted_at is '공급자 접수(또는 변경 접수) 시각. extra_payload.acceptedAt과 동기화.';
