// H2GO - 수소거래 플랫폼 스크립트
// Auth는 Supabase를 사용하고, 앱 세션 정보는 기존 대시보드 호환을 위해 localStorage에 보관한다.

const AUTH_KEY = "h2go_auth";
const THEME_KEY = "h2go_theme";
const SUPABASE_URL = "https://zbihunanzjgyceqfegka.supabase.co";
const SUPABASE_ANON_KEY_STORAGE = "h2go_supabase_anon_key";

const MEMBER_AUTHORITIES = new Set(["admin", "manager", "monitoring"]);
const BUSINESS_PARTIES = new Set(["supplier", "transporter", "consumer"]);

function safeJsonParse(raw, fallback) {
    try {
        return JSON.parse(raw);
    } catch (_) {
        return fallback;
    }
}

function normalizeId(id) {
    return String(id || "").trim().toLowerCase();
}

function normalizeMemberAuthority(raw) {
    const s = String(raw || "").trim();
    if (MEMBER_AUTHORITIES.has(s)) return s;
    if (s === "user") return "manager";
    return "manager";
}

function normalizeBusinessParty(raw) {
    const s = String(raw || "").trim();
    return BUSINESS_PARTIES.has(s) ? s : "consumer";
}

/** DB·히든필드·세션에서 사업자분류 배열 */
function parseBusinessPartiesList(raw, legacySingle) {
    if (Array.isArray(raw)) {
        const out = [...new Set(raw.map((p) => normalizeBusinessParty(p)))];
        if (out.length) return out;
    } else if (raw != null && raw !== "") {
        const s = String(raw).trim();
        if (s.startsWith("[")) {
            try {
                return parseBusinessPartiesList(JSON.parse(s), legacySingle);
            } catch (_) {}
        }
    }
    if (legacySingle != null && legacySingle !== "") return [normalizeBusinessParty(legacySingle)];
    return ["consumer"];
}

/**
 * 공급자 → 판매(공급) 대시보드, 수요자 → 구매 대시보드. 둘 다 선택 시 전환 가능.
 * 운송자만 선택 → 구매 화면만(기존과 동일).
 */
function rolesFromBusinessParties(parties, preferredActive) {
    const set = new Set(parties.map((p) => normalizeBusinessParty(p)));
    const roles = [];
    if (set.has("supplier")) roles.push("supplier");
    if (set.has("consumer")) roles.push("consumer");
    if (!roles.length) {
        if (set.has("transporter")) roles.push("consumer");
        else roles.push("consumer");
    }
    let active =
        preferredActive === "supplier" || preferredActive === "consumer" ? preferredActive : roles[0];
    if (!roles.includes(active)) active = roles[0];
    return { roles, activeRole: active };
}

function setAuth(auth) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

function getAuth() {
    const a = safeJsonParse(localStorage.getItem(AUTH_KEY) || "null", null);
    if (!a || typeof a !== "object") return null;
    const id = normalizeId(a.id);
    const name = String(a.name || "").trim();
    const businessParties = parseBusinessPartiesList(a.businessParties, a.businessParty);
    const { roles, activeRole } = rolesFromBusinessParties(businessParties, a.activeRole);
    if (!id || !name) return null;
    return {
        id,
        name,
        roles,
        activeRole,
        authority: normalizeMemberAuthority(a.authority),
        businessParties,
        businessParty: businessParties[0] || "consumer",
        supabaseUserId: a.supabaseUserId || null,
        loggedInAt: a.loggedInAt || null,
    };
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
    try {
        localStorage.setItem(THEME_KEY, next);
    } catch (_) {}
    updateThemeToggleUI(next);
}

function initTheme() {
    let stored = null;
    try {
        stored = localStorage.getItem(THEME_KEY);
    } catch (_) {}
    const initial = stored === "theme-light" || stored === "theme-dark" ? stored : "theme-dark";
    applyThemeClass(initial);
    const btn = document.getElementById("themeToggle");
    if (btn) {
        btn.addEventListener("click", () => {
            const current = document.body.classList.contains("theme-light") ? "theme-light" : "theme-dark";
            applyThemeClass(current === "theme-light" ? "theme-dark" : "theme-light");
        });
    }
}

function toAuthEmail(loginId) {
    return `${normalizeId(loginId)}@h2go.local`;
}

function getSupabaseAnonKey() {
    const fromWindow = String(window.H2GO_SUPABASE_ANON_KEY || "").trim();
    if (fromWindow) return fromWindow;
    const fromStorage = String(localStorage.getItem(SUPABASE_ANON_KEY_STORAGE) || "").trim();
    if (fromStorage) return fromStorage;
    return "";
}

