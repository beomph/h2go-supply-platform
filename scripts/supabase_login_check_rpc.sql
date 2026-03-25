-- 로그인 전 아이디 가입 여부 확인 (Supabase SQL Editor에서 1회 실행 가능)
-- 클라이언트는 auth 전에 RPC로 존재 여부만 조회하고, 미가입 시 안내 팝업을 띄웁니다.

create or replace function public.check_login_id_registered(p_login_id text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.member_profiles
    where lower(trim(login_id)) = lower(trim(p_login_id))
  );
$$;

revoke all on function public.check_login_id_registered(text) from public;
grant execute on function public.check_login_id_registered(text) to anon;
grant execute on function public.check_login_id_registered(text) to authenticated;
