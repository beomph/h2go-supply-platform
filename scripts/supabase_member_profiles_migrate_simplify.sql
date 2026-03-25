-- 기존 member_profiles: 사업자명·번호·대표자명·단일 business_party 제거 → business_parties 배열만 사용
-- Supabase SQL Editor에서 1회 실행 (이미 v2 스키마면 스킵됨)

alter table public.member_profiles
  add column if not exists business_parties public.business_party[];

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'member_profiles' and column_name = 'business_party'
  ) then
    execute $u$
      update public.member_profiles
      set business_parties = array[business_party]::public.business_party[]
      where business_parties is null
    $u$;
  end if;
end $$;

update public.member_profiles
set business_parties = array['consumer'::public.business_party]
where business_parties is null;

alter table public.member_profiles drop column if exists business_party;
alter table public.member_profiles drop column if exists business_name;
alter table public.member_profiles drop column if exists business_number;
alter table public.member_profiles drop column if exists representative_name;

alter table public.member_profiles alter column business_parties set not null;
alter table public.member_profiles
  alter column business_parties
  set default array['consumer']::public.business_party[];

alter table public.member_profiles drop constraint if exists member_profiles_business_parties_nonempty;
alter table public.member_profiles add constraint member_profiles_business_parties_nonempty
  check (cardinality(business_parties) >= 1);