function getSupabaseClient() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") return null;
    const anonKey = getSupabaseAnonKey();
    if (!anonKey) return null;
    return window.supabase.createClient(SUPABASE_URL, anonKey);
}

async function loadProfileByUserId(client, userId) {
    const { data, error } = await client
        .from("member_profiles")
        .select("id, business_parties, login_id, authority, username")
        .eq("id", userId)
        .single();
    if (error) throw error;
    return data;
}

function showRegister(open) {
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    const showRegisterBtn = document.getElementById("showRegisterBtn");
    if (!loginForm || !registerForm) return;
    loginForm.classList.toggle("is-hidden", !!open);
    showRegisterBtn?.classList.toggle("is-hidden", !!open);
    registerForm.classList.toggle("is-hidden", !open);
}

function readRegisterBusinessParties() {
    const hidden = document.getElementById("registerBusinessPartyValue");
    return parseBusinessPartiesList(hidden?.value || "[]", null);
}

function wireAuthorityButtons() {
    const hidden = document.getElementById("registerAuthorityValue");
    const buttons = document.querySelectorAll("#registerForm .authority-btn");
    if (!hidden || !buttons.length) return;
    buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const v = String(btn.getAttribute("data-authority") || "").trim();
            hidden.value = normalizeMemberAuthority(v);
            buttons.forEach((b) => {
                const on = b === btn;
                b.classList.toggle("is-selected", on);
                b.setAttribute("aria-pressed", on ? "true" : "false");
            });
        });
    });
}

function wireBusinessPartyButtons() {
    const hidden = document.getElementById("registerBusinessPartyValue");
    const buttons = document.querySelectorAll("#registerForm .business-party-btn");
    if (!hidden || !buttons.length) return;
    if (!hidden.value || hidden.value === "") hidden.value = "[]";
    buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const v = String(btn.getAttribute("data-party") || "").trim();
            if (!BUSINESS_PARTIES.has(v)) return;
            const cur = new Set(readRegisterBusinessParties());
            if (cur.has(v)) cur.delete(v);
            else cur.add(v);
            const arr = [...cur];
            hidden.value = JSON.stringify(arr);
            buttons.forEach((b) => {
                const pv = String(b.getAttribute("data-party") || "").trim();
                const on = cur.has(pv);
                b.classList.toggle("is-selected", on);
                b.setAttribute("aria-pressed", on ? "true" : "false");
            });
        });
    });
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client) {
        alert("Supabase ANON KEY가 설정되지 않았습니다. localStorage의 h2go_supabase_anon_key 또는 window.H2GO_SUPABASE_ANON_KEY를 설정해 주세요.");
        return;
    }

    const loginId = normalizeId(document.getElementById("loginId")?.value);
    const password = String(document.getElementById("loginPassword")?.value || "");
    if (!loginId) return alert("아이디를 입력해 주세요.");
    if (!password) return alert("비밀번호를 입력해 주세요.");

    const { data: isRegistered, error: checkError } = await client.rpc("check_login_id_registered", {
        p_login_id: loginId,
    });
    if (checkError) {
        alert(`로그인 확인 중 오류가 발생했습니다: ${checkError.message || "알 수 없는 오류"}`);
        return;
    }
    if (!isRegistered) {
        alert("가입되지 않은 아이디입니다.\n회원가입 후 이용해 주세요.");
        return;
    }

    const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
        email: toAuthEmail(loginId),
        password,
    });
    if (signInError || !signInData.user?.id) {
        alert("비밀번호가 올바르지 않습니다.");
        return;
    }

    let profile = null;
    try {
        profile = await loadProfileByUserId(client, signInData.user.id);
    } catch (_) {
        alert("회원 프로필 정보를 불러오지 못했습니다. 관리자에게 문의해 주세요.");
        return;
    }

    const authority = normalizeMemberAuthority(profile.authority);
    const businessParties = parseBusinessPartiesList(profile.business_parties, null);
    const { roles, activeRole } = rolesFromBusinessParties(businessParties, null);

    setAuth({
        id: profile.login_id || loginId,
        name: String(profile.username || loginId).trim() || loginId,
        roles,
        activeRole,
        authority,
        businessParties,
        businessParty: businessParties[0] || "consumer",
        supabaseUserId: signInData.user.id,
        loggedInAt: new Date().toISOString(),
    });
    window.location.href = "dashboard.html";
}

