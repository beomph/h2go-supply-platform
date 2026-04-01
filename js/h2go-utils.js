// H2GO — 공통 유틸리티
// script.js · dashboard.js · transport-assets.js 에서 공유하는 상수·함수 모음.
// Supabase CDN 로드 이후, 각 페이지 스크립트 이전에 삽입할 것.

const AUTH_KEY = "h2go_auth";
const THEME_KEY = "h2go_theme";
const DEFAULT_SUPABASE_URL = "https://zbihunanzjgyceqfegka.supabase.co";
const SUPABASE_ANON_KEY_STORAGE = "h2go_supabase_anon_key";

function safeJsonParse(raw, fallback) {
    try { return JSON.parse(raw); } catch (_) { return fallback; }
}

function getSupabaseUrl() {
    const fromWindow = String(window.H2GO_SUPABASE_URL || "").trim();
    return fromWindow || DEFAULT_SUPABASE_URL;
}

function getSupabaseAnonKey() {
    const fromWindow = String(window.H2GO_SUPABASE_ANON_KEY || "").trim();
    if (fromWindow) return fromWindow;
    return String(localStorage.getItem(SUPABASE_ANON_KEY_STORAGE) || "").trim();
}

function getSupabaseClient() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") return null;
    const anonKey = getSupabaseAnonKey();
    if (!anonKey) return null;
    return window.supabase.createClient(getSupabaseUrl(), anonKey);
}

function updateThemeToggleUI(themeClass) {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;
    const isLight = themeClass === "theme-light";
    btn.dataset.theme = isLight ? "light" : "dark";
    const labelEl = btn.querySelector(".theme-toggle-label");
    if (labelEl) labelEl.textContent = isLight ? "Light" : "Dark";
    btn.setAttribute("aria-label", isLight ? "다크 모드로 전환" : "라이트 모드로 전환");
}

function applyThemeClass(themeClass) {
    const body = document.body;
    if (!body) return;
    const next = themeClass === "theme-light" ? "theme-light" : "theme-dark";
    body.classList.remove("theme-light", "theme-dark");
    body.classList.add(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
    updateThemeToggleUI(next);
}

function initTheme() {
    let stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch (_) {}
    const initial = stored === "theme-light" || stored === "theme-dark" ? stored : "theme-dark";
    applyThemeClass(initial);
    const btn = document.getElementById("themeToggle");
    if (btn) {
        btn.addEventListener("click", () => {
            const current = document.body.classList.contains("theme-light") ? "theme-light" : "theme-dark";
            applyThemeClass(current === "theme-light" ? "theme-dark" : "theme-light");
        });
        updateThemeToggleUI(initial);
    }
}

function redirectToLogin() {
    window.location.href = "index.html";
}
