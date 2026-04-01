// H2GO - 수소거래 플랫폼 스크립트
// Auth는 Supabase를 사용하고, 앱 세션 정보는 기존 대시보드 호환을 위해 localStorage에 보관한다.
// 회원가입: Edge `h2go-submit-signup-request` → 관리자 메일 승인 → `h2go-approve-signup`에서 Auth·프로필 생성. (URL·키는 /h2go-config.js 가 우선)

const MEMBER_AUTHORITIES = new Set(["admin", "manager", "monitoring"]);
const BUSINESS_PARTIES = new Set(["supplier", "transporter", "consumer"]);

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

/** 회원가입 폼 히든 JSON 전용: 빈 배열은 그대로 둠(수요자 자동 추가 없음) */
function parseRegisterBusinessPartiesOnly(raw) {
    const norm = (p) => {
        const s = String(p ?? "").trim();
        return BUSINESS_PARTIES.has(s) ? s : null;
    };
    if (Array.isArray(raw)) {
        return [...new Set(raw.map(norm).filter(Boolean))];
    }
    if (raw != null && raw !== "") {
        const s = String(raw).trim();
        if (s.startsWith("[")) {
            try {
                return parseRegisterBusinessPartiesOnly(JSON.parse(s));
            } catch (_) {}
        }
    }
    return [];
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

function toAuthEmail(loginId) {
    return `${normalizeId(loginId)}@h2go.local`;
}

/** Supabase URL에서 project ref로 Providers(Email) 설정 페이지 링크 */
function getSupabaseAuthProvidersDashboardUrl() {
    try {
        const host = new URL(getSupabaseUrl()).hostname;
        const ref = host.replace(/\.supabase\.co$/i, "");
        if (!ref || ref === host) return "https://supabase.com/dashboard";
        return `https://supabase.com/dashboard/project/${ref}/auth/providers`;
    } catch (_) {
        return "https://supabase.com/dashboard";
    }
}

async function loadProfileByUserId(client, userId) {
    const { data, error } = await client
        .from("member_profiles")
        .select("id, business_parties, login_id, authority, username, approval_status, contact_email, contact_phone")
        .eq("id", userId)
        .single();
    if (error) throw error;
    return data;
}

const AUTH_VIEW_TRANSITION_MS = 400;

function showRegister(open) {
    const loginSection = document.getElementById("loginSection");
    const registerSection = document.getElementById("registerSection");
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    const showRegisterBtn = document.getElementById("showRegisterBtn");
    if (!loginForm || !registerForm) return;

    if (loginSection && registerSection) {
        if (open) {
            loginSection.classList.remove("auth-section--active");
            registerSection.classList.add("auth-section--active");
            loginSection.setAttribute("aria-hidden", "true");
            registerSection.setAttribute("aria-hidden", "false");
            window.setTimeout(() => document.getElementById("registerUsername")?.focus(), AUTH_VIEW_TRANSITION_MS);
            const partyHidden = document.getElementById("registerBusinessPartyValue");
            if (partyHidden) partyHidden.value = "[]";
            syncRegisterBusinessPartyButtonUI();
        } else {
            registerSection.classList.remove("auth-section--active");
            loginSection.classList.add("auth-section--active");
            registerSection.setAttribute("aria-hidden", "true");
            loginSection.setAttribute("aria-hidden", "false");
            window.setTimeout(() => document.getElementById("loginId")?.focus(), AUTH_VIEW_TRANSITION_MS);
        }
        return;
    }

    loginForm.classList.toggle("is-hidden", !!open);
    showRegisterBtn?.classList.toggle("is-hidden", !!open);
    registerForm.classList.toggle("is-hidden", !open);
}

function readRegisterBusinessParties() {
    const hidden = document.getElementById("registerBusinessPartyValue");
    return parseRegisterBusinessPartiesOnly(hidden?.value || "[]");
}

function syncRegisterBusinessPartyButtonUI() {
    const hidden = document.getElementById("registerBusinessPartyValue");
    const buttons = document.querySelectorAll("#registerForm .business-party-btn");
    if (!hidden || !buttons.length) return;
    const cur = new Set(readRegisterBusinessParties());
    buttons.forEach((b) => {
        const pv = String(b.getAttribute("data-party") || "").trim();
        const on = cur.has(pv);
        b.classList.toggle("is-selected", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
    });
}

function getEdgeFunctionUrl(slug) {
    const base = getSupabaseUrl().replace(/\/+$/, "");
    return `${base}/functions/v1/${slug}`;
}

async function invokeSubmitSignupRequest(payload) {
    const anonKey = getSupabaseAnonKey();
    if (!anonKey) throw new Error("Supabase ANON KEY 없음");
    const res = await fetch(getEdgeFunctionUrl("h2go-submit-signup-request"), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(String(json.error || res.statusText || "요청 실패"));
    }
    return json;
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
            syncRegisterBusinessPartyButtonUI();
        });
    });
    syncRegisterBusinessPartyButtonUI();
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
        const { data: st, error: stErr } = await client.rpc("check_login_id_status", { p_login_id: loginId });
        if (!stErr && st === "pending") {
            alert(
                "이 아이디는 관리자 승인 대기 중입니다.\n승인 메일의 링크로 계정이 생성되면 로그인할 수 있습니다.",
            );
            return;
        }
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

    const approval = String(profile.approval_status || "approved").toLowerCase();
    if (approval === "pending") {
        await client.auth.signOut();
        alert("관리자 승인 대기 중입니다. 승인 완료 후 다시 로그인해 주세요.");
        return;
    }
    if (approval === "rejected") {
        await client.auth.signOut();
        alert("가입 신청이 거절되었습니다. 관리자에게 문의해 주세요.");
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
    if (!getSupabaseAnonKey()) {
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

    try {
        const json = await invokeSubmitSignupRequest({
            login_id: loginId,
            password,
            username,
            business_parties: businessParties,
            authority,
        });
        if (json.warn && json.approveUrl) {
            console.warn("[h2go] 가입 신청:", json.warn, json.approveUrl);
        }
        alert(
            "가입 신청이 접수되었습니다.\n\n" +
                "• Supabase 계정은 관리자가 메일의 승인 링크를 연 뒤에 생성됩니다.\n" +
                "• 관리자에게 승인 요청 메일이 발송됩니다. (Resend 미설정 시 서버 로그에서 승인 URL 확인)",
        );
        showRegister(false);
    } catch (err) {
        const msg = String(err?.message || err || "");
        if (msg === "login_id_taken") {
            alert("이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.");
            return;
        }
        if (msg === "signup_pending") {
            alert("이 아이디로 이미 가입 신청이 접수되어 있습니다. 관리자 승인을 기다려 주세요.");
            return;
        }
        if (msg.includes("server misconfigured")) {
            alert("서버 설정이 완료되지 않았습니다. (Edge Secret: APPROVAL_HMAC_SECRET) 관리자에게 문의해 주세요.");
            return;
        }
        alert(`회원가입 요청에 실패했습니다: ${msg || "알 수 없는 오류"}`);
    }
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
