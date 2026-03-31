H2GO 스키마를 Supabase에 올리는 순서
=====================================

1) Supabase 대시보드
   https://supabase.com/dashboard → 해당 프로젝트 (zbihunanzjgyceqfegka)

2) SQL Editor → New query

3) data/schema/h2go_schema.sql 파일 전체를 붙여넣고 Run

   - "extension pgcrypto already exists" 등은 무시해도 되는 경우가 많습니다.
   - 오류 나면: Database → Extensions 에서 "pgcrypto" 활성화 후 다시 실행.

4) 보안 (필수)
   - 기본적으로 테이블에 RLS(Row Level Security)를 켜고 정책을 작성해야
     anon 키로도 안전합니다.
   - 개발 중에만 임시로 RLS를 끄거나 "모두 허용" 정책을 쓰지 마세요 (운영 노출 위험).

5) API 키
   - Project Settings → API
   - URL: https://zbihunanzjgyceqfegka.supabase.co
   - anon public → 프론트(.env의 SUPABASE_ANON_KEY, js/supabase-config.js)
   - service_role → 서버만 (절대 브라우저에 넣지 않기)

6) 로컬에서 연결 확인 (Node)
   npm install
   .env 에 SUPABASE_URL, SUPABASE_ANON_KEY 입력 후:
   node scripts/supabase_ping.mjs
