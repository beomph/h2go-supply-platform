// H2GO 대시보드 - 수소거래 플랫폼

// ========== 로그인 상태 확인 ==========
const AUTH_KEY = "h2go_auth";
const DEFAULT_ROLES = ["consumer", "supplier"];
const USERS_KEY = "h2go_users";

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

function getSupplierCandidates(currentBizName) {
    // 가입된 사업자명을 공급자 후보로 사용
    const users = readUsers();
    const names = users.map(u => u?.name).filter(Boolean);
    const merged = uniqueNames([currentBizName, ...names]);
    return merged;
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

// 주소별 운송시간 (분)
function getTravelTimeFromAddress(addr) {
    const keywords = [{ key: '강남', time: 60 }, { key: '인천', time: 40 }, { key: '수원', time: 50 }, { key: '안산', time: 75 }, { key: '부천', time: 55 }];
    const found = keywords.find(k => addr && addr.includes(k.key));
    return found ? found.time : 60;
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

// ========== 30분 단위 시각 옵션 생성 ==========
function buildTimeOptions() {
    const options = [];
    for (let h = 0; h < 24; h++) {
        options.push(`${h.toString().padStart(2, '0')}:00`);
        options.push(`${h.toString().padStart(2, '0')}:30`);
    }
    return options;
}

const TIME_OPTIONS = buildTimeOptions();

// ========== 유틸리티 ==========
function generateOrderId() {
    return 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();
}

function getTodayParts() {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function getConsumerOrders(consumerName) {
    return orders.filter(o => o.consumerName === consumerName && o.status !== 'cancelled');
}

function getSupplierOrders(supplierName) {
    return orders.filter(o => (o.supplierName || supplierName) === supplierName);
}

function getAllOrders() {
    const supplierName = auth?.name || currentUser.name;
    const scoped = getSupplierOrders(supplierName);
    return scoped
        .filter(o => o.status !== 'cancelled')
        .sort((a, b) => {
            const da = `${a.year}-${String(a.month).padStart(2, '0')}-${String(a.day).padStart(2, '0')} ${a.time}`;
            const db = `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')} ${b.time}`;
            return da.localeCompare(db);
        });
}

function formatOrderDateTime(order) {
    return `${order.year}/${order.month}/${order.day} ${order.time}`;
}

function formatOrderDate(order) {
    return `${order.year}/${order.month}/${order.day}`;
}

function summarizeChange(order, proposed) {
    if (!order || !proposed) return "";
    const changes = [];
    const fromDt = `${order.year}/${order.month}/${order.day} ${order.time}`;
    const toDt = `${proposed.year}/${proposed.month}/${proposed.day} ${proposed.time}`;
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
    if (status === 'confirmed') return '주문 확정';
    if (status === 'reviewing') return '검토 중';
    if (status === 'on_hold') return '보류';
    if (status === 'received') return '접수(최초)';
    if (status === 'cancelled') return '취소됨';
    return getStatusLabel(status);
}

function getActorForOrder(order) {
    const me = auth?.name || currentUser.name;
    if (order?.consumerName === me) return 'consumer';
    if (order?.supplierName === me) return 'supplier';
    return currentUser.type === 'supplier' ? 'supplier' : 'consumer';
}

// 주문 수량 계산 (트레일러 대수 * 용량)
function getOrderQuantity(order) {
    return (order.tubeTrailers || 0) * TRAILER_CAPACITY_KG;
}

// ========== AI 운송계획 ==========
function calculateTransportPlan() {
    const activeStatuses = ['received', 'reviewing', 'confirmed'];
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

    const getTravelTime = getTravelTimeFromAddress;

    const trailersNeeded = totalTrailers;
    const trailersToUse = Math.min(trailersNeeded, trailers);
    const totalTrips = destinations.length;
    const totalDriveTime = destinations.reduce((sum, d) => sum + getTravelTime(d.address) * 2, 0);
    const hoursPerTrip = 2.5;
    const maxTripsPerDriver = Math.floor(8 / hoursPerTrip);
    const driversNeeded = Math.ceil(totalTrips / maxTripsPerDriver);
    const driversToUse = Math.min(driversNeeded, drivers);

    const schedule = [];
    let currentTime = 8;
    destinations.forEach((dest, i) => {
        const driverNum = (i % driversToUse) + 1;
        schedule.push({
            time: `${Math.floor(currentTime)}:${((currentTime % 1) * 60).toString().padStart(2, '0')}`,
            route: `생산지 → ${dest.address.substring(0, 20)}...`,
            quantity: dest.tubeTrailers + '대 (' + dest.quantity + ' kg)',
            trailer: `트레일러 ${Math.min(dest.tubeTrailers, trailersToUse)}대`,
            driver: `기사 ${driverNum}`,
            duration: getTravelTime(dest.address)
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
    document.getElementById(viewId + 'View').classList.add('active');
}

// 주문 상태: 접수(최초), 검토 중, 주문 확정, 보류, 변경 요청, 취소 요청(삭제 요청), 취소됨
const ORDER_STATUSES = [
    { value: 'received', label: '접수(최초)' },
    { value: 'reviewing', label: '검토 중' },
    { value: 'confirmed', label: '주문 확정' },
    { value: 'on_hold', label: '보류' },
    { value: 'change_requested', label: '변경 요청' },
    { value: 'cancel_requested', label: '취소 요청' },
    { value: 'cancelled', label: '취소됨' }
];

function getStatusLabel(status) {
    const s = ORDER_STATUSES.find(o => o.value === status);
    if (s) return s.label;
    // 레거시 매핑
    const legacy = { pending: '검토 중', confirmed: '주문 확정', change_requested_consumer: '변경 요청', change_requested_supplier: '변경 요청' };
    return legacy[status] || status;
}

function normalizeStatus(status) {
    if (status === 'pending') return 'reviewing';
    if (status === 'change_requested_consumer' || status === 'change_requested_supplier') return 'change_requested';
    if (status === 'cancel_requested_consumer' || status === 'cancel_requested_supplier') return 'cancel_requested';
    if (ORDER_STATUSES.some(o => o.value === status)) return status;
    return 'received';
}

function renderConsumerView() {
    const list = document.getElementById('consumerOrdersList');
    const myOrders = getConsumerOrders(currentUser.name);

    if (myOrders.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>등록된 주문이 없습니다.</p><p>위 폼에서 새 주문을 등록하세요.</p></div>';
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
        const canRequestChange = !hasPendingChange && !hasPendingCancel && ['reviewing', 'confirmed', 'received'].includes(status);
        const canRequestCancel = !hasPendingCancel && !hasPendingChange && !hasRejectedCancel && ['reviewing', 'confirmed', 'received', 'cancel_requested', 'change_requested'].includes(status);

        // 상대방(공급자)이 요청한 변경/취소는 수요모드에서 확정/거절 가능
        const canApproveChange = hasPendingChange && cr.requestedBy === 'supplier';
        const canApproveCancel = hasPendingCancel && cancelReq.requestedBy === 'supplier';

        const changeBadge = getChangeBadgeText(order);
        const cancelBadge = getCancelBadgeText(order);

        return `
        <div class="order-item ${(hasPendingChange || hasRejectedChange || hasPendingCancel || hasRejectedCancel) ? 'has-change-request' : ''}">
            <div class="order-id">${order.id}</div>
            <div class="order-detail">${formatOrderDateTime(order)} · 트레일러 ${order.tubeTrailers}대</div>
            <div class="order-detail">공급자: ${order.supplierName || '-'}</div>
            <div class="order-detail">${order.address}</div>
            <span class="order-status ${status}">${getStatusLabel(order.status)}</span>
            ${changeBadge ? `<div class="change-summary">${changeBadge}</div>` : ''}
            ${cancelBadge ? `<div class="change-summary">${cancelBadge}</div>` : ''}
            <div class="order-actions">
                ${canRequestChange ? `<button type="button" class="btn btn-small" data-action="request-change" data-id="${order.id}">변경</button>` : ''}
                ${canRequestCancel ? `<button type="button" class="btn btn-small btn-secondary" data-action="request-cancel" data-id="${order.id}">취소</button>` : ''}
                ${canApproveChange ? `<button type="button" class="btn btn-small btn-primary" data-action="approve-change" data-id="${order.id}">변경 확정</button>
                <button type="button" class="btn btn-small btn-secondary" data-action="reject-change" data-id="${order.id}">변경 거절</button>` : ''}
                ${canApproveCancel ? `<button type="button" class="btn btn-small btn-primary" data-action="approve-cancel" data-id="${order.id}">취소 승인</button>
                <button type="button" class="btn btn-small btn-secondary" data-action="reject-cancel" data-id="${order.id}">취소 거절</button>` : ''}
            </div>
        </div>
    `}).join('');
}

function renderOrdersTable(tbodyId, showActions) {
    const allOrders = getAllOrders();
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const colspan = 9;
    tbody.innerHTML = allOrders.map(o => {
        const status = normalizeStatus(o.status);
        const hasPendingChange = o.changeRequest && o.changeRequest.status === 'pending';
        const hasPendingCancel = o.cancelRequest && o.cancelRequest.status === 'pending';

        const canApproveChange = showActions && hasPendingChange && o.changeRequest.requestedBy === 'consumer';
        const canApproveCancel = showActions && hasPendingCancel && o.cancelRequest.requestedBy === 'consumer';

        const canConfirm = showActions && !hasPendingChange && !hasPendingCancel && (status === 'received' || status === 'reviewing' || status === 'on_hold');
        const canProposeChange = showActions && !hasPendingChange && !hasPendingCancel && (status === 'received' || status === 'reviewing' || status === 'confirmed' || status === 'on_hold');
        const canRequestCancel = showActions && !hasPendingCancel && (status !== 'cancelled');

        const travelTime = getTravelTimeFromAddress(o.address);
        const changeBadge = getChangeBadgeText(o);
        const cancelBadge = getCancelBadgeText(o);

        const supplierStatus = getSupplierStatusLabel(o);

        return `
        <tr class="order-row ${(hasPendingChange || hasPendingCancel) ? 'row-change-request' : ''}" data-order-id="${o.id}" title="클릭하여 지도 보기">
            <td>${o.id}</td>
            <td>${o.consumerName}</td>
            <td>${formatOrderDate(o)}</td>
            <td>${o.time}</td>
            <td>${o.tubeTrailers}대</td>
            <td>${o.address}</td>
            <td><span class="travel-time">${travelTime}분</span></td>
            <td>
                <span class="order-status ${status}">${supplierStatus}</span>
                ${changeBadge ? `<div class="change-summary">${changeBadge}</div>` : ''}
                ${cancelBadge ? `<div class="change-summary">${cancelBadge}</div>` : ''}
            </td>
            <td class="table-actions">
                ${canConfirm ? `<button type="button" class="btn btn-tiny btn-primary" data-action="confirm-order" data-id="${o.id}">주문 확정</button>` : ''}
                ${canProposeChange ? `<button type="button" class="btn btn-tiny" data-action="request-change" data-id="${o.id}">변경</button>` : ''}
                ${canRequestCancel ? `<button type="button" class="btn btn-tiny btn-secondary" data-action="request-cancel" data-id="${o.id}">취소</button>` : ''}
                ${canApproveChange ? `<button type="button" class="btn btn-tiny btn-primary" data-action="approve-change" data-id="${o.id}">변경 확정</button>
                <button type="button" class="btn btn-tiny btn-secondary" data-action="reject-change" data-id="${o.id}">변경 거절</button>` : ''}
                ${canApproveCancel ? `<button type="button" class="btn btn-tiny btn-primary" data-action="approve-cancel" data-id="${o.id}">취소 승인</button>
                <button type="button" class="btn btn-tiny btn-secondary" data-action="reject-cancel" data-id="${o.id}">취소 거절</button>` : ''}
            </td>
        </tr>
    `}).join('') || `<tr><td colspan="${colspan}" class="empty-state">주문이 없습니다.</td></tr>`;

    // 주문 행 클릭 → 지도 모달
    tbody.querySelectorAll('.order-row[data-order-id]').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            const orderId = row.dataset.orderId;
            openOrderMapModal(orderId);
        });
    });
}

function renderSupplierView() {
    const allOrders = getAllOrders();
    const totalTrailers = allOrders.reduce((s, o) => s + (o.tubeTrailers || 0), 0);

    document.getElementById('totalOrders').textContent = allOrders.length;
    const totalEl = document.getElementById('totalTrailers');
    if (totalEl) totalEl.textContent = totalTrailers + '대';

    if (allOrders.length > 0) {
        const dates = allOrders.map(o => formatOrderDate(o));
        const uniqueDates = [...new Set(dates)];
        document.getElementById('deliveryRange').textContent = uniqueDates.length === 1 ? uniqueDates[0] : `${uniqueDates[0]} ~ ${uniqueDates[uniqueDates.length - 1]}`;
    } else {
        document.getElementById('deliveryRange').textContent = '-';
    }

    renderOrdersTable('supplierOrdersTable', true);

    const totalQty = allOrders.reduce((s, o) => s + getOrderQuantity(o), 0);
    const planEl = document.getElementById('productionPlanSummary');
    if (planEl) {
        planEl.innerHTML = `
            <div class="plan-item"><span>총 트레일러 필요</span><strong>${totalTrailers}대</strong></div>
            <div class="plan-item"><span>예상 수소량 (400kg/대)</span><strong>${totalQty.toLocaleString()} kg</strong></div>
            <div class="plan-item"><span>주문 수요처 수</span><strong>${new Set(allOrders.map(o => o.address)).size}곳</strong></div>
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
    const travelTime = getTravelTimeFromAddress(order.address);

    document.getElementById('orderMapTitle').textContent = `주문 ${order.id} - 튜브트레일러 배송 경로`;
    document.getElementById('orderMapInfo').innerHTML = `
        <div class="map-info-row"><strong>수요처:</strong> ${order.consumerName}</div>
        <div class="map-info-row"><strong>납품지:</strong> ${order.address}</div>
        <div class="map-info-row"><strong>트레일러:</strong> ${order.tubeTrailers}대</div>
        <div class="map-info-row"><strong>생산지→수요처 운송시간:</strong> 약 ${travelTime}분</div>
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
            <p><strong>현재:</strong> ${order.year}/${order.month}/${order.day} ${order.time}, 트레일러 ${order.tubeTrailers}대</p>
            <p><strong>변경 후:</strong> ${cr.proposed.year}/${cr.proposed.month}/${cr.proposed.day} ${cr.proposed.time}, 트레일러 ${cr.proposed.tubeTrailers}대</p>
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
        order.status = 'confirmed';
    } else {
        order.lastChange = { result: 'rejected', summary, decidedAt, decidedBy, requestedBy };
        order.changeRequest.status = 'rejected';
        order.changeRequest.decidedAt = decidedAt;
        order.changeRequest.decidedBy = decidedBy;
        order.status = order.changeRequest.originalStatus || 'reviewing';
    }

    localStorage.setItem('h2go_orders', JSON.stringify(orders));
    pendingApprovalOrderId = null;
    document.getElementById('changeApprovalModal').classList.remove('active');
    renderConsumerView();
    renderSupplierView();
}

// ========== 이벤트 ==========
function initTimeInputs() {
    const hourEl = document.getElementById('orderHour');
    if (hourEl && !hourEl.value) {
        hourEl.value = new Date().getHours();
    }
}

function initFormDefaults() {
    const today = getTodayParts();
    const yearEl = document.getElementById('orderYear');
    const monthEl = document.getElementById('orderMonth');
    const dayEl = document.getElementById('orderDay');
    if (yearEl) yearEl.value = today.year;
    if (monthEl) monthEl.value = today.month;
    if (dayEl) dayEl.value = today.day;
}

// ========== 공급자 선택(수요모드) ==========
function setSupplierName(name) {
    selectedSupplierName = String(name || "").trim();
    const input = document.getElementById("orderSupplierName");
    if (input) input.value = selectedSupplierName || "";
}

function openSupplierSelectModal() {
    const modal = document.getElementById("supplierSelectModal");
    const listEl = document.getElementById("supplierList");
    const manualEl = document.getElementById("supplierManualInput");
    if (!modal || !listEl) return;

    const candidates = getSupplierCandidates(currentUser.name);
    listEl.innerHTML = candidates.map(n => `
        <button type="button" data-supplier="${String(n).replace(/"/g, "&quot;")}">${n}</button>
    `).join("");

    listEl.querySelectorAll("button[data-supplier]").forEach(btn => {
        btn.addEventListener("click", () => {
            setSupplierName(btn.dataset.supplier);
            modal.classList.remove("active");
        });
    });

    if (manualEl) manualEl.value = "";
    modal.classList.add("active");
}

document.getElementById("changeSupplierBtn")?.addEventListener("click", openSupplierSelectModal);
document.getElementById("supplierManualApplyBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("supplierSelectModal");
    const manualEl = document.getElementById("supplierManualInput");
    const v = String(manualEl?.value || "").trim();
    if (!v) {
        alert("공급자명을 입력해 주세요.");
        return;
    }
    setSupplierName(v);
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

document.getElementById('orderForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const supplierName = String(selectedSupplierName || auth?.name || currentUser.name).trim();
    const order = {
        id: generateOrderId(),
        consumerName: currentUser.name,
        supplierName,
        year: parseInt(document.getElementById('orderYear').value),
        month: parseInt(document.getElementById('orderMonth').value),
        day: parseInt(document.getElementById('orderDay').value),
        time: `${String(document.getElementById('orderHour').value).padStart(2, '0')}:${document.getElementById('orderMinute').value}`,
        tubeTrailers: parseInt(document.getElementById('orderTrailers').value),
        address: document.getElementById('orderAddress').value,
        note: document.getElementById('orderNote').value,
        status: 'received',
        createdAt: new Date().toISOString()
    };
    orders.push(order);
    localStorage.setItem('h2go_orders', JSON.stringify(orders));
    document.getElementById('orderForm').reset();
    initFormDefaults();
    initTimeInputs();
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
        time: `${String(document.getElementById('changeHour').value).padStart(2, '0')}:${document.getElementById('changeMinute').value}`,
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

document.getElementById('approveChangeBtn').addEventListener('click', () => {
    if (pendingApprovalOrderId) applyChange(pendingApprovalOrderId, true);
    alert('변경이 확정되었습니다. 주문 상태가 "주문 확정"으로 변경됩니다.');
});

document.getElementById('rejectChangeBtn').addEventListener('click', () => {
    if (pendingApprovalOrderId) applyChange(pendingApprovalOrderId, false);
    alert('변경 요청이 거절되었습니다. 주문 상태가 원래 상태로 되돌아갑니다.');
});

document.getElementById('changeRequestModal').addEventListener('click', (e) => {
    if (e.target.id === 'changeRequestModal') e.target.classList.remove('active');
});
document.getElementById('orderMapModal').addEventListener('click', (e) => {
    if (e.target.id === 'orderMapModal') closeOrderMapModal();
});
document.querySelector('#orderMapModal .modal-close')?.addEventListener('click', closeOrderMapModal);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('orderMapModal').classList.contains('active')) {
        closeOrderMapModal();
    }
});
document.querySelector('#changeRequestModal .modal-close').addEventListener('click', () => {
    document.getElementById('changeRequestModal').classList.remove('active');
});
document.getElementById('changeApprovalModal').addEventListener('click', (e) => {
    if (e.target.id === 'changeApprovalModal') e.target.classList.remove('active');
});
document.querySelector('#changeApprovalModal .modal-close').addEventListener('click', () => {
    document.getElementById('changeApprovalModal').classList.remove('active');
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
            orders = orders.filter(x => x && x.id !== o.id);
        } else {
            o.cancelRequest.status = 'rejected';
            o.cancelRequest.decidedAt = decidedAt;
            o.cancelRequest.decidedBy = decidedBy;
            o.lastCancel = { result: 'rejected', decidedAt, decidedBy, reason: o.cancelRequest.reason || "" };
            o.status = o.cancelRequest.originalStatus || 'reviewing';
        }
    }

    if (action === 'request-change') {
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
    } else if (action === 'confirm-order') {
        if (!order) return;
        const actor = getActorForOrder(order);
        if (actor !== 'supplier') return;
        if (order.changeRequest?.status === 'pending' || order.cancelRequest?.status === 'pending') return;
        order.status = 'confirmed';
        order.confirmedAt = new Date().toISOString();
        persistAndRerender();
        alert('주문이 "주문 확정" 상태로 변경되었습니다.');
    } else if (action === 'request-cancel') {
        if (!order) return;
        const actor = getActorForOrder(order);
        if (order.cancelRequest?.status === 'pending') return;
        if (!confirm('이 주문에 대해 취소(삭제) 요청을 보내시겠습니까? 상대방 승인 후 삭제됩니다.')) return;
        requestCancel(order, actor);
        persistAndRerender();
        alert('취소 요청을 보냈습니다. 상대방 승인을 기다립니다.');
    } else if (action === 'approve-cancel') {
        if (!order || !order.cancelRequest || order.cancelRequest.status !== 'pending') return;
        if (!confirm('취소(삭제) 요청을 승인하시겠습니까? 승인하면 주문이 삭제됩니다.')) return;
        decideCancel(order, true);
        persistAndRerender();
        alert('취소 요청을 승인했습니다. 주문이 삭제되었습니다.');
    } else if (action === 'reject-cancel') {
        if (!order || !order.cancelRequest || order.cancelRequest.status !== 'pending') return;
        const reason = window.prompt("취소 요청 거절 사유를 입력해 주세요.", "");
        if (reason === null) return;
        order.cancelRequest.reason = String(reason || "").trim();
        decideCancel(order, false);
        persistAndRerender();
        alert('취소 요청을 거절했습니다. 사유가 요청자에게 전달됩니다.');
    }
});

document.getElementById('recalculateBtn')?.addEventListener('click', () => renderSupplierView());

// 초기화
const initialRole = (currentUser.type === 'supplier' || currentUser.type === 'consumer') ? currentUser.type : 'consumer';
const bizEl = document.getElementById('bizName');
if (bizEl) bizEl.textContent = currentUser.name;
const roleSelectEl = document.getElementById('roleSelect');
roleSelectEl.value = initialRole;
roleSelectEl.disabled = false;
roleSelectEl.title = "수요/공급 모드를 전환할 수 있습니다.";

initFormDefaults();
initTimeInputs();
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

