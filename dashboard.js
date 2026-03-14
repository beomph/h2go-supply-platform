// H2GO 대시보드 - 수소거래 플랫폼

// ========== 로그인 상태 확인 ==========
const AUTH_KEY = "h2go_auth";
const DEFAULT_ROLES = ["consumer", "supplier"];
const USERS_KEY = "h2go_users";
const THEME_KEY = "h2go_theme";
const ORDER_ADDRESS_HISTORY_PREFIX = "h2go_order_address_history_v1";

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

function uniqueNames(arr) {
    const seen = new Set();
    const out = [];
    for (const v of arr) {
        const s = String(v || "").trim();
        if (!s) continue;
        const key = s.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(s);
    }
    return out;
}

const REGISTERED_SUPPLIERS_PREFIX = "h2go_registered_suppliers_v1";

function getRegisteredSuppliersKey() {
    const a = getAuth();
    const who = String(a?.id || a?.name || "anon").trim().toLowerCase();
    return `${REGISTERED_SUPPLIERS_PREFIX}:${who}`;
}

function readRegisteredSuppliers() {
    const raw = safeJsonParse(localStorage.getItem(getRegisteredSuppliersKey()) || "[]", []);
    return Array.isArray(raw) ? raw : [];
}

function writeRegisteredSuppliers(list) {
    try {
        localStorage.setItem(getRegisteredSuppliersKey(), JSON.stringify(list));
    } catch (_) {}
}

function getSupplierCandidates(currentBizName) {
    // 수요자가 등록한 공급자 우선, 없으면 가입된 사업자명
    const registered = readRegisteredSuppliers().map(s => (typeof s === 'string' ? s : s?.name)).filter(Boolean);
    if (registered.length > 0) {
        return uniqueNames([currentBizName, ...registered]);
    }
    const users = readUsers();
    const names = users.map(u => u?.name).filter(Boolean);
    return uniqueNames([currentBizName, ...names]);
}

function getAddressHistoryStorageKey() {
    const a = getAuth();
    const who = String(a?.id || a?.name || "anon").trim().toLowerCase();
    return `${ORDER_ADDRESS_HISTORY_PREFIX}:${who}`;
}

// 취소 주문 숨김 (구매/판매 대시보드 각각 독립)
const HIDDEN_CONSUMER_PREFIX = "h2go_hidden_consumer";
const HIDDEN_SUPPLIER_PREFIX = "h2go_hidden_supplier";

function getHiddenConsumerKey() {
    const a = getAuth();
    const who = String(a?.id || a?.name || "anon").trim().toLowerCase();
    return `${HIDDEN_CONSUMER_PREFIX}:${who}`;
}

function getHiddenSupplierKey() {
    const a = getAuth();
    const who = String(a?.id || a?.name || "anon").trim().toLowerCase();
    return `${HIDDEN_SUPPLIER_PREFIX}:${who}`;
}

function readHiddenConsumerIds() {
    const raw = safeJsonParse(localStorage.getItem(getHiddenConsumerKey()) || "[]", []);
    return Array.isArray(raw) ? raw : [];
}

function readHiddenSupplierIds() {
    const raw = safeJsonParse(localStorage.getItem(getHiddenSupplierKey()) || "[]", []);
    return Array.isArray(raw) ? raw : [];
}

function addHiddenConsumerOrderId(orderId) {
    const ids = readHiddenConsumerIds();
    if (!ids.includes(orderId)) ids.push(orderId);
    try { localStorage.setItem(getHiddenConsumerKey(), JSON.stringify(ids)); } catch (_) {}
}

function addHiddenSupplierOrderId(orderId) {
    const ids = readHiddenSupplierIds();
    if (!ids.includes(orderId)) ids.push(orderId);
    try { localStorage.setItem(getHiddenSupplierKey(), JSON.stringify(ids)); } catch (_) {}
}

function normalizeAddress(address) {
    return String(address || "").replace(/\s+/g, " ").trim();
}

function readAddressHistory() {
    const raw = safeJsonParse(localStorage.getItem(getAddressHistoryStorageKey()) || "[]", []);
    if (!Array.isArray(raw)) return [];
    return uniqueNames(raw.map(normalizeAddress)).slice(0, 20);
}

function writeAddressHistory(list) {
    try {
        localStorage.setItem(getAddressHistoryStorageKey(), JSON.stringify(list.slice(0, 20)));
    } catch (_) {}
}

function renderAddressHistoryOptions() {
    const datalist = document.getElementById("orderAddressHistoryList");
    if (!datalist) return;
    datalist.innerHTML = "";
    readAddressHistory().forEach((addr) => {
        const option = document.createElement("option");
        option.value = addr;
        datalist.appendChild(option);
    });
}

function addAddressToHistory(address) {
    const normalized = normalizeAddress(address);
    if (!normalized) return;
    const current = readAddressHistory().filter((a) => a.toLowerCase() !== normalized.toLowerCase());
    current.unshift(normalized);
    writeAddressHistory(current);
}

function getAuth() {
    const a = safeJsonParse(localStorage.getItem(AUTH_KEY) || "null", null);
    if (!a || typeof a !== "object") return null;
    const id = String(a.id || "").trim().toLowerCase();
    const name = String(a.name || "").trim();
    const roles = Array.isArray(a.roles)
        ? a.roles.filter(r => r === "consumer" || r === "supplier")
        : (a.role === "consumer" || a.role === "supplier") ? [...DEFAULT_ROLES] : [...DEFAULT_ROLES];
    const activeRole =
        (a.activeRole === "consumer" || a.activeRole === "supplier") ? a.activeRole :
        (a.role === "consumer" || a.role === "supplier") ? a.role : "consumer";
    if (!id || !name) return null;
    return { id, name, roles: roles.length ? roles : [...DEFAULT_ROLES], activeRole, loggedInAt: a.loggedInAt || null };
}

function clearAuth() {
    try {
        localStorage.removeItem(AUTH_KEY);
    } catch (_) {}
}

function redirectToLogin() {
    window.location.href = `index.html`;
}

// ========== 데이터 구조 ==========
const TRAILER_CAPACITY_KG = 400; // 트레일러 1대당 kg (기본)
const PRODUCTION_SITE = { name: '인천 수소생산공장', address: '인천시 남동구 논현고잔로 123', lat: 37.4489, lng: 126.7317 };

// 공급자별 출하(픽업) 주소 (등록 주소 우선, 없으면 기본 맵, 최종 생산지)
function getSupplierShippingAddress(supplierName) {
    const name = String(supplierName || "").trim();
    const registered = readRegisteredSuppliers();
    const found = registered.find(s => {
        const n = typeof s === 'string' ? s : s?.name;
        return String(n || "").trim().toLowerCase() === name.toLowerCase();
    });
    if (found && typeof found === 'object' && found.address) return found.address;
    const map = {
        "KOGAS(데모)": "인천시 남동구 논현고잔로 123 (인천 수소생산공장)",
        "KOGAS": "인천시 남동구 논현고잔로 123 (인천 수소생산공장)"
    };
    return map[name] || PRODUCTION_SITE.address;
}

// 주소별 운송시간 (분)
function getTravelTimeFromAddress(addr) {
    const keywords = [{ key: '강남', time: 60 }, { key: '인천', time: 40 }, { key: '수원', time: 50 }, { key: '안산', time: 75 }, { key: '부천', time: 55 }];
    const found = keywords.find(k => addr && addr.includes(k.key));
    return found ? found.time : 60;
}

// 공급조건: 도착도(판매자 배달) / 출하도(구매자 픽업)
const SUPPLY_CONDITIONS = [
    { value: 'delivery', label: '도착도' },
    { value: 'ex_factory', label: '출하도' }
];

function getSupplyConditionLabel(order) {
    const v = order?.supplyCondition;
    const s = SUPPLY_CONDITIONS.find(c => c.value === v);
    return s ? s.label : (v === 'ex_factory' ? '출하도' : '도착도');
}

// 주문별 운송시간(분): 출하도는 0(픽업), 도착도는 납품지까지 시간
function getOrderTravelTimeMinutes(order) {
    if (!order) return 0;
    if (order.supplyCondition === 'ex_factory') return 0;
    return getTravelTimeFromAddress(order.address);
}

// 주소별 좌표 (지도용)
function getCoordinatesFromAddress(addr) {
    const keywords = [
        { key: '강남', lat: 37.5012, lng: 127.0396 },
        { key: '인천', lat: 37.4602, lng: 126.4407 },
        { key: '수원', lat: 37.2839, lng: 127.0446 },
        { key: '안산', lat: 37.3219, lng: 126.8309 },
        { key: '부천', lat: 37.5034, lng: 126.7660 }
    ];
    const found = keywords.find(k => addr && addr.includes(k.key));
    return found ? { lat: found.lat, lng: found.lng } : { lat: 37.5, lng: 127.0 };
}

function deepClone(v) {
    return safeJsonParse(JSON.stringify(v), v);
}

function readOrdersFromStorage() {
    return safeJsonParse(localStorage.getItem('h2go_orders') || '[]', []);
}

let orders = readOrdersFromStorage();
let currentUser = { type: 'consumer', name: '수요자 A' };
let pendingApprovalOrderId = null;
let selectedSupplierName = null;
let lastOrdersSnapshot = deepClone(orders);

// ========== 테마(라이트/다크) ==========
function applyThemeClass(themeClass) {
    const body = document.body;
    if (!body) return;
    const next = themeClass === 'theme-light' ? 'theme-light' : 'theme-dark';
    body.classList.remove('theme-light', 'theme-dark');
    body.classList.add(next);
    try {
        localStorage.setItem(THEME_KEY, next);
    } catch (_) {}
    updateThemeToggleUI(next);
}

function updateThemeToggleUI(themeClass) {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const isLight = themeClass === 'theme-light';
    btn.dataset.theme = isLight ? 'light' : 'dark';
    const labelEl = btn.querySelector('.theme-toggle-label');
    if (labelEl) {
        labelEl.textContent = isLight ? 'Light' : 'Dark';
    }
    btn.setAttribute('aria-label', isLight ? '다크 모드로 전환' : '라이트 모드로 전환');
}

function initTheme() {
    let stored = null;
    try {
        stored = localStorage.getItem(THEME_KEY);
    } catch (_) {}
    const initial = stored === 'theme-light' || stored === 'theme-dark' ? stored : 'theme-dark';
    applyThemeClass(initial);

    const btn = document.getElementById('themeToggle');
    if (btn) {
        btn.addEventListener('click', () => {
            const current = document.body.classList.contains('theme-light') ? 'theme-light' : 'theme-dark';
            const next = current === 'theme-light' ? 'theme-dark' : 'theme-light';
            applyThemeClass(next);
        });
        updateThemeToggleUI(initial);
    }
}

// ========== 주문 결정 알림(상대방 탭에서 1회만) ==========
function getNotifyKeyPrefix() {
    const a = getAuth();
    const who = a?.id ? `id:${a.id}` : (a?.name ? `name:${a.name}` : "anon");
    return `h2go_notified_v1:${who}`;
}

function readNotifiedMap() {
    try {
        const raw = localStorage.getItem(getNotifyKeyPrefix()) || "{}";
        const parsed = safeJsonParse(raw, {});
        return (parsed && typeof parsed === "object") ? parsed : {};
    } catch (_) {
        return {};
    }
}

