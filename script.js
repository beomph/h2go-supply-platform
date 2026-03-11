// H2GO - 수소거래 플랫폼 스크립트

// 간단 데모용 로그인/회원가입 (브라우저 localStorage 기반)
const USERS_KEY = "h2go_users";
const AUTH_KEY = "h2go_auth";
const DEFAULT_ROLES = ["consumer", "supplier"];

function safeJsonParse(raw, fallback) {
    try {
        return JSON.parse(raw);
    } catch (_) {
        return fallback;
    }
}

function readUsers() {
    const users = safeJsonParse(localStorage.getItem(USERS_KEY) || "[]", []);
    return Array.isArray(users) ? users : [];
}

function normalizeUser(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = normalizeId(raw.id);
    const name = String(raw.name || "").trim();
    const password = String(raw.password || "");

    // 이전 버전 호환 (role 단일 → roles 배열)
    const roles = Array.isArray(raw.roles)
        ? raw.roles.filter(r => r === "consumer" || r === "supplier")
        : (raw.role === "consumer" || raw.role === "supplier") ? [raw.role] : [];

    return {
        id,
        name,
        password,
        roles: roles.length ? roles : [...DEFAULT_ROLES],
        createdAt: raw.createdAt || null,
    };
}

function migrateUsersInPlace() {
    const users = readUsers().map(normalizeUser).filter(Boolean);
    writeUsers(users);
}

function writeUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users || []));
}

function getAuth() {
    const a = safeJsonParse(localStorage.getItem(AUTH_KEY) || "null", null);
    if (!a || typeof a !== "object") return null;
    const id = normalizeId(a.id);
    const name = String(a.name || "").trim();

    const roles = Array.isArray(a.roles)
        ? a.roles.filter(r => r === "consumer" || r === "supplier")
        : (a.role === "consumer" || a.role === "supplier") ? [...DEFAULT_ROLES] : [...DEFAULT_ROLES];

    const activeRole = (a.activeRole === "consumer" || a.activeRole === "supplier")
        ? a.activeRole
        : (a.role === "consumer" || a.role === "supplier") ? a.role : "consumer";

    if (!id || !name) return null;
    return { id, name, roles, activeRole, loggedInAt: a.loggedInAt || null };
}

function setAuth(auth) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

function clearAuth() {
    try {
        localStorage.removeItem(AUTH_KEY);
    } catch (_) {}
}

function normalizeId(id) {
    return String(id || "").trim().toLowerCase();
}

function ensureDemoUsers() {
    const users = readUsers().map(normalizeUser).filter(Boolean);

    // 이전 데모 계정(supplier/consumer)은 완전히 제거
    // (과거 버전에서 자동 생성되던 값 정리 목적)
    const cleaned = users.filter(u => u.id !== "supplier" && u.id !== "consumer");

    const hasKogas = cleaned.some(u => u.id === "kogas");
    if (!hasKogas) {
        cleaned.push({
            id: "kogas",
            password: "kogas123?",
            name: "KOGAS(데모)",
            roles: [...DEFAULT_ROLES],
            createdAt: new Date().toISOString(),
        });
    }

    writeUsers(cleaned);
}

// 구버전 데이터가 있어도 roles 구조로 정리
migrateUsersInPlace();
ensureDemoUsers();

// 로그인 상태면 로그인 페이지 대신 대시보드로
try {
    if (getAuth()) {
        window.location.href = "dashboard.html";
    }
} catch (_) {}

// 로그인/회원가입 폼 요소 (index.html 전용)
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

const showRegisterBtn = document.getElementById("showRegisterBtn");
const showLoginBtn = document.getElementById("showLoginBtn");

// 폼 제출
function showRegister(open) {
    if (!loginForm || !registerForm) return;
    loginForm.classList.toggle("is-hidden", !!open);
    showRegisterBtn?.classList.toggle("is-hidden", !!open);
    registerForm.classList.toggle("is-hidden", !open);
}

showRegisterBtn?.addEventListener("click", () => showRegister(true));
showLoginBtn?.addEventListener("click", () => showRegister(false));

loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = normalizeId(document.getElementById('loginId')?.value);
    const password = String(document.getElementById('loginPassword')?.value || "");

    if (!id) {
        alert("아이디를 입력해 주세요.");
        return;
    }
    if (!password) {
        alert("비밀번호를 입력해 주세요.");
        return;
    }

    const users = readUsers();
    const user = users.map(normalizeUser).find(u => u && u.id === id);
    if (!user) {
        alert("아이디 또는 비밀번호가 올바르지 않습니다.");
        return;
    }
    if (String(user.password || "") !== password) {
        alert("아이디 또는 비밀번호가 올바르지 않습니다.");
        return;
    }

    setAuth({ id: user.id, name: user.name, roles: user.roles, activeRole: "consumer", loggedInAt: new Date().toISOString() });
    window.location.href = `dashboard.html`;
});

registerForm?.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = String(document.getElementById('registerName')?.value || "").trim();
    const id = normalizeId(document.getElementById('registerId')?.value);
    const password = String(document.getElementById('registerPassword')?.value || "");
    const passwordConfirm = String(document.getElementById('registerPasswordConfirm')?.value || "");

    if (!name) {
        alert("이름/회사명을 입력해 주세요.");
        return;
    }
    if (!id) {
        alert("아이디를 입력해 주세요.");
        return;
    }
    if (/\s/.test(id)) {
        alert("아이디에는 공백을 사용할 수 없습니다.");
        return;
    }
    if (!password) {
        alert("비밀번호를 입력해 주세요.");
        return;
    }
    if (password !== passwordConfirm) {
        alert("비밀번호가 일치하지 않습니다.");
        return;
    }

    const users = readUsers();
    const existing = users.map(normalizeUser).find(u => u && u.id === id);
    if (existing) {
        alert("이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.");
        return;
    }

    const nextUsers = users.map(normalizeUser).filter(Boolean);
    nextUsers.push({ id, password, name, roles: [...DEFAULT_ROLES], createdAt: new Date().toISOString() });
    writeUsers(nextUsers);
    setAuth({ id, name, roles: [...DEFAULT_ROLES], activeRole: "consumer", loggedInAt: new Date().toISOString() });
    window.location.href = `dashboard.html`;
});

