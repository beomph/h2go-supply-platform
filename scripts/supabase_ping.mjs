/**
 * Supabase 연결·스키마 존재 여부 간단 확인
 * 사용: 프로젝트 루트에 .env (SUPABASE_URL, SUPABASE_ANON_KEY)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
    console.error('SUPABASE_URL / SUPABASE_ANON_KEY 가 .env 에 없습니다.');
    process.exit(1);
}

const supabase = createClient(url, key);

const { data, error } = await supabase.from('business_party').select('id').limit(1);

if (error) {
    console.error('Supabase 응답 오류:', error.message);
    console.error('→ h2go_schema.sql 을 SQL Editor에서 실행했는지, RLS로 막혔는지 확인하세요.');
    process.exit(1);
}

console.log('OK: Supabase 연결 성공. business_party 조회:', data);