function writeNotifiedMap(map) {
    try {
        localStorage.setItem(getNotifyKeyPrefix(), JSON.stringify(map || {}));
    } catch (_) {}
}

function notifyOnce(eventKey, message) {
    if (!eventKey || !message) return;
    const m = readNotifiedMap();
    if (m[eventKey]) return;
    m[eventKey] = 1;
    writeNotifiedMap(m);
    alert(message);
}

function detectAndNotifyChangeDecisions(prevOrders, nextOrders) {
    const me = getAuth()?.name || currentUser.name;
    if (!me) return;

    const prevById = new Map((prevOrders || []).map(o => [o?.id, o]));
    for (const next of (nextOrders || [])) {
        if (!next?.id) continue;
        const prev = prevById.get(next.id);
        const last = next.lastChange;
        if (!last || !last.decidedAt || !last.requestedBy || !last.result) continue;

        const iAmConsumer = next.consumerName === me;
        const iAmSupplier = next.supplierName === me;
        if (!iAmConsumer && !iAmSupplier) continue;

        // 내가 요청자였던 변경 요청이 상대방에 의해 결정되었을 때만 알림
        const iRequested = (last.requestedBy === "consumer" && iAmConsumer) || (last.requestedBy === "supplier" && iAmSupplier);
        if (!iRequested) continue;

        // 이미 이전 스냅샷에서도 같은 결정이 존재하면(예: 페이지 새로고침 직후) 알림 생략
        const prevLast = prev?.lastChange;
        const alreadyHadSameDecision = prevLast?.decidedAt === last.decidedAt && prevLast?.result === last.result && prevLast?.requestedBy === last.requestedBy;
        if (alreadyHadSameDecision) continue;

        const eventKey = `change:${next.id}:${last.decidedAt}:${last.result}:${last.requestedBy}`;
        const resultText = last.result === "approved" ? "승인(확정)" : "거절";
        notifyOnce(eventKey, `주문 변경 요청 결과 알림\n\n- 주문번호: ${next.id}\n- 결과: ${resultText}\n- 요약: ${last.summary || "-"}`);
    }
}

// 로그인 체크 (대시보드는 로그인 필요)
const urlParams = new URLSearchParams(window.location.search);
const hintedRole = (urlParams.get('role') === 'supplier' || urlParams.get('role') === 'consumer') ? urlParams.get('role') : null;
const auth = getAuth();
if (!auth) {
    redirectToLogin();
}
if (auth) {
    const initialRole = hintedRole || auth.activeRole || "consumer";
    currentUser = { type: initialRole, name: auth.name };
}

// KOGAS 데모 계정: 남아있는 주문 전체 1회 정리
try {
    const KOGAS_PURGE_FLAG = "h2go_purged_kogas_orders_v1";
    if (auth?.id === "kogas" && !localStorage.getItem(KOGAS_PURGE_FLAG)) {
        const me = auth.name;
        orders = (orders || []).filter(o => {
            const consumerMatch = (o?.consumerName || "") === me;
            const supplierMatch = !o?.supplierName || (o?.supplierName || "") === me;
            return !(consumerMatch || supplierMatch);
        });
        localStorage.setItem('h2go_orders', JSON.stringify(orders));
        localStorage.setItem(KOGAS_PURGE_FLAG, "1");
    }
} catch (_) {}

// 수요모드 주문 시 기본 공급자(초기값): 현재 사업자
selectedSupplierName = currentUser.name;

// ========== 유틸리티 ==========
function isHangulSyllable(ch) {
    const code = ch.charCodeAt(0);
    return code >= 0xac00 && code <= 0xd7a3;
}

function businessCodeFromName(name) {
    const src = String(name || "").trim();
    const CHO_TO_ALPHA = ["G", "G", "N", "D", "D", "R", "M", "B", "B", "S", "S", "N", "J", "J", "C", "K", "T", "P", "H"];
    const out = [];
    for (const ch of src) {
        if (/[A-Za-z]/.test(ch)) {
            out.push(ch.toUpperCase());
        } else if (/[0-9]/.test(ch)) {
            // 숫자 기반 사업자명도 연상 가능하게 알파벳으로 변환
            out.push(String.fromCharCode(65 + Number(ch)));
        } else if (isHangulSyllable(ch)) {
            const code = ch.charCodeAt(0) - 0xac00;
            const choIdx = Math.floor(code / 588);
            out.push(CHO_TO_ALPHA[choIdx] || "X");
        }
        if (out.length >= 3) break;
    }
    while (out.length < 3) out.push("X");
    return out.slice(0, 3).join("");
}

function orderDateCode(year, month, day) {
    const yy = String(year).slice(-2).padStart(2, "0");
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${yy}${mm}${dd}`;
}

// 주문회차: 해당 주문일시(YYMMDD) 기준 당일 순번 2자리 (01~99)
function nextOrderSequence(dateCode) {
    const re = new RegExp(`^${dateCode}-([0-9]{2})-.+`);
    const maxSeq = orders.reduce((max, o) => {
        const id = String(o?.id || "");
        const m = id.match(re);
        if (!m) return max;
        const n = parseInt(m[1], 10);
        return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0);
    const next = maxSeq + 1;
    const bounded = Math.min(next, 99);
    return String(bounded).padStart(2, "0");
}

// 주문번호: 주문일시 6자리 - 주문회차 2자리 - 구매자번호 3자리 - 판매자번호 3자리
function generateOrderId({ supplierName, consumerName, year, month, day }) {
    const supplierCode = businessCodeFromName(supplierName);
    const consumerCode = businessCodeFromName(consumerName);
    const dateCode = orderDateCode(year, month, day); // YYMMDD
    const seq = nextOrderSequence(dateCode);
    return `${dateCode}-${seq}-${consumerCode}-${supplierCode}`;
}

function getTodayParts() {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function getConsumerOrders(consumerName) {
    // 수요자별 전체 주문 이력 (취소 포함)
    return orders.filter(o => o.consumerName === consumerName);
}

function getSupplierOrders(supplierName) {
    return orders.filter(o => (o.supplierName || supplierName) === supplierName);
}

function getAllOrders() {
    const supplierName = auth?.name || currentUser.name;
    const scoped = getSupplierOrders(supplierName);
    return scoped
        .sort((a, b) => {
            const da = `${a.year}-${String(a.month).padStart(2, '0')}-${String(a.day).padStart(2, '0')} ${formatTimeText(a.time)}`;
            const db = `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')} ${formatTimeText(b.time)}`;
            return da.localeCompare(db);
        });
}

function formatTimeText(rawTime) {
    const raw = String(rawTime || "").trim();
    const [hRaw = "0", mRaw = "0"] = raw.split(":");
    const h = Math.max(0, Math.min(23, parseInt(hRaw, 10) || 0));
    const m = Math.max(0, Math.min(59, parseInt(mRaw, 10) || 0));
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatOrderDateTime(order) {
    return `${order.year}/${order.month}/${order.day} ${formatTimeText(order.time)}`;
}

function formatOrderDate(order) {
    return `${order.year}/${order.month}/${order.day}`;
}

function getOrderDateTimeSortKey(order) {
    const y = String(order?.year ?? "").padStart(4, "0");
    const m = String(order?.month ?? "").padStart(2, "0");
    const d = String(order?.day ?? "").padStart(2, "0");
    const t = formatTimeText(order?.time);
    return `${y}-${m}-${d} ${t}`;
}

function summarizeChange(order, proposed) {
    if (!order || !proposed) return "";
    const changes = [];
    const fromDt = `${order.year}/${order.month}/${order.day} ${formatTimeText(order.time)}`;
    const toDt = `${proposed.year}/${proposed.month}/${proposed.day} ${formatTimeText(proposed.time)}`;
    if (fromDt !== toDt) changes.push(`일정 ${fromDt} → ${toDt}`);
    if ((order.tubeTrailers || 0) !== (proposed.tubeTrailers || 0)) changes.push(`트레일러 ${order.tubeTrailers}대 → ${proposed.tubeTrailers}대`);
    const fromAddr = String(order.address || "").trim();
    const toAddr = String(proposed.address || "").trim();
    if (toAddr && fromAddr !== toAddr) changes.push(`주소 변경`);
    if (changes.length === 0) return "변경 없음";
    return changes.join(", ");
}

function getChangeBadgeText(order) {
    const cr = order?.changeRequest;
    if (!cr) return "";
    const sum = summarizeChange(order, cr.proposed);
    if (cr.status === "pending") return `변경요청: ${sum}`;
    if (cr.status === "rejected") return `변경요청 거절: ${sum}`;
    return "";
}

function getCancelBadgeText(order) {
    const cr = order?.cancelRequest;
    if (!cr) return "";
    if (cr.status === "pending") return `취소요청: ${cr.reason ? cr.reason : "상대방 확인 필요"}`;
    if (cr.status === "rejected") return `취소요청 거절: ${cr.reason ? cr.reason : "사유 없음"} (취소 불가)`;
    return "";
}

function getSupplierStatusLabel(order) {
    const status = normalizeStatus(order?.status);
    if (order?.cancelRequest?.status === 'pending' || status === 'cancel_requested') return '취소 요청';
    if (order?.changeRequest?.status === 'pending' || status === 'change_requested') return '변경 요청';
    return getStatusLabel(status);
}

function getSupplierAdvanceAction(status) {
    switch (status) {
        case 'requested':
            return { label: '접수', next: 'accepted' };
        case 'accepted':
        case 'change_accepted':
            return { label: '운송 시작', next: 'in_transit' };
        case 'in_transit':
            return { label: '도착 처리', next: 'arrived' };
        case 'arrived':
            return { label: '회수 시작', next: 'collecting' };
        case 'collecting':
            return { label: '회수 완료', next: 'completed' };
        default:
            return null;
    }
}

function getActorForOrder(order) {
    return currentUser.type;
}

function canImmediateCancelOrder(order, actorType) {
    if (!order || actorType !== "consumer") return false;
    const status = normalizeStatus(order.status);
    // 판매자가 접수하기 전(requested): 승인 없이 즉시 취소 가능
    if (status === 'requested') return true;
    // 접수 후에도 최초 주문 후 5분 이내: 즉시 취소 가능
    if (status === 'accepted' || status === 'change_accepted') {
        const created = order.createdAt ? new Date(order.createdAt).getTime() : 0;
        if (!created) return false;
        const fiveMinMs = 5 * 60 * 1000;
        return Date.now() - created <= fiveMinMs;
    }
    return false;
}

// 주문 수량 계산 (트레일러 대수 * 용량)
function getOrderQuantity(order) {
    return (order.tubeTrailers || 0) * TRAILER_CAPACITY_KG;
}

// ========== AI 운송계획 ==========
function calculateTransportPlan() {
    const activeStatuses = ['requested', 'accepted', 'change_accepted', 'in_transit', 'arrived', 'collecting'];
    const activeOrders = getAllOrders().filter(o => activeStatuses.includes(normalizeStatus(o.status)));
    if (activeOrders.length === 0) return null;

    const drivers = parseInt(document.getElementById('availableDrivers')?.value || 5);
    const trailers = parseInt(document.getElementById('availableTrailers')?.value || 3);
    const trailerCapacity = parseInt(document.getElementById('trailerCapacity')?.value || 400);

    const ordersByAddress = {};
    activeOrders.forEach(order => {
        const key = order.address;
        const qty = (order.tubeTrailers || 0) * trailerCapacity;
        if (!ordersByAddress[key]) {
            ordersByAddress[key] = { address: order.address, quantity: 0, tubeTrailers: 0, orders: [], deliveryDate: formatOrderDate(order), time: order.time };
        }
        ordersByAddress[key].quantity += qty;
        ordersByAddress[key].tubeTrailers += (order.tubeTrailers || 0);
        ordersByAddress[key].orders.push(order);
    });

    const destinations = Object.values(ordersByAddress);
    const totalQuantity = destinations.reduce((sum, d) => sum + d.quantity, 0);
    const totalTrailers = destinations.reduce((sum, d) => sum + d.tubeTrailers, 0);

    // 도착도만 운송시간 반영, 출하도는 픽업(0분)
    function getDestTravelTime(d) {
        const hasDelivery = (d.orders || []).some(o => o.supplyCondition !== 'ex_factory');
        return hasDelivery ? getTravelTimeFromAddress(d.address) : 0;
    }
    const isExFactoryDest = (d) => (d.orders || []).every(o => o.supplyCondition === 'ex_factory');

    const trailersNeeded = totalTrailers;
    const trailersToUse = Math.min(trailersNeeded, trailers);
    const totalTrips = destinations.length;
    const totalDriveTime = destinations.reduce((sum, d) => sum + getDestTravelTime(d) * 2, 0);
    const hoursPerTrip = 2.5;
    const maxTripsPerDriver = Math.floor(8 / hoursPerTrip);
    const driversNeeded = Math.ceil(totalTrips / maxTripsPerDriver);
    const driversToUse = Math.min(driversNeeded, drivers);

    const schedule = [];
    let currentTime = 8;
    destinations.forEach((dest, i) => {
        const driverNum = (i % driversToUse) + 1;
        const duration = getDestTravelTime(dest);
        const isPickup = isExFactoryDest(dest);
        schedule.push({
            time: `${Math.floor(currentTime)}:${((currentTime % 1) * 60).toString().padStart(2, '0')}`,
            route: isPickup ? `출하지 픽업 (${dest.address.substring(0, 16)}...)` : `생산지 → ${dest.address.substring(0, 20)}...`,
            quantity: dest.tubeTrailers + '대 (' + dest.quantity + ' kg)',
            trailer: `트레일러 ${Math.min(dest.tubeTrailers, trailersToUse)}대`,
            driver: isPickup ? '—' : `기사 ${driverNum}`,
            duration: duration
        });
        currentTime += hoursPerTrip;
    });

    return {
        totalQuantity,
        totalTrailers,
        trailersNeeded,
        trailersToUse,
        trailersAvailable: trailers,
        driversNeeded,
        driversToUse,
        driversAvailable: drivers,
        totalTrips,
        totalDriveTime,
        schedule,
        destinations,
        hasShortage: trailersNeeded > trailers || driversNeeded > drivers
    };
}

// ========== 뷰 렌더링 ==========
function showView(viewId) {
    document.querySelectorAll('.dashboard-view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(viewId + 'View');
    if (el) el.classList.add('active');
}

function renderSupplierRegistration() {
    const listEl = document.getElementById('registeredSuppliersList');
    if (!listEl) return;
    const list = readRegisteredSuppliers();
    if (list.length === 0) {
        listEl.innerHTML = '<p class="registered-suppliers-empty">등록된 공급자가 없습니다. 아래에서 추가하세요.</p>';
        return;
    }
    listEl.innerHTML = list.map((s, i) => {
        const name = typeof s === 'string' ? s : (s?.name || '');
        const addr = typeof s === 'object' && s?.address ? s.address : getSupplierShippingAddress(name);
        return `<div class="registered-supplier-item" data-index="${i}">
            <div class="supplier-info">
                <div class="supplier-name">${String(name).replace(/</g, '&lt;')}</div>
                <div class="supplier-addr">${String(addr).replace(/</g, '&lt;')}</div>
            </div>
            <button type="button" class="btn btn-tiny btn-secondary btn-remove" data-index="${i}">삭제</button>
        </div>`;
    }).join('');
    listEl.querySelectorAll('.btn-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index, 10);
            const list = readRegisteredSuppliers();
            list.splice(idx, 1);
            writeRegisteredSuppliers(list);
            renderSupplierRegistration();
        });
    });
}

