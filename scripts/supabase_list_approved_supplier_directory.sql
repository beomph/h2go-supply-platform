-- 수요자 화면「공급자 선택」: member_profiles 중 승인되었고 business_parties에 supplier 포함인 계정만
-- Supabase MCP 또는 SQL Editor에서 적용 후, 대시보드에서 rpc('list_approved_supplier_directory') 호출

CREATE OR REPLACE FUNCTION public.list_approved_supplier_directory()
RETURNS TABLE (username text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mp.username::text
  FROM public.member_profiles mp
  WHERE mp.approval_status = 'approved'
    AND 'supplier'::public.business_party = ANY(mp.business_parties)
  ORDER BY mp.username ASC;
$$;

REVOKE ALL ON FUNCTION public.list_approved_supplier_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_approved_supplier_directory() TO authenticated;