async function handleRegisterSubmit(e) {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client) {
        alert("Supabase ANON KEY가 설정되지 않았습니다. localStorage의 h2go_supabase_anon_key 또는 window.H2GO_SUPABASE_ANON_KEY를 설정해 주세요.");
        return;
    }

    const businessParties = readRegisterBusinessParties();
    const username = String(document.getElementById("registerUsername")?.value || "").trim();
    const loginId = normalizeId(document.getElementById("registerId")?.value);
    const authority = normalizeMemberAuthority(document.getElementById("registerAuthorityValue")?.value);
    const password = String(document.getElementById("registerPassword")?.value || "");
    const passwordConfirm = String(document.getElementById("registerPasswordConfirm")?.value || "");

    if (!businessParties.length) return alert("사업자분류를 한 가지 이상 선택해 주세요.");
    if (!username) return alert("사용자명을 입력해 주세요.");
    if (!loginId) return alert("아이디를 입력해 주세요.");
    if (/\s/.test(loginId)) return alert("아이디에는 공백을 사용할 수 없습니다.");
    if (!password) return alert("비밀번호를 입력해 주세요.");
    if (password !== passwordConfirm) return alert("비밀번호가 일치하지 않습니다.");

    const email = toAuthEmail(loginId);
    const { data: signUpData, error: signUpError } = await client.auth.signUp({ email, password });
    if (signUpError || !signUpData.user?.id) {
        const msg = String(signUpError?.message || "");
        const lc = msg.toLowerCase();
        if (lc.includes("already")) {
            alert("이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.");
            return;
        }
        if (
            signUpError?.status === 429 ||
            lc.includes("rate limit") ||
            lc.includes("too many requests") ||
            lc.includes("email rate")
        ) {
            alert(
                "회원가입 확인 메일 발송 한도에 걸렸습니다. (Supabase 이메일 제한)\n\n" +
                    "H2GO는 '아이디@h2go.local'만 쓰므로 이메일 확인이 필요 없습니다.\n\n" +
                    "【대시보드】 왼쪽 Authentication → Sign In / Providers 로 이동한 뒤,\n" +
                    "아래쪽 「Email」 블록을 펼치면 Confirm email(또는 Enable email confirmations) 스위치가 있습니다. 끄세요.\n" +
                    "(상단 General 탭만 보면 스위치가 안 보일 수 있습니다.)\n\n" +
                    "【API】 저장소 scripts/supabase_mailer_autoconfirm.ps1 로 mailer_autoconfirm 을 켤 수 있습니다.\n" +
                    "(Dashboard → Account → Access Tokens, SUPABASE_ACCESS_TOKEN)\n\n" +
                    "설명: https://supabase.com/docs/guides/auth/general-configuration\n" +
                    "한도: https://supabase.com/docs/guides/deployment/going-into-prod#auth-rate-limits"
            );
            return;
        }
        alert(`회원가입에 실패했습니다: ${msg || "알 수 없는 오류"}`);
        return;
    }

    const userId = signUpData.user.id;
    const { error: profileError } = await client.from("member_profiles").insert({
        id: userId,
        business_parties: businessParties,
        username,
        login_id: loginId,
        authority,
    });

    if (profileError) {
        alert(`회원 프로필 저장에 실패했습니다: ${profileError.message || "알 수 없는 오류"}`);
        return;
    }

    const { data: signInData, error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError || !signInData.user?.id) {
        alert("회원가입이 완료되었습니다. 로그인 화면에서 다시 로그인해 주세요.");
        showRegister(false);
        return;
    }

    const { roles, activeRole } = rolesFromBusinessParties(businessParties, null);

    setAuth({
        id: loginId,
        name: username,
        roles,
        activeRole,
        authority,
        businessParties,
        businessParty: businessParties[0] || "consumer",
        supabaseUserId: signInData.user.id,
        loggedInAt: new Date().toISOString(),
    });
    window.location.href = "dashboard.html";
}

function wireEvents() {
    document.getElementById("showRegisterBtn")?.addEventListener("click", () => showRegister(true));
    document.getElementById("showLoginBtn")?.addEventListener("click", () => showRegister(false));
    document.getElementById("loginForm")?.addEventListener("submit", (e) => {
        handleLoginSubmit(e).catch((err) => {
            alert(`로그인 중 오류가 발생했습니다: ${err?.message || "알 수 없는 오류"}`);
        });
    });
    document.getElementById("registerForm")?.addEventListener("submit", (e) => {
        handleRegisterSubmit(e).catch((err) => {
            alert(`회원가입 중 오류가 발생했습니다: ${err?.message || "알 수 없는 오류"}`);
        });
    });
    wireBusinessPartyButtons();
    wireAuthorityButtons();
}

function init() {
    initTheme();
    try {
        if (getAuth()) {
            window.location.href = "dashboard.html";
            return;
        }
    } catch (_) {}
    wireEvents();
}

init();