// 주문 상태: 요청/접수/변경/운송/도착/회수/완료
const ORDER_STATUSES = [
    { value: 'requested', label: '주문 요청' },
    { value: 'accepted', label: '접수' },
    { value: 'change_requested', label: '변경 요청' },
    { value: 'change_accepted', label: '변경 접수' },
    { value: 'in_transit', label: '운송 중' },
    { value: 'arrived', label: '도착' },
    { value: 'collecting', label: '회수 중' },
    { value: 'completed', label: '완료' },
    { value: 'cancel_requested', label: '취소 요청' },
    { value: 'cancelled', label: '취소' }
];

function getStatusLabel(status) {
    const s = ORDER_STATUSES.find(o => o.value === status);
    if (s) return s.label;
    // 레거시 매핑
    const legacy = {
        pending: '접수',
        received: '주문 요청',
        reviewing: '접수',
        confirmed: '접수',
        on_hold: '접수',
        change_requested_consumer: '변경 요청',
        change_requested_supplier: '변경 요청',
    };
    return legacy[status] || getStatusLabel(normalizeStatus(status));
}

function normalizeStatus(status) {
    if (status === 'pending') return 'accepted';
    if (status === 'received') return 'requested';
    if (status === 'reviewing' || status === 'confirmed' || status === 'on_hold') return 'accepted';
    if (status === 'change_requested_consumer' || status === 'change_requested_supplier') return 'change_requested';
    if (status === 'cancel_requested_consumer' || status === 'cancel_requested_supplier') return 'cancel_requested';
    if (ORDER_STATUSES.some(o => o.value === status)) return status;
    return 'requested';
}

// ========== 재고 현황 & 발주 예측 ==========
const INVENTORY_KEY = 'h2go_inventory';
const INV_MAX_PRESSURE = 200;       // bar (튜브트레일러 만충 압력)
const INV_KG_PER_TRAILER = 180;    // kg (1회 운송량 180kg 기준)
const AVG_FILL_PER_CAR_KG = 5;     // kg (수소차 1대당 평균 충전량)

function defaultInventory() {
    return {
        trailers: [
            { id: 1, pressure: 200 },   // 180kg — 만충
            { id: 2, pressure: 140 },   // 126kg — 70%
            { id: 3, pressure: 55 },    //  49kg — 27%
        ],
        waitingCustomers: 0,
    };
}

function readInventory() {
    const raw = safeJsonParse(localStorage.getItem(INVENTORY_KEY), null);
    if (!raw) return defaultInventory();
    // 구 데이터 마이그레이션 (waitingVehicles → waitingCustomers)
    if (raw.waitingVehicles !== undefined && raw.waitingCustomers === undefined) {
        raw.waitingCustomers = 0;
        delete raw.waitingVehicles;
        delete raw.leadTimeDays;
    }
    return raw;
}

function saveInventory(data) {
    try { localStorage.setItem(INVENTORY_KEY, JSON.stringify(data)); } catch (_) {}
}

function getAvgDailyConsumptionKg() {
    const me = auth?.name || currentUser.name;
    const myOrders = orders.filter(o =>
        o.consumerName === me && o.status !== 'cancelled' && o.createdAt
    );
    if (myOrders.length === 0) return 150; // 기본값: 일평균 150kg
    const cutoff = Date.now() - 30 * 86400000;
    const recent = myOrders.filter(o => new Date(o.createdAt).getTime() > cutoff);
    if (recent.length === 0) return 150;
    const totalKg = recent.reduce((s, o) => s + (o.tubeTrailers || 1) * INV_KG_PER_TRAILER, 0);
    return Math.max(1, totalKg / 30);
}

// 최근 주문 주소를 기반으로 납품 소요 시간 계산
function calcLeadTimeInfo() {
    const me = auth?.name || currentUser.name;
    const myOrders = orders
        .filter(o => o.consumerName === me && o.address)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    if (myOrders.length === 0) {
        return { minutes: 60, label: '약 1시간', hint: '기본값 (주문 후 자동 계산)' };
    }
    const addr = myOrders[0].address;
    const minutes = getTravelTimeFromAddress(addr);

    let label;
    if (minutes < 60) {
        label = `약 ${minutes}분`;
    } else if (minutes === 60) {
        label = '약 1시간';
    } else {
        label = `약 ${(minutes / 60).toFixed(1)}시간`;
    }

    const regionMap = [
        { key: '강남', name: '강남' }, { key: '인천', name: '인천' },
        { key: '수원', name: '수원' }, { key: '안산', name: '안산' },
        { key: '부천', name: '부천' },
    ];
    const region = regionMap.find(r => addr.includes(r.key));
    const hint = region ? `${region.name} 기준` : '최근 주문 기준';

    return { minutes, label, hint };
}

function renderInventoryPanel() {
    const listEl = document.getElementById('trailerStatusList');
    if (!listEl) return;

    const inv = readInventory();
    const kgPerBar = INV_KG_PER_TRAILER / INV_MAX_PRESSURE;

    listEl.innerHTML = inv.trailers.map(t => {
        const pct = Math.min(100, Math.round((t.pressure / INV_MAX_PRESSURE) * 100));
        const kg = Math.round(t.pressure * kgPerBar);
        const lvl = pct > 60 ? 'full' : pct > 25 ? 'mid' : 'low';
        return `
            <div class="trailer-row">
                <span class="trailer-id">#${t.id}</span>
                <div class="pressure-bar-bg">
                    <div class="pressure-bar-fill ${lvl}" style="width:${pct}%"></div>
                </div>
                <div class="pressure-edit">
                    <input type="number" class="pressure-val" data-id="${t.id}"
                        value="${t.pressure}" min="0" max="${INV_MAX_PRESSURE}">
                    <span class="pressure-unit">bar</span>
                    <span class="pressure-kg-label">${kg}kg</span>
                </div>
                <button type="button" class="trailer-remove-btn" data-id="${t.id}" title="삭제">×</button>
            </div>`;
    }).join('') || `<p style="font-size:0.85rem;color:var(--text-muted);padding:0.4rem 0">트레일러 없음</p>`;

    listEl.querySelectorAll('.pressure-val').forEach(inp => {
        inp.addEventListener('change', () => {
            const inv2 = readInventory();
            const t = inv2.trailers.find(x => x.id === parseInt(inp.dataset.id));
            if (t) {
                t.pressure = Math.max(0, Math.min(INV_MAX_PRESSURE, parseInt(inp.value) || 0));
                saveInventory(inv2);
                renderInventoryPanel();
            }
        });
    });

    listEl.querySelectorAll('.trailer-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const inv2 = readInventory();
            inv2.trailers = inv2.trailers.filter(t => t.id !== parseInt(btn.dataset.id));
            saveInventory(inv2);
            renderInventoryPanel();
        });
    });

    // 충전 대기 고객 표시
    const waitEl = document.getElementById('waitingCustomers');
    if (waitEl && document.activeElement !== waitEl) waitEl.value = inv.waitingCustomers || 0;

    // 납품 소요시간 (주소 기반 계산값 표시)
    const leadInfo = calcLeadTimeInfo();
    const leadDisplay = document.getElementById('leadTimeDisplay');
    const leadHint = document.getElementById('leadTimeHint');
    if (leadDisplay) leadDisplay.textContent = leadInfo.label;
    if (leadHint) leadHint.textContent = leadInfo.hint;

    renderPrediction(inv, leadInfo);
}

