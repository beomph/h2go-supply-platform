/**
 * H2GO + Supabase (브라우저, ES modules)
 *
 * dashboard.html 등에 다음 순서로 추가:
 *   <script src="js/supabase-config.js"></script>
 *   <script type="module" src="js/supabase-client.js"></script>
 *
 * 이후 다른 인라인 스크립트에서 window.h2goSupabase 사용 (모듈 로드 완료 후).
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const g = globalThis;
const cfg = g.H2GO_SUPABASE;

if (!cfg || !cfg.url || !cfg.anonKey || String(cfg.anonKey).indexOf('여기에_') === 0) {
    console.warn('[H2GO] Supabase: js/supabase-config.js 를 만들고 anon 키를 설정하세요. (supabase-config.example.js 복사)');
} else {
    g.h2goSupabase = createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
    });
}