function renderPrediction(inv, leadInfo) {
    const predEl = document.getElementById('predictionDisplay');
    if (!predEl) return;

    if (!leadInfo) leadInfo = calcLeadTimeInfo();

    const kgPerBar = INV_KG_PER_TRAILER / INV_MAX_PRESSURE;
    const trailerKg = inv.trailers.reduce((s, t) => s + t.pressure * kgPerBar, 0);

    // 충전 대기 고객의 즉시 수요
    const waitingCustomers = inv.waitingCustomers || 0;
    const immediateDemandKg = waitingCustomers * AVG_FILL_PER_CAR_KG;

    // 즉시 수요 처리 후 실효 잔량
    const effectiveKg = Math.max(0, trailerKg - immediateDemandKg);

    const dailyKg = getAvgDailyConsumptionKg();
    const daysLeft = dailyKg > 0 ? effectiveKg / dailyKg : Infinity;

    // 납품 소요시간을 일(day) 단위로 변환
    const leadTimeDays = leadInfo.minutes / (24 * 60);
    const daysToOrder = daysLeft - leadTimeDays;

    const now = new Date();
    const fmtDate = d => {
        const wd = ['일','월','화','수','목','금','토'][d.getDay()];
        return `${d.getMonth()+1}/${d.getDate()}(${wd})`;
    };
    const fmtTime = d =>
        `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;

    const depleteDate = new Date(now.getTime() + daysLeft * 86400000);
    const orderDate   = new Date(now.getTime() + Math.max(0, daysToOrder) * 86400000);

    // 소진까지 시간이 1일 이내면 시간 단위로 표시
    const daysLeftDisplay = isFinite(daysLeft)
        ? daysLeft < 1
            ? `약 ${Math.round(daysLeft * 24)}시간 후 (${fmtDate(depleteDate)} ${fmtTime(depleteDate)})`
            : `${fmtDate(depleteDate)} (약 ${daysLeft.toFixed(1)}일 후)`
        : '충분';

    const orderDisplay = daysToOrder <= 0
        ? '⚡ 즉시 발주 필요!'
        : daysToOrder * 24 < 24
            ? `오늘 ${fmtTime(orderDate)} 이전 (약 ${Math.round(daysToOrder * 24)}시간 후)`
            : `${fmtDate(orderDate)} (약 ${daysToOrder.toFixed(1)}일 후)`;

    // 긴급도: 발주해야 하는 시간 기준
    const urgency = daysToOrder <= 0 ? 'critical'
        : daysToOrder * 24 <= 6 ? 'warning'
        : 'safe';
    const urgencyLabel = {
        safe:     '여유 — 재고 충분',
        warning:  '주의 — 곧 발주 필요',
        critical: '긴급 — 즉시 발주!',
    }[urgency];
    const urgencyIcon = { safe: '✅', warning: '⚠️', critical: '🚨' }[urgency];

    const isDefault = orders.filter(o =>
        o.consumerName === (auth?.name || currentUser.name) && o.status !== 'cancelled'
    ).length === 0;

    predEl.innerHTML = `
        <div class="pred-urgency ${urgency}">${urgencyIcon} ${urgencyLabel}</div>

        <div class="pred-stat-grid">
            <div class="pred-stat">
                <span class="pred-stat-label">트레일러 잔량</span>
                <span class="pred-stat-val">${Math.round(trailerKg)} kg</span>
            </div>
            <div class="pred-stat">
                <span class="pred-stat-label">대기 수요 (${waitingCustomers}대)</span>
                <span class="pred-stat-val">${immediateDemandKg} kg</span>
            </div>
            <div class="pred-stat">
                <span class="pred-stat-label">실효 가용량</span>
                <span class="pred-stat-val accent">${Math.round(effectiveKg)} kg</span>
            </div>
            <div class="pred-stat">
                <span class="pred-stat-label">일평균 판매${isDefault ? ' *' : ''}</span>
                <span class="pred-stat-val">${Math.round(dailyKg)} kg</span>
            </div>
        </div>

        <div class="pred-timeline">
            <div class="pred-timeline-item">
                <span class="pred-timeline-label">재고 소진 예상</span>
                <span class="pred-timeline-date ${urgency}">${daysLeftDisplay}</span>
            </div>
            <div class="pred-timeline-item order-rec">
                <span class="pred-timeline-label">⚡ 권장 발주 시점</span>
                <span class="pred-timeline-date ${urgency}">${orderDisplay}</span>
            </div>
            <p class="pred-lead-note">
                납품 소요 ${leadInfo.label} (${leadInfo.hint}) 기준
                ${isDefault ? '· * 이력 없어 150kg/일 기본 적용' : '· 최근 30일 주문 기반'}
            </p>
        </div>
    `;
}

function renderConsumerView() {
    const list = document.getElementById('consumerOrdersList');
    const hiddenConsumerIds = new Set(readHiddenConsumerIds());
    let allMyOrders = getConsumerOrders(currentUser.name).filter(o => !hiddenConsumerIds.has(o.id));

    // 조회일 필터(일별 조회)
    let myOrders = allMyOrders;
    const filterInput = document.getElementById('ordersDateFilter');
    if (filterInput && filterInput.value) {
        const [y, m, d] = filterInput.value.split('-').map(v => parseInt(v, 10));
        if (y && m && d) {
            myOrders = allMyOrders.filter(o =>
                o.year === y &&
                o.month === m &&
                o.day === d
            );
        }
    }

    // 납품일시 이른 순(오름차순) 정렬
    myOrders = myOrders.slice().sort((a, b) => {
        const ka = getOrderDateTimeSortKey(a);
        const kb = getOrderDateTimeSortKey(b);
        const byDateTime = ka.localeCompare(kb);
        if (byDateTime !== 0) return byDateTime;
        return String(a.id || "").localeCompare(String(b.id || ""));
    });

    if (myOrders.length === 0) {
        if (!allMyOrders.length) {
            list.innerHTML = '<div class="empty-state"><p>등록된 주문이 없습니다.</p><p>새 주문을 등록하세요.</p></div>';
        } else {
            const label = (filterInput && filterInput.value) ? filterInput.value : '선택한 날짜';
            list.innerHTML = `<div class="empty-state"><p>${label}에는 주문 이력이 없습니다.</p><p>다른 날짜를 선택하거나 전체 보기를 이용해 보세요.</p></div>`;
        }
        renderInventoryPanel();
        return;
    }

    list.innerHTML = myOrders.map(order => {
        const cr = order.changeRequest;
        const hasPendingChange = cr && cr.status === 'pending';
        const hasRejectedChange = cr && cr.status === 'rejected';
        const cancelReq = order.cancelRequest;
        const hasPendingCancel = cancelReq && cancelReq.status === 'pending';
        const hasRejectedCancel = cancelReq && cancelReq.status === 'rejected';

        const status = normalizeStatus(order.status);
        const canRequestChange = !hasPendingChange && !hasPendingCancel && ['requested', 'accepted', 'change_accepted', 'in_transit', 'arrived'].includes(status);
        const canRequestCancel = !hasPendingCancel && !hasPendingChange && !hasRejectedCancel && !['completed', 'cancelled', 'collecting'].includes(status);
        const immediateCancelable = canRequestCancel && canImmediateCancelOrder(order, 'consumer');
        const canCancelChangeRequest = hasPendingChange && cr.requestedBy === 'consumer';

        const canApproveChange = hasPendingChange && cr.requestedBy === 'supplier';
        const canApproveCancel = hasPendingCancel && cancelReq.requestedBy === 'supplier';
        const hasDecisionRequest = canApproveChange || canApproveCancel;

        const changeBadge = getChangeBadgeText(order);
        const cancelBadge = getCancelBadgeText(order);
        const showChangeBtn = canRequestChange && !immediateCancelable;
        const actionButtons = `
            ${canCancelChangeRequest ? `<button type="button" class="btn btn-small btn-secondary" data-action="cancel-change-request" data-id="${order.id}">변경요청 취소</button>` : ''}
            ${showChangeBtn ? `<button type="button" class="btn btn-small" data-action="request-change" data-id="${order.id}">변경</button>` : ''}
            ${canRequestCancel ? `<button type="button" class="btn btn-small btn-secondary" data-action="request-cancel" data-id="${order.id}">${immediateCancelable ? '즉시 취소' : '취소'}</button>` : ''}
        `.trim();
        const decisionButtons = `
            ${canApproveChange ? `<button type="button" class="btn btn-small btn-primary" data-action="approve-change" data-id="${order.id}">승인</button>
            <button type="button" class="btn btn-small btn-secondary" data-action="reject-change" data-id="${order.id}">거절</button>` : ''}
            ${canApproveCancel ? `<button type="button" class="btn btn-small btn-primary" data-action="approve-cancel" data-id="${order.id}">승인</button>
            <button type="button" class="btn btn-small btn-secondary" data-action="reject-cancel" data-id="${order.id}">거절</button>` : ''}
        `.trim();

        const transportInfo = order.transportInfo;
        const transportInfoText = transportInfo ? `T/T: ${(transportInfo.trailerNumbers || []).join(', ')} · 기사: ${transportInfo.driverName || '-'}` : '';

        const isCancelled = order.status === 'cancelled';
        return `
        <div class="order-item order-item-clickable ${isCancelled ? 'order-item--cancelled' : ''} ${(hasPendingChange || hasRejectedChange || hasPendingCancel || hasRejectedCancel) ? 'has-change-request' : ''}" data-order-id="${order.id}">
            <div class="order-item-head">
                <div class="order-id">${order.id}</div>
                <div class="order-item-head-right">
                    ${hasDecisionRequest
                        ? `<div class="order-status ${status} order-status--action">
                            <span class="order-status-action-label">${getStatusLabel(order.status)}</span>
                            <div class="order-status-action-buttons">${decisionButtons}</div>
                        </div>`
                        : `<span class="order-status ${status}">${getStatusLabel(order.status)}</span>`
                    }
                    ${isCancelled ? `<button type="button" class="order-remove-cancelled-btn" data-action="remove-cancelled-consumer" data-id="${order.id}" title="취소 주문 목록에서 삭제">&times;</button>` : ''}
                </div>
            </div>
            <div class="order-item-datetime-row">
                <div class="order-datetime-with-badge">
                    <span class="order-datetime">${formatOrderDateTime(order)}</span>
                    <span class="supply-condition-badge supply-condition-${order.supplyCondition === 'ex_factory' ? 'ex-factory' : 'delivery'}">${getSupplyConditionLabel(order)}</span>
                </div>
                ${actionButtons ? `<div class="order-actions order-actions--inline">${actionButtons}</div>` : ''}
            </div>
            <div class="order-item-parties-row">
                <div class="order-party order-party--seller">
                    <div class="order-party-name">${order.supplierName || '-'}</div>
                    <div class="order-party-addr">${getSupplierShippingAddress(order.supplierName)}</div>
                </div>
                <div class="order-party order-party--buyer">
                    <div class="order-party-name">${order.consumerName || '-'}</div>
                    <div class="order-party-addr">${order.address || '-'}</div>
                </div>
            </div>
            ${transportInfoText ? `<div class="order-transport-info">${transportInfoText}</div>` : ''}
            ${(changeBadge || cancelBadge) ? `
            <div class="order-item-foot">
                <div class="order-item-badges"><div class="change-summary">${changeBadge || ''} ${cancelBadge || ''}</div></div>
            </div>
            ` : ''}
        </div>
    `}).join('');

    list.querySelectorAll('.order-item-clickable[data-order-id]').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            const orderId = el.dataset.orderId;
            window.open('물량확인증_양식.html?orderId=' + encodeURIComponent(orderId), '_blank', 'noopener');
        });
    });

    renderInventoryPanel();
}

function renderOrdersTable(tbodyId, showActions) {
    const hiddenSupplierIds = new Set(readHiddenSupplierIds());
    const allOrders = getAllOrders().filter(o => !hiddenSupplierIds.has(o.id));
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const colspan = 10;
    tbody.innerHTML = allOrders.map(o => {
        const status = normalizeStatus(o.status);
        const hasPendingChange = o.changeRequest && o.changeRequest.status === 'pending';
        const hasPendingCancel = o.cancelRequest && o.cancelRequest.status === 'pending';

        const canApproveChange = showActions && hasPendingChange && o.changeRequest.requestedBy === 'consumer';
        const canApproveCancel = showActions && hasPendingCancel && o.cancelRequest.requestedBy === 'consumer';

        const canProposeChange = showActions && !hasPendingChange && !hasPendingCancel && ['requested', 'accepted', 'change_accepted'].includes(status);
        const canRequestCancel = showActions && !hasPendingChange && !hasPendingCancel && !['completed', 'cancelled'].includes(status);
        const canCancelChangeRequest = showActions && hasPendingChange && o.changeRequest.requestedBy === 'supplier';
        const advanceAction = showActions && !hasPendingChange && !hasPendingCancel ? getSupplierAdvanceAction(status) : null;

        const travelTimeMin = getOrderTravelTimeMinutes(o);
        const travelTimeText = travelTimeMin === 0 ? '—' : `${travelTimeMin}분`;
        const changeBadge = getChangeBadgeText(o);
        const cancelBadge = getCancelBadgeText(o);
        const noteText = String(o.note || '').trim();

        const supplierStatus = getSupplierStatusLabel(o);
        const supplyLabel = getSupplyConditionLabel(o);

        const isCancelled = o.status === 'cancelled';
        return `
        <tr class="order-row ${isCancelled ? 'row-cancelled' : ''} ${(hasPendingChange || hasPendingCancel) ? 'row-change-request' : ''}" data-order-id="${o.id}">
            <td>${o.id}</td>
            <td>${o.consumerName}</td>
            <td>${formatOrderDate(o)}</td>
            <td>${formatTimeText(o.time)}</td>
            <td>${o.tubeTrailers}대</td>
            <td>${o.address}</td>
            <td><span class="supply-condition-badge supply-condition-${o.supplyCondition === 'ex_factory' ? 'ex-factory' : 'delivery'}">${supplyLabel}</span></td>
            <td><span class="travel-time">${travelTimeText}</span></td>
            <td>
                <span class="order-status ${status}">${supplierStatus}</span>
                ${noteText ? `<div class="change-summary">메모: ${noteText}</div>` : ''}
                ${changeBadge ? `<div class="change-summary">${changeBadge}</div>` : ''}
                ${cancelBadge ? `<div class="change-summary">${cancelBadge}</div>` : ''}
                ${o.transportInfo ? `<div class="change-summary">T/T: ${(o.transportInfo.trailerNumbers || []).join(', ')} · 기사: ${o.transportInfo.driverName || '-'}</div>` : ''}
            </td>
            <td class="table-actions">
                ${isCancelled ? `<button type="button" class="btn btn-tiny order-remove-cancelled-btn" data-action="remove-cancelled-supplier" data-id="${o.id}" title="취소 주문 목록에서 삭제">&times;</button>` : ''}
                ${advanceAction ? `<button type="button" class="btn btn-tiny btn-primary" data-action="advance-status" data-next-status="${advanceAction.next}" data-id="${o.id}">${advanceAction.label}</button>` : ''}
                ${canCancelChangeRequest ? `<button type="button" class="btn btn-tiny btn-secondary" data-action="cancel-change-request" data-id="${o.id}">변경요청 취소</button>` : ''}
                ${canProposeChange ? `<button type="button" class="btn btn-tiny" data-action="request-change" data-id="${o.id}">변경</button>` : ''}
                ${canRequestCancel ? `<button type="button" class="btn btn-tiny btn-secondary" data-action="request-cancel" data-id="${o.id}">취소</button>` : ''}
                ${canApproveChange ? `<button type="button" class="btn btn-tiny btn-primary" data-action="approve-change" data-id="${o.id}">변경 확정</button>
                <button type="button" class="btn btn-tiny btn-secondary" data-action="reject-change" data-id="${o.id}">변경 거절</button>` : ''}
                ${canApproveCancel ? `<button type="button" class="btn btn-tiny btn-primary" data-action="approve-cancel" data-id="${o.id}">취소 승인</button>
                <button type="button" class="btn btn-tiny btn-secondary" data-action="reject-cancel" data-id="${o.id}">취소 거절</button>` : ''}
            </td>
        </tr>
    `}).join('') || `<tr><td colspan="${colspan}" class="empty-state">주문이 없습니다.</td></tr>`;

    tbody.querySelectorAll('.order-row[data-order-id]').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            const orderId = row.dataset.orderId;
            window.open('물량확인증_양식.html?orderId=' + encodeURIComponent(orderId), '_blank', 'noopener');
        });
    });
}

function renderSupplierView() {
    const allOrders = getAllOrders();
    const activeOrders = allOrders.filter(o => o.status !== 'cancelled');
    const totalTrailers = activeOrders.reduce((s, o) => s + (o.tubeTrailers || 0), 0);

    document.getElementById('totalOrders').textContent = activeOrders.length;
    const totalEl = document.getElementById('totalTrailers');
    if (totalEl) totalEl.textContent = totalTrailers + '대';

    if (activeOrders.length > 0) {
        const dates = activeOrders.map(o => formatOrderDate(o));
        const uniqueDates = [...new Set(dates)];
        document.getElementById('deliveryRange').textContent = uniqueDates.length === 1 ? uniqueDates[0] : `${uniqueDates[0]} ~ ${uniqueDates[uniqueDates.length - 1]}`;
    } else {
        document.getElementById('deliveryRange').textContent = '-';
    }

    renderOrdersTable('supplierOrdersTable', true);

    const totalQty = activeOrders.reduce((s, o) => s + getOrderQuantity(o), 0);
    const planEl = document.getElementById('productionPlanSummary');
    if (planEl) {
        planEl.innerHTML = `
            <div class="plan-item"><span>총 트레일러 필요</span><strong>${totalTrailers}대</strong></div>
            <div class="plan-item"><span>예상 수소량 (400kg/대)</span><strong>${totalQty.toLocaleString()} kg</strong></div>
            <div class="plan-item"><span>주문 수요처 수</span><strong>${new Set(activeOrders.map(o => o.address)).size}곳</strong></div>
        `;
    }

    // AI 운송계획 (통합)
    const transportPlan = calculateTransportPlan();
    const aiPlanEl = document.getElementById('aiTransportPlan');
    const scheduleEl = document.getElementById('transportSchedule');

    if (!transportPlan) {
        if (aiPlanEl) aiPlanEl.innerHTML = '<div class="empty-state"><p>주문이 없습니다.</p></div>';
        if (scheduleEl) scheduleEl.innerHTML = '';
    } else {
        if (aiPlanEl) {
            aiPlanEl.innerHTML = `
                <div class="ai-plan-item highlight">
                    <span class="label">총 트레일러</span>
                    <span class="value">${transportPlan.totalTrailers}대 (${transportPlan.totalQuantity.toLocaleString()} kg)</span>
                </div>
                <div class="ai-plan-item">
                    <span class="label">필요 트레일러 수</span>
                    <span class="value">${transportPlan.trailersNeeded}대 ${transportPlan.trailersNeeded > transportPlan.trailersAvailable ? '(⚠ 부족)' : ''}</span>
                </div>
                <div class="ai-plan-item">
                    <span class="label">가용 트레일러</span>
                    <span class="value">${transportPlan.trailersAvailable}대</span>
                </div>
                <div class="ai-plan-item">
                    <span class="label">필요 운송기사 수</span>
                    <span class="value">${transportPlan.driversNeeded}명 ${transportPlan.driversNeeded > transportPlan.driversAvailable ? '(⚠ 부족)' : ''}</span>
                </div>
                <div class="ai-plan-item">
                    <span class="label">가용 운송기사</span>
                    <span class="value">${transportPlan.driversAvailable}명</span>
                </div>
                <div class="ai-plan-item">
                    <span class="label">총 배송 횟수</span>
                    <span class="value">${transportPlan.totalTrips}회</span>
                </div>
                <div class="ai-plan-item">
                    <span class="label">예상 총 운송시간</span>
                    <span class="value">약 ${Math.round(transportPlan.totalDriveTime)}분 (왕복)</span>
                </div>
                ${transportPlan.hasShortage ? '<div class="ai-plan-item" style="border-left:4px solid #f59e0b;"><span class="label">⚠ 권장</span><span class="value">트레일러 또는 기사 추가 필요</span></div>' : ''}
            `;
        }
        if (scheduleEl) {
            scheduleEl.innerHTML = transportPlan.schedule.map(s => `
                <div class="schedule-item">
                    <span class="time">${s.time}</span>
                    <span class="route">${s.route}</span>
                    <span class="quantity">${s.quantity}</span>
                    <span class="trailer">${s.trailer} · ${s.driver}</span>
                </div>
            `).join('');
        }
    }
}

// ========== 주문 지도 모달 ==========
let orderMapInstance = null;

function openOrderMapModal(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const destCoords = getCoordinatesFromAddress(order.address);
    const travelTimeMin = getOrderTravelTimeMinutes(order);
    const isExFactory = order.supplyCondition === 'ex_factory';

    document.getElementById('orderMapTitle').textContent = isExFactory ? `주문 ${order.id} - 출하지 픽업` : `주문 ${order.id} - 튜브트레일러 배송 경로`;
    document.getElementById('orderMapInfo').innerHTML = `
        <div class="map-info-row"><strong>수요처:</strong> ${order.consumerName}</div>
        <div class="map-info-row"><strong>공급조건:</strong> ${getSupplyConditionLabel(order)}</div>
        <div class="map-info-row"><strong>${isExFactory ? '픽업지' : '납품지'}:</strong> ${order.address}</div>
        <div class="map-info-row"><strong>트레일러:</strong> ${order.tubeTrailers}대</div>
        <div class="map-info-row"><strong>${isExFactory ? '픽업' : '생산지→수요처 운송시간'}:</strong> ${isExFactory ? '—' : `약 ${travelTimeMin}분`}</div>
    `;

    document.getElementById('orderMapModal').classList.add('active');

    // 기존 map 제거
    const mapEl = document.getElementById('orderMap');
    mapEl.innerHTML = '';

    if (typeof L !== 'undefined') {
        const map = L.map('orderMap').setView([37.45, 126.9], 10);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        // 생산지 마커
        const prodIcon = L.divIcon({
            className: 'custom-marker prod-marker',
            html: '<div class="marker-pin prod">🏭</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        });
        L.marker([PRODUCTION_SITE.lat, PRODUCTION_SITE.lng], { icon: prodIcon })
            .addTo(map)
            .bindPopup(`<b>${PRODUCTION_SITE.name}</b><br>생산지`);

        // 수요처 마커 (튜브트레일러 도착지)
        const destIcon = L.divIcon({
            className: 'custom-marker dest-marker',
            html: '<div class="marker-pin dest">🚛</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        });
        L.marker([destCoords.lat, destCoords.lng], { icon: destIcon })
            .addTo(map)
            .bindPopup(`<b>${order.address}</b><br>수요처 (트레일러 ${order.tubeTrailers}대)`);

        // 경로선
        L.polyline([
            [PRODUCTION_SITE.lat, PRODUCTION_SITE.lng],
            [destCoords.lat, destCoords.lng]
        ], { color: '#3B82F6', weight: 3, dashArray: '5, 10' }).addTo(map);

        map.fitBounds([
            [PRODUCTION_SITE.lat, PRODUCTION_SITE.lng],
            [destCoords.lat, destCoords.lng]
        ], { padding: [50, 50] });

        orderMapInstance = map;
    } else {
        mapEl.innerHTML = '<div class="empty-state"><p>지도를 불러올 수 없습니다.</p></div>';
    }
}

function closeOrderMapModal() {
    document.getElementById('orderMapModal').classList.remove('active');
    if (orderMapInstance) {
        orderMapInstance.remove();
        orderMapInstance = null;
    }
}

// ========== 주문 상세 팝업 ==========
function formatIsoDateTime(isoOrTs) {
    if (isoOrTs == null || isoOrTs === '') return '-';
    try {
        const d = new Date(isoOrTs);
        if (isNaN(d.getTime())) return '-';
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch (_) { return '-'; }
}

function getActorName(order, role) {
    if (!order) return '-';
    return role === 'consumer' ? (order.consumerName || '수요자') : (order.supplierName || '공급자');
}

function buildOrderChangeHistory(order) {
    const history = [];
    if (!order) return history;

    const add = (text, at) => {
        if (at) history.push({ text, at: new Date(at).getTime() });
        else history.push({ text, at: 0 });
    };

    if (order.changeHistory && Array.isArray(order.changeHistory)) {
        order.changeHistory.forEach(h => history.push(h));
    } else {
        const cr = order.changeRequest;
        if (cr) {
            const who = getActorName(order, cr.requestedBy);
            add(`${who}가 ${formatIsoDateTime(cr.requestedAt)}에 변경 요청`, cr.requestedAt);
            if (cr.status === 'approved' || (order.lastChange && order.lastChange.result === 'approved')) {
                const lc = order.lastChange;
                const decider = lc ? getActorName(order, lc.decidedBy) : '-';
                add(`${decider}가 ${formatIsoDateTime(lc?.decidedAt)}에 승인`, lc?.decidedAt);
            } else if (cr.status === 'rejected' || (order.lastChange && order.lastChange.result === 'rejected')) {
                const lc = order.lastChange;
                const decider = lc ? getActorName(order, lc.decidedBy) : '-';
                add(`${decider}가 ${formatIsoDateTime(cr.decidedAt || lc?.decidedAt)}에 거절`, cr.decidedAt || lc?.decidedAt);
            }
        }
        const cancelReq = order.cancelRequest;
        if (cancelReq) {
            const who = getActorName(order, cancelReq.requestedBy);
            add(`${who}가 ${formatIsoDateTime(cancelReq.requestedAt)}에 취소 요청`, cancelReq.requestedAt);
            if (cancelReq.status === 'approved' && order.lastCancel) {
                const lc = order.lastCancel;
                const decider = getActorName(order, lc.decidedBy);
                add(`${decider}가 ${formatIsoDateTime(lc.decidedAt)}에 승인 (취소 완료)`, lc.decidedAt);
            } else if (cancelReq.status === 'rejected' && order.lastCancel) {
                const lc = order.lastCancel;
                const decider = getActorName(order, lc.decidedBy);
                add(`${decider}가 ${formatIsoDateTime(lc.decidedAt)}에 거절`, lc.decidedAt);
            }
        }
        if (order.lastChange && !cr) {
            const lc = order.lastChange;
            const decider = getActorName(order, lc.decidedBy);
            add(`${decider}가 ${formatIsoDateTime(lc.decidedAt)}에 변경 ${lc.result === 'approved' ? '승인' : '거절'}`, lc.decidedAt);
        }
    }

    history.sort((a, b) => a.at - b.at);
    return history;
}

// ========== 운송 시작 모달 ==========
function openTransportStartModal(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    document.getElementById('transportStartOrderId').value = orderId;
    document.getElementById('transportTrailerNumbers').value = '';
    document.getElementById('transportDriverName').value = '';
    document.getElementById('transportStartModal').classList.add('active');
}

function closeTransportStartModal() {
    document.getElementById('transportStartModal').classList.remove('active');
}

// ========== 변경 요청 ==========
function openChangeRequestModal(orderId, requestedBy) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    document.getElementById('changeOrderId').value = orderId;
    document.getElementById('changeRequestedBy').value = requestedBy;
    document.getElementById('changeYear').value = order.year;
    document.getElementById('changeMonth').value = order.month;
    document.getElementById('changeDay').value = order.day;
    document.getElementById('changeTrailers').value = order.tubeTrailers;
    document.getElementById('changeAddress').value = order.address;

    const [h, m] = (order.time || '09:00').split(':');
    document.getElementById('changeHour').value = h;
    document.getElementById('changeMinute').value = m || '00';

    document.getElementById('changeModalTitle').textContent = requestedBy === 'consumer' ? '주문 변경 요청 (공급자 확정 필요)' : '주문 변경 요청 (수요자 확정 필요)';
    document.getElementById('changeRequestModal').classList.add('active');
}

function openApprovalModal(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order || !order.changeRequest || order.changeRequest.status !== 'pending') return;

    pendingApprovalOrderId = orderId;
    const cr = order.changeRequest;
    const body = document.getElementById('approvalModalBody');
    const summary = summarizeChange(order, cr.proposed);
    body.innerHTML = `
        <p><strong>주문 ${order.id}</strong></p>
        <p>${cr.requestedBy === 'supplier' ? '공급자' : '수요자'}가 아래와 같이 변경을 요청했습니다.</p>
        <p class="change-summary">요약: ${summary}</p>
        <div class="change-diff">
            <p><strong>현재:</strong> ${order.year}/${order.month}/${order.day} ${formatTimeText(order.time)}, 트레일러 ${order.tubeTrailers}대</p>
            <p><strong>변경 후:</strong> ${cr.proposed.year}/${cr.proposed.month}/${cr.proposed.day} ${formatTimeText(cr.proposed.time)}, 트레일러 ${cr.proposed.tubeTrailers}대</p>
            <p><strong>주소:</strong> ${cr.proposed.address || order.address}</p>
        </div>
    `;
    document.getElementById('approvalModalTitle').textContent = '변경 요청 검토 - 확정하시겠습니까?';
    document.getElementById('changeApprovalModal').classList.add('active');
}

function applyChange(orderId, approved) {
    const order = orders.find(o => o.id === orderId);
    if (!order || !order.changeRequest) return;

    const decidedAt = new Date().toISOString();
    const p = order.changeRequest.proposed;
    const summary = summarizeChange(order, p);
    const requestedBy = order.changeRequest.requestedBy;
    const decidedBy = requestedBy === 'consumer' ? 'supplier' : 'consumer';

    if (approved) {
        order.year = p.year;
        order.month = p.month;
        order.day = p.day;
        order.time = p.time;
        order.tubeTrailers = p.tubeTrailers;
        if (p.address) order.address = p.address;
        order.lastChange = { result: 'approved', summary, decidedAt, decidedBy, requestedBy };

        order.changeRequest = null;
        order.status = 'change_accepted';
    } else {
        order.lastChange = { result: 'rejected', summary, decidedAt, decidedBy, requestedBy };
        order.changeRequest.status = 'rejected';
        order.changeRequest.decidedAt = decidedAt;
        order.changeRequest.decidedBy = decidedBy;
        order.status = order.changeRequest.originalStatus || 'accepted';
    }

    localStorage.setItem('h2go_orders', JSON.stringify(orders));
    pendingApprovalOrderId = null;
    document.getElementById('changeApprovalModal').classList.remove('active');
    renderConsumerView();
    renderSupplierView();
}

// ========== 이벤트 ==========
function initTimeInputs() {
    const now = new Date();
    const hourEl = document.getElementById('orderHour');
    const minuteEl = document.getElementById('orderMinute');
    if (hourEl && !hourEl.value) {
        hourEl.value = now.getHours();
    }
    if (minuteEl && !minuteEl.value) {
        minuteEl.value = now.getMinutes().toString().padStart(2, '0');
    }
}

function initFormDefaults() {
    const today = getTodayParts();
    const yearEl = document.getElementById('orderYear');
    const monthEl = document.getElementById('orderMonth');
    const dayEl = document.getElementById('orderDay');
    const dateMobileEl = document.getElementById('orderDateMobile');
    if (yearEl) yearEl.value = today.year;
    if (monthEl) monthEl.value = today.month;
    if (dayEl) dayEl.value = today.day;
    if (dateMobileEl) {
        dateMobileEl.value = `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;
    }
}

function initOrdersDateFilterDefault() {
    const filterInput = document.getElementById('ordersDateFilter');
    if (filterInput && !filterInput.value) {
        const today = getTodayParts();
        filterInput.value = `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;
    }
}

function syncDateInputFromNumericFields() {
    const y = parseInt(document.getElementById('orderYear')?.value || '', 10);
    const m = parseInt(document.getElementById('orderMonth')?.value || '', 10);
    const d = parseInt(document.getElementById('orderDay')?.value || '', 10);
    const dateMobileEl = document.getElementById('orderDateMobile');
    if (!dateMobileEl || !y || !m || !d) return;
    dateMobileEl.value = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function syncNumericFieldsFromDateInput() {
    const dateMobileEl = document.getElementById('orderDateMobile');
    const raw = String(dateMobileEl?.value || '').trim();
    if (!raw) return null;
    const parts = raw.split('-').map(v => parseInt(v, 10));
    if (parts.length !== 3 || parts.some(v => Number.isNaN(v))) return null;
    const [year, month, day] = parts;
    const yearEl = document.getElementById('orderYear');
    const monthEl = document.getElementById('orderMonth');
    const dayEl = document.getElementById('orderDay');
    if (yearEl) yearEl.value = year;
    if (monthEl) monthEl.value = month;
    if (dayEl) dayEl.value = day;
    return { year, month, day };
}

function adjustNumericField(id, delta) {
    const el = document.getElementById(id);
    if (!el) return;
    const current = parseInt(el.value || el.min || "0", 10);
    const min = el.min !== "" ? parseInt(el.min, 10) : -Infinity;
    const max = el.max !== "" ? parseInt(el.max, 10) : Infinity;
    let next = isNaN(current) ? 0 : current + delta;
    if (next < min) next = min;
    if (next > max) next = max;
    el.value = next;
    if (id === 'orderYear' || id === 'orderMonth' || id === 'orderDay') {
        syncDateInputFromNumericFields();
    }
}

function initDateTimeToggles() {
    document.querySelectorAll('.dt-toggle[data-target][data-step]').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            const step = parseInt(btn.getAttribute('data-step') || "0", 10);
            if (!target || !step) return;
            adjustNumericField(target, step);
        });
    });
}

function initDateTimeWheelAdjust() {
    // 데스크톱(정밀 포인터)에서만 휠 증감 활성화
    if (!window.matchMedia('(pointer:fine)').matches) return;
    document.querySelectorAll('.order-datetime-wrap input[type="number"]').forEach(inputEl => {
        inputEl.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 1 : -1;
            adjustNumericField(inputEl.id, delta);
        }, { passive: false });
    });
}

// ========== 공급자 선택(수요모드) ==========
function setSupplierName(name) {
    selectedSupplierName = String(name || "").trim();
    const input = document.getElementById("orderSupplierName");
    if (input) input.value = selectedSupplierName || "";
}

// 출하도 선택 시 납품 주소 입력 숨김, 도착도 시 표시
function toggleOrderAddressBySupplyCondition() {
    const scInput = document.getElementById('supplyConditionInput');
    const isExFactory = (scInput && scInput.value) === 'ex_factory';
    const group = document.getElementById('orderAddressFormGroup');
    const input = document.getElementById('orderAddress');
    if (!group || !input) return;
    if (isExFactory) {
        group.style.display = 'none';
        input.removeAttribute('required');
        input.value = '';
    } else {
        group.style.display = '';
        input.setAttribute('required', 'required');
    }
}

function openSupplierSelectModal() {
    const modal = document.getElementById("supplierSelectModal");
    const listEl = document.getElementById("supplierList");
    const manualEl = document.getElementById("supplierManualInput");
    const addressDisplay = document.getElementById("supplierShippingAddressDisplay");
    if (!modal || !listEl) return;

    const currentSupplier = String(selectedSupplierName || "").trim();
    if (addressDisplay) {
        addressDisplay.textContent = currentSupplier
            ? getSupplierShippingAddress(currentSupplier)
            : "공급자를 선택하면 출하 주소가 표시됩니다.";
    }

    const candidates = getSupplierCandidates(currentUser.name);
    if (candidates.length === 0) {
        listEl.innerHTML = '<p class="supplier-list-empty">등록된 공급자가 없습니다. 공급자 등록 메뉴에서 추가하거나 아래 직접 입력을 이용하세요.</p>';
    } else {
        listEl.innerHTML = candidates.map(n => {
            const addr = getSupplierShippingAddress(n);
            return `<button type="button" data-supplier="${String(n).replace(/"/g, "&quot;")}" data-address="${String(addr).replace(/"/g, "&quot;")}">${n}</button>`;
        }).join("");
    }

    listEl.querySelectorAll("button[data-supplier]").forEach(btn => {
        btn.addEventListener("click", () => {
            setSupplierName(btn.dataset.supplier);
            if (addressDisplay && btn.dataset.address) addressDisplay.textContent = btn.dataset.address;
            modal.classList.remove("active");
        });
    });

    if (manualEl) manualEl.value = "";
    modal.classList.add("active");
}

// 도착도/출하도 버튼 토글
function initSupplyConditionToggles() {
    const hiddenInput = document.getElementById('supplyConditionInput');
    document.querySelectorAll('.supply-condition-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            document.querySelectorAll('.supply-condition-toggle').forEach(b => {
                const isActive = b.dataset.type === type;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-pressed', isActive);
            });
            if (hiddenInput) hiddenInput.value = type;
            toggleOrderAddressBySupplyCondition();
        });
    });
}

document.getElementById("changeSupplierBtn")?.addEventListener("click", openSupplierSelectModal);
document.getElementById("supplierManualApplyBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("supplierSelectModal");
    const manualEl = document.getElementById("supplierManualInput");
    const addressDisplay = document.getElementById("supplierShippingAddressDisplay");
    const v = String(manualEl?.value || "").trim();
    if (!v) {
        alert("공급자명을 입력해 주세요.");
        return;
    }
    setSupplierName(v);
    if (addressDisplay) addressDisplay.textContent = getSupplierShippingAddress(v);
    modal?.classList.remove("active");
});

document.getElementById('roleSelect').addEventListener('change', (e) => {
    if (e.target.disabled) return;
    const role = e.target.value;
    currentUser.type = role;
    if (auth?.name) currentUser.name = auth.name;
    const bizEl = document.getElementById('bizName');
    if (bizEl) bizEl.textContent = currentUser.name;
    try {
        const nextAuth = { ...auth, activeRole: role };
        localStorage.setItem(AUTH_KEY, JSON.stringify(nextAuth));
    } catch (_) {}
    showView(role);
    if (role === 'consumer') renderConsumerView();
    if (role === 'supplier') renderSupplierView();
});

document.getElementById('backToConsumerDashboard')?.addEventListener('click', () => {
    showView('consumer');
    renderConsumerView();
});

document.getElementById('addSupplierBtn')?.addEventListener('click', () => {
    const nameEl = document.getElementById('newSupplierName');
    const addrEl = document.getElementById('newSupplierAddress');
    const name = String(nameEl?.value || '').trim();
    const addr = String(addrEl?.value || '').trim();
    if (!name) {
        alert('공급자명을 입력해 주세요.');
        return;
    }
    const list = readRegisteredSuppliers();
    const exists = list.some(s => (typeof s === 'string' ? s : s?.name || '').toLowerCase() === name.toLowerCase());
    if (exists) {
        alert('이미 등록된 공급자입니다.');
        return;
    }
    list.push(addr ? { name, address: addr } : name);
    writeRegisteredSuppliers(list);
    if (nameEl) nameEl.value = '';
    if (addrEl) addrEl.value = '';
    renderSupplierRegistration();
});

document.getElementById('orderForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const supplierName = String(selectedSupplierName || auth?.name || currentUser.name).trim();
    const scInput = document.getElementById('supplyConditionInput');
    const supplyCondition = (scInput && scInput.value) || 'delivery';
    const addressValue = supplyCondition === 'ex_factory'
        ? getSupplierShippingAddress(supplierName)
        : normalizeAddress(document.getElementById('orderAddress').value);
    if (!addressValue) {
        alert('납품 주소를 입력해 주세요.');
        return;
    }
    if (supplyCondition === 'delivery' && !normalizeAddress(document.getElementById('orderAddress').value)) {
        alert('납품 주소를 입력해 주세요.');
        return;
    }
    const useMobileDateInput = window.matchMedia('(max-width: 768px)').matches;
    const pickedDate = useMobileDateInput ? syncNumericFieldsFromDateInput() : null;
    const year = pickedDate?.year ?? parseInt(document.getElementById('orderYear').value, 10);
    const month = pickedDate?.month ?? parseInt(document.getElementById('orderMonth').value, 10);
    const day = pickedDate?.day ?? parseInt(document.getElementById('orderDay').value, 10);
    const order = {
        id: generateOrderId({
            supplierName,
            consumerName: currentUser.name,
            year,
            month,
            day,
        }),
        consumerName: currentUser.name,
        supplierName,
        year,
        month,
        day,
        time: `${String(document.getElementById('orderHour').value).padStart(2, '0')}:${String(document.getElementById('orderMinute').value).padStart(2, '0')}`,
        tubeTrailers: 1,
        address: addressValue,
        supplyCondition: supplyCondition,
        note: document.getElementById('orderNote').value,
        status: 'requested',
        createdAt: new Date().toISOString()
    };
    orders.push(order);
    localStorage.setItem('h2go_orders', JSON.stringify(orders));
    if (supplyCondition === 'delivery') addAddressToHistory(addressValue);
    renderAddressHistoryOptions();
    document.getElementById('orderForm').reset();
    initFormDefaults();
    initTimeInputs();
    if (scInput) scInput.value = 'delivery';
    document.querySelectorAll('.supply-condition-toggle').forEach(b => {
        const isDelivery = b.dataset.type === 'delivery';
        b.classList.toggle('active', isDelivery);
        b.setAttribute('aria-pressed', isDelivery);
    });
    toggleOrderAddressBySupplyCondition();
    renderConsumerView();
    renderSupplierView();
    alert('주문이 등록되었습니다. 공급자에게 전달됩니다.');
});

document.getElementById('changeRequestForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const orderId = document.getElementById('changeOrderId').value;
    const requestedBy = document.getElementById('changeRequestedBy').value;
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const proposed = {
        year: parseInt(document.getElementById('changeYear').value),
        month: parseInt(document.getElementById('changeMonth').value),
        day: parseInt(document.getElementById('changeDay').value),
        time: `${String(document.getElementById('changeHour').value).padStart(2, '0')}:${String(document.getElementById('changeMinute').value).padStart(2, '0')}`,
        tubeTrailers: parseInt(document.getElementById('changeTrailers').value),
        address: document.getElementById('changeAddress').value
    };

    order.changeRequest = {
        requestedBy,
        proposed,
        status: 'pending',
        requestedAt: new Date().toISOString(),
        originalStatus: normalizeStatus(order.status),
    };
    order.status = 'change_requested';

    localStorage.setItem('h2go_orders', JSON.stringify(orders));
    document.getElementById('changeRequestModal').classList.remove('active');
    renderConsumerView();
    renderSupplierView();
    alert('변경 요청이 제출되었습니다. 상대방의 확정을 기다립니다.');
});

document.getElementById('transportStartForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const orderId = document.getElementById('transportStartOrderId').value;
    const trailerInput = String(document.getElementById('transportTrailerNumbers').value || '').trim();
    const driverName = String(document.getElementById('transportDriverName').value || '').trim();
    if (!trailerInput || !driverName) {
        alert('T/T 번호와 운송기사를 모두 입력해 주세요.');
        return;
    }
    const trailerNumbers = trailerInput.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean);
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    order.transportInfo = { trailerNumbers, driverName };
    order.status = 'in_transit';
    order.transportStartedAt = new Date().toISOString();
    localStorage.setItem('h2go_orders', JSON.stringify(orders));
    closeTransportStartModal();
    renderConsumerView();
    renderSupplierView();
    alert('운송이 시작되었습니다. T/T 번호와 운송기사 정보가 구매자에게 표시됩니다.');
});

document.getElementById('approveChangeBtn').addEventListener('click', () => {
    if (!pendingApprovalOrderId) return;
    applyChange(pendingApprovalOrderId, true);
    alert('변경 요청이 승인되었습니다. 주문 상태가 "변경 접수"로 변경됩니다.');
});

document.getElementById('rejectChangeBtn').addEventListener('click', () => {
    if (!pendingApprovalOrderId) return;
    applyChange(pendingApprovalOrderId, false);
    alert('변경 요청이 거절되었습니다. 주문 상태가 이전 단계로 유지됩니다.');
});

document.getElementById('changeRequestModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.target.classList.remove('active');
});
document.getElementById('orderMapModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeOrderMapModal();
});
document.getElementById('changeApprovalModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.target.classList.remove('active');
});

// 모달 content 안쪽 클릭이 백드롭까지 버블링되어 모달이 닫히는 것 방지
document.querySelectorAll('.modal-content').forEach(el => {
    el.addEventListener('click', e => e.stopPropagation());
});
document.querySelector('#orderMapModal .modal-close')?.addEventListener('click', closeOrderMapModal);
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('orderMapModal').classList.contains('active')) closeOrderMapModal();
    else if (document.getElementById('transportStartModal').classList.contains('active')) closeTransportStartModal();
});
document.querySelector('#changeRequestModal .modal-close').addEventListener('click', () => {
    document.getElementById('changeRequestModal').classList.remove('active');
});
document.querySelector('#changeApprovalModal .modal-close').addEventListener('click', () => {
    document.getElementById('changeApprovalModal').classList.remove('active');
});
document.querySelector('#supplierSelectModal .modal-close')?.addEventListener('click', () => {
    document.getElementById('supplierSelectModal')?.classList.remove('active');
});
document.getElementById('supplierSelectModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('active');
});
document.querySelector('#transportStartModal .modal-close')?.addEventListener('click', closeTransportStartModal);
document.getElementById('transportStartModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeTransportStartModal();
});

document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const orderId = btn.dataset.id;
    const order = orderId ? orders.find(o => o.id === orderId) : null;

    function persistAndRerender() {
        localStorage.setItem('h2go_orders', JSON.stringify(orders));
        renderConsumerView();
        renderSupplierView();
        lastOrdersSnapshot = deepClone(orders);
    }

    function requestCancel(o, requestedBy) {
        if (!o) return;
        if (o.cancelRequest && o.cancelRequest.status === 'pending') return;
        o.cancelRequest = { requestedBy, status: 'pending', requestedAt: new Date().toISOString(), originalStatus: normalizeStatus(o.status) };
        o.status = 'cancel_requested';
    }

    function decideCancel(o, approved) {
        if (!o || !o.cancelRequest) return;
        const decidedAt = new Date().toISOString();
        const requestedBy = o.cancelRequest.requestedBy;
        const decidedBy = requestedBy === 'consumer' ? 'supplier' : 'consumer';

        if (approved) {
            o.status = 'cancelled';
            o.cancelledAt = decidedAt;
            o.cancelRequest.status = 'approved';
            o.cancelRequest.decidedAt = decidedAt;
            o.cancelRequest.decidedBy = decidedBy;
            o.lastCancel = { result: 'approved', decidedAt, decidedBy };
        } else {
            o.cancelRequest.status = 'rejected';
            o.cancelRequest.decidedAt = decidedAt;
            o.cancelRequest.decidedBy = decidedBy;
            o.lastCancel = { result: 'rejected', decidedAt, decidedBy, reason: o.cancelRequest.reason || "" };
            o.status = o.cancelRequest.originalStatus || 'accepted';
        }
    }

    if (action === 'cancel-change-request') {
        if (!order || !order.changeRequest || order.changeRequest.status !== 'pending') return;
        const actor = getActorForOrder(order);
        if (order.changeRequest.requestedBy !== actor) return;
        if (!confirm('변경 요청을 취소하시겠습니까?')) return;
        order.status = order.changeRequest.originalStatus || 'accepted';
        order.changeRequest = null;
        persistAndRerender();
        alert('변경 요청이 취소되었습니다.');
    } else if (action === 'request-change') {
        if (!order) return;
        const actor = getActorForOrder(order);
        if (order.changeRequest && order.changeRequest.status === 'pending') return;
        if (order.cancelRequest && order.cancelRequest.status === 'pending') return;
        openChangeRequestModal(orderId, actor);
    } else if (action === 'approve-change') {
        openApprovalModal(orderId);
    } else if (action === 'reject-change') {
        if (confirm('변경 요청을 거절하시겠습니까?')) {
            applyChange(orderId, false);
            alert('변경 요청이 거절되었습니다.');
        }
    } else if (action === 'advance-status') {
        if (!order) return;
        const actor = getActorForOrder(order);
        if (actor !== 'supplier') return;
        if (order.changeRequest?.status === 'pending' || order.cancelRequest?.status === 'pending') return;
        const nextStatus = String(btn.dataset.nextStatus || '').trim();
        if (!nextStatus) return;
        if (nextStatus === 'in_transit') {
            openTransportStartModal(orderId);
            return;
        }
        order.status = nextStatus;
        const nowIso = new Date().toISOString();
        if (nextStatus === 'accepted') order.acceptedAt = nowIso;
        if (nextStatus === 'arrived') order.arrivedAt = nowIso;
        if (nextStatus === 'collecting') order.collectingAt = nowIso;
        if (nextStatus === 'completed') order.completedAt = nowIso;
        persistAndRerender();
        alert(`주문 상태가 "${getStatusLabel(nextStatus)}"로 변경되었습니다.`);
    } else if (action === 'request-cancel') {
        if (!order) return;
        const actor = getActorForOrder(order);
        if (order.cancelRequest?.status === 'pending') return;
        if (order.changeRequest?.status === 'pending') {
            alert('변경 요청 검토가 진행 중입니다. 먼저 승인/거절 후 취소를 요청해 주세요.');
            return;
        }
        const canImmediateCancel = canImmediateCancelOrder(order, actor) && order.changeRequest?.status !== 'pending';
        if (canImmediateCancel) {
            if (!confirm('아직 접수되지 않은 주문은 공급자 동의 없이 즉시 취소됩니다. 지금 취소할까요?')) return;
            order.status = 'cancelled';
            order.cancelledAt = new Date().toISOString();
            order.cancelRequest = { requestedBy: 'consumer', status: 'approved', requestedAt: order.cancelledAt, decidedAt: order.cancelledAt, decidedBy: 'consumer' };
            order.lastCancel = { result: 'approved', decidedAt: order.cancelledAt, decidedBy: 'consumer' };
            persistAndRerender();
            alert('주문이 즉시 취소되었습니다.');
            return;
        }
        if (!confirm('이 주문에 대해 취소(삭제) 요청을 보내시겠습니까? 상대방 승인 후 삭제됩니다.')) return;
        requestCancel(order, actor);
        persistAndRerender();
        alert('취소 요청을 보냈습니다. 상대방 승인을 기다립니다.');
    } else if (action === 'approve-cancel') {
        if (!order || !order.cancelRequest || order.cancelRequest.status !== 'pending') return;
        if (!confirm('취소 요청을 승인하시겠습니까? 승인하면 주문이 취소 상태로 표시됩니다.')) return;
        decideCancel(order, true);
        persistAndRerender();
        alert('취소 요청을 승인했습니다. 주문이 취소 상태로 표시됩니다.');
    } else if (action === 'reject-cancel') {
        if (!order || !order.cancelRequest || order.cancelRequest.status !== 'pending') return;
        const reason = window.prompt("취소 요청 거절 사유를 입력해 주세요.", "");
        if (reason === null) return;
        order.cancelRequest.reason = String(reason || "").trim();
        decideCancel(order, false);
        persistAndRerender();
        alert('취소 요청을 거절했습니다. 사유가 요청자에게 전달됩니다.');
    } else if (action === 'remove-cancelled-consumer') {
        if (!orderId || !order || order.status !== 'cancelled') return;
        addHiddenConsumerOrderId(orderId);
        renderConsumerView();
        renderSupplierView();
    } else if (action === 'remove-cancelled-supplier') {
        if (!orderId || !order || order.status !== 'cancelled') return;
        addHiddenSupplierOrderId(orderId);
        renderConsumerView();
        renderSupplierView();
    }
});

document.getElementById('recalculateBtn')?.addEventListener('click', () => renderSupplierView());

// ========== 재고 패널 이벤트 ==========
document.getElementById('addTrailerBtn')?.addEventListener('click', () => {
    const inv = readInventory();
    const maxId = inv.trailers.reduce((m, t) => Math.max(m, t.id), 0);
    inv.trailers.push({ id: maxId + 1, pressure: INV_MAX_PRESSURE });
    saveInventory(inv);
    renderInventoryPanel();
});

document.getElementById('waitingCustomers')?.addEventListener('change', (e) => {
    const inv = readInventory();
    inv.waitingCustomers = Math.max(0, parseInt(e.target.value) || 0);
    saveInventory(inv);
    renderInventoryPanel();
});

// 모바일 캘린더 입력(주문요청) 변경 시 숫자 필드 동기화
document.getElementById('orderDateMobile')?.addEventListener('change', () => {
    syncNumericFieldsFromDateInput();
});
['orderYear', 'orderMonth', 'orderDay'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', syncDateInputFromNumericFields);
});

// 주문 현황 - 일별 필터 이벤트(조회 버튼 클릭 시 적용)
document.getElementById('ordersDateApplyBtn')?.addEventListener('click', () => {
    renderConsumerView();
});

// 초기화
const initialRole = (currentUser.type === 'supplier' || currentUser.type === 'consumer') ? currentUser.type : 'consumer';
const bizEl = document.getElementById('bizName');
if (bizEl) bizEl.textContent = currentUser.name;
const roleSelectEl = document.getElementById('roleSelect');
roleSelectEl.value = initialRole;
roleSelectEl.disabled = false;
roleSelectEl.title = "구매/판매 모드를 전환할 수 있습니다.";

initTheme();
initFormDefaults();
initOrdersDateFilterDefault();
initTimeInputs();
initDateTimeToggles();
initDateTimeWheelAdjust();
initSupplyConditionToggles();
toggleOrderAddressBySupplyCondition();
renderAddressHistoryOptions();
setSupplierName(currentUser.name);
showView(initialRole);
if (initialRole === 'consumer') renderConsumerView();
if (initialRole === 'supplier') renderSupplierView();

// 다른 탭/창에서 주문이 갱신되면 현재 화면도 즉시 반영 + 결정 알림(거절/승인)
window.addEventListener('storage', (e) => {
    if (!e) return;
    if (e.key !== 'h2go_orders') return;
    const prev = lastOrdersSnapshot;
    try {
        orders = readOrdersFromStorage();
    } catch (_) {
        orders = [];
    }
    renderConsumerView();
    renderSupplierView();
    detectAndNotifyChangeDecisions(prev, orders);
    lastOrdersSnapshot = deepClone(orders);
});

// 로그아웃
document.getElementById('logoutBtn')?.addEventListener('click', () => {
    if (!confirm("로그아웃하시겠습니까?")) return;
    clearAuth();
    redirectToLogin();
});

// 구형 데이터 마이그레이션(예: quantity 기반 → tubeTrailers 기반)
const needsMigration = orders.some(o => !o.tubeTrailers && o.quantity != null);
if (needsMigration) {
    orders = orders.map(o => {
        if (o && !o.tubeTrailers && o.quantity != null) {
            const qty = Number(o.quantity) || 0;
            const tubeTrailers = Math.max(1, Math.round(qty / TRAILER_CAPACITY_KG));
            const next = { ...o, tubeTrailers };
            delete next.quantity;
            return next;
        }
        return o;
    });
    localStorage.setItem('h2go_orders', JSON.stringify(orders));
}

