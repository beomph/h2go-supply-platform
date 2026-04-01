// H2GO 대시보드 - 수소거래 플랫폼

// ========== 로그인 상태 확인 ==========
const AUTH_KEY = "h2go_auth";

function normalizeMemberAuthorityDash(raw) {
    const s = String(raw || "").trim();
    if (s === "admin" || s === "manager" || s === "monitoring") return s;
    if (s === "user") return "manager";
    return "manager";
}

function normalizeBusinessPartyDash(raw) {
    const s = String(raw || "").trim();
    if (s === "supplier" || s === "transporter" || s === "consumer") return s;
    return "consumer";
}

function parseBusinessPartiesDash(raw, legacySingle) {
    if (Array.isArray(raw) && raw.length) {
        return [...new Set(raw.map(normalizeBusinessPartyDash))];
    }
    if (raw != null && raw !== "") {
        const s = String(raw).trim();
        if (s.startsWith("[")) {
            try {
                return parseBusinessPartiesDash(JSON.parse(s), legacySingle);
            } catch (_) {}
        }
    }
    if (legacySingle != null && legacySingle !== "") return [normalizeBusinessPartyDash(legacySingle)];
    return ["consumer"];
}

function rolesFromBusinessPartiesDash(parties, preferredActive) {
    const set = new Set(parties.map(normalizeBusinessPartyDash));
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
const THEME_KEY = "h2go_theme";
const ORDER_ADDRESS_HISTORY_PREFIX = "h2go_order_address_history_v1";
const DEFAULT_SUPABASE_URL = "https://zbihunanzjgyceqfegka.supabase.co";
const SUPABASE_ANON_KEY_STORAGE = "h2go_supabase_anon_key";
const ORDERS_STORAGE_KEY = "h2go_orders";

function getSupabaseUrl() {
    const fromWindow = String(window.H2GO_SUPABASE_URL || "").trim();
    if (fromWindow) return fromWindow;
    return DEFAULT_SUPABASE_URL;
}

function safeJsonParse(raw, fallback) {
    try {
        return JSON.parse(raw);
    } catch (_) {
        return fallback;
    }
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

/** Supabase: 승인된 프로필 중 사업자분류에 공급자(supplier)가 포함된 계정의 표시명 */
async function fetchApprovedSupplierDirectoryUsernames() {
    if (!supabaseClient || !isSupabaseOrdersEnabled) return [];
    const { data, error } = await supabaseClient.rpc("list_approved_supplier_directory");
    if (error) {
        console.warn("[h2go] list_approved_supplier_directory:", error.message || error);
        return [];
    }
    if (!Array.isArray(data)) return [];
    return uniqueNames(
        data.map((row) => (row && typeof row.username === "string" ? row.username.trim() : "")),
    );
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
    const businessParties = parseBusinessPartiesDash(a.businessParties, a.businessParty);
    const { roles, activeRole } = rolesFromBusinessPartiesDash(businessParties, a.activeRole);
    if (!id || !name) return null;
    return {
        id,
        name,
        roles,
        activeRole,
        authority: normalizeMemberAuthorityDash(a.authority),
        businessParties,
        businessParty: businessParties[0] || "consumer",
        supabaseUserId: a.supabaseUserId || null,
        loggedInAt: a.loggedInAt || null,
    };
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
    return PRODUCTION_SITE.address;
}

/** 주문 카드·집계용: DB `supplier_address` 우선, 없으면 등록/기본 출하 주소 */
function getOrderSupplierAddressDisplay(order) {
    if (!order) return "";
    const fromRow = String(order.supplierAddress || "").trim();
    if (fromRow) return fromRow;
    return getSupplierShippingAddress(order.supplierName);
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

/** 출하도 주문에 수요자가 입력한 T/T·기사 (있으면 공급자 운송 시작 시 안내용) */
function formatTransportInfoLine(info, prefix) {
    if (!info || typeof info !== "object") return "";
    const tt = Array.isArray(info.trailerNumbers) ? info.trailerNumbers.join(", ") : "";
    const drv = String(info.driverName || "").trim();
    if (!tt && !drv) return "";
    const p = prefix ? `${prefix} ` : "";
    return `${p}T/T: ${tt || "—"} · 기사: ${drv || "—"}`;
}

function getConsumerDeclaredTransport(order) {
    if (!order || order.supplyCondition !== "ex_factory") return null;
    const ct = order.consumerTransport;
    if (!ct || typeof ct !== "object") return null;
    const trailerNumbers = Array.isArray(ct.trailerNumbers)
        ? ct.trailerNumbers.map((x) => String(x || "").trim()).filter(Boolean)
        : [];
    const driverName = String(ct.driverName || "").trim();
    if (!trailerNumbers.length && !driverName) return null;
    return { trailerNumbers, driverName };
}

function hasInboundTransportInfo(order) {
    const ti = order?.transportInfo;
    if (!ti || typeof ti !== "object") return false;
    const tt = Array.isArray(ti.trailerNumbers)
        ? ti.trailerNumbers.map((x) => String(x || "").trim()).filter(Boolean)
        : [];
    return tt.length > 0 || String(ti.driverName || "").trim().length > 0;
}

/** 카드·배너: 운송 시작/공차 출발 후 transportInfo 우선, 없으면 출하도 사전 수요자 입력 */
function getOrderCardTransportDisplay(order) {
    if (hasInboundTransportInfo(order)) {
        const ti = order.transportInfo;
        const ttLine = (Array.isArray(ti.trailerNumbers) ? ti.trailerNumbers : [])
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .join(", ") || "—";
        const driverLine = String(ti.driverName || "").trim() || "—";
        return { ttLine, driverLine };
    }
    const cd = getConsumerDeclaredTransport(order);
    if (cd) {
        return {
            ttLine: cd.trailerNumbers.join(", ") || "—",
            driverLine: cd.driverName || "—",
        };
    }
    return { ttLine: "—", driverLine: "—" };
}

// 주문별 운송시간(분): 납품지 주소 기준 편도(출하도·도착도 공통, 예상 소요 표시용)
function getOrderTravelTimeMinutes(order) {
    if (!order) return 0;
    return getShipmentLegTravelMinutes(order);
}

/** 출하·회차 일정용 이동시간(분): 도착도·출하도 모두 납품지까지 이동시간으로 간주 */
function getShipmentLegTravelMinutes(order) {
    if (!order) return 0;
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
    return safeJsonParse(localStorage.getItem(ORDERS_STORAGE_KEY) || '[]', []);
}

let orders = readOrdersFromStorage();
if (pruneOrdersChangeHistoryInPlace()) {
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
    queueOrdersSyncToSupabase();
}
let currentUser = { type: 'consumer', name: '수요자 A' };
let pendingApprovalOrderId = null;
let pendingCancelApprovalOrderId = null;
let selectedSupplierName = null;
let lastOrdersSnapshot = deepClone(orders);
let supabaseClient = null;
let isSupabaseOrdersEnabled = false;
let syncOrdersTimer = null;
let h2goOrdersRealtimeChannel = null;
/** Supabase 주문 로드 실패 시 사용자 안내(배너) */
let ordersRemoteLoadError = null;
let reloadOrdersFromRemoteTimer = null;
const dashboardStatFilters = {
    consumer: 'all',
    supplier: 'all',
};

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
    return window.supabase.createClient(getSupabaseUrl(), anonKey);
}

function toIsoDateTimeFromOrder(order) {
    const key = getOrderDateTimeSortKey(order);
    const t = new Date(String(key || "").replace(" ", "T"));
    if (!Number.isFinite(t.getTime())) return null;
    return t.toISOString();
}

function serializeOrderForSupabase(order) {
    if (!order?.id) return null;
    const changeHistory = Array.isArray(order.changeHistory) ? order.changeHistory : [];
    const transportInfo = order.transportInfo && typeof order.transportInfo === "object" ? order.transportInfo : {};
    const outboundInfo = order.outboundInfo && typeof order.outboundInfo === "object" ? order.outboundInfo : {};
    const deliveryConfirmation = order.deliveryConfirmation && typeof order.deliveryConfirmation === "object"
        ? order.deliveryConfirmation
        : {};
    const supplierAddress = getSupplierShippingAddress(order.supplierName);
    return {
        id: String(order.id),
        consumer_name: String(order.consumerName || ""),
        consumer_address: String(order.address || ""),
        supplier_name: String(order.supplierName || ""),
        supplier_address: String(supplierAddress || ""),
        order_requested_at: order.createdAt || new Date().toISOString(),
        order_accepted_at: order.acceptedAt || null,
        delivery_due_at: toIsoDateTimeFromOrder(order),
        supply_condition: order.supplyCondition === "ex_factory" ? "ex_factory" : "delivery",
        order_status: normalizeStatus(order.status),
        consumer_note: String(order.note || ""),
        tube_trailers: Number(order.tubeTrailers || 1),
        inbound_tt_numbers: Array.isArray(transportInfo.trailerNumbers) ? transportInfo.trailerNumbers : [],
        inbound_driver_name: String(transportInfo.driverName || ""),
        inbound_started_at: order.transportStartedAt || null,
        outbound_tt_numbers: Array.isArray(outboundInfo.trailerNumbers) ? outboundInfo.trailerNumbers : [],
        outbound_driver_name: String(outboundInfo.driverName || ""),
        outbound_at: outboundInfo.outboundAt || null,
        outbound_quantity_kg: outboundInfo.quantityKg ?? null,
        supplier_signer_name: String(deliveryConfirmation.supplierSignerName || ""),
        consumer_signer_name: String(deliveryConfirmation.consumerSignerName || ""),
        change_history: changeHistory,
        transport_info: transportInfo,
        change_request: order.changeRequest || null,
        cancel_request: order.cancelRequest || null,
        last_change: order.lastChange || null,
        last_cancel: order.lastCancel || null,
        extra_payload: {
            year: order.year,
            month: order.month,
            day: order.day,
            time: order.time,
            acceptedAt: order.acceptedAt || null,
            arrivedAt: order.arrivedAt || null,
            collectingAt: order.collectingAt || null,
            completedAt: order.completedAt || null,
            cancelledAt: order.cancelledAt || null,
            returnAt: order.returnAt || null,
            emptyLegStartedAt: order.emptyLegStartedAt || null,
            emptyArrivedAt: order.emptyArrivedAt || null,
            exFactoryChargeCompletedAt: order.exFactoryChargeCompletedAt || null,
            outboundStartedAt: order.outboundStartedAt || null,
            outboundInfo,
            deliveryConfirmation,
            consumerTransport:
                order.consumerTransport && typeof order.consumerTransport === "object" ? order.consumerTransport : null,
            emptyLegReturnInfo:
                order.emptyLegReturnInfo && typeof order.emptyLegReturnInfo === "object" ? order.emptyLegReturnInfo : null,
            qtySettlement: order.qtySettlement && typeof order.qtySettlement === "object" ? order.qtySettlement : null,
            trailerVolumeM3Default: order.trailerVolumeM3Default ?? null,
            exFactoryConsumerSettlementMode:
                order.exFactoryConsumerSettlementMode === "flow" ? "flow" : "pressure",
            exFactoryConsumerFlowDone: Boolean(order.qtySettlement?.exFactoryConsumerFlowDone),
        },
    };
}

function deserializeSupabaseOrder(row) {
    const payload = (row.extra_payload && typeof row.extra_payload === "object") ? row.extra_payload : {};
    const transportInfo = (row.transport_info && typeof row.transport_info === "object") ? row.transport_info : {};
    const fallbackTime = String(payload.time || "00:00");
    const out = {
        id: String(row.id),
        consumerName: String(row.consumer_name || ""),
        supplierName: String(row.supplier_name || ""),
        address: String(row.consumer_address || ""),
        supplierAddress: String(row.supplier_address || ""),
        year: Number(payload.year || new Date(row.order_requested_at || Date.now()).getFullYear()),
        month: Number(payload.month || (new Date(row.delivery_due_at || Date.now()).getMonth() + 1)),
        day: Number(payload.day || new Date(row.delivery_due_at || Date.now()).getDate()),
        time: fallbackTime,
        tubeTrailers: Number(row.tube_trailers || 1),
        supplyCondition: row.supply_condition === "ex_factory" ? "ex_factory" : "delivery",
        note: String(row.consumer_note || ""),
        status: normalizeStatus(row.order_status),
        createdAt: row.order_requested_at || null,
        acceptedAt: row.order_accepted_at || payload.acceptedAt || null,
        arrivedAt: payload.arrivedAt || null,
        collectingAt: payload.collectingAt || null,
        completedAt: payload.completedAt || null,
        cancelledAt: payload.cancelledAt || null,
        returnAt: payload.returnAt || null,
        emptyLegStartedAt: payload.emptyLegStartedAt || null,
        emptyArrivedAt: payload.emptyArrivedAt || null,
        exFactoryChargeCompletedAt: payload.exFactoryChargeCompletedAt || null,
        outboundStartedAt: payload.outboundStartedAt || null,
        changeRequest: row.change_request || null,
        cancelRequest: row.cancel_request || null,
        lastChange: row.last_change || null,
        lastCancel: row.last_cancel || null,
        transportInfo,
        transportStartedAt: row.inbound_started_at || null,
        changeHistory: Array.isArray(row.change_history) ? row.change_history : [],
        outboundInfo: (payload.outboundInfo && typeof payload.outboundInfo === "object") ? payload.outboundInfo : null,
        deliveryConfirmation: (payload.deliveryConfirmation && typeof payload.deliveryConfirmation === "object") ? payload.deliveryConfirmation : null,
        consumerTransport: (payload.consumerTransport && typeof payload.consumerTransport === "object") ? payload.consumerTransport : null,
        emptyLegReturnInfo: (payload.emptyLegReturnInfo && typeof payload.emptyLegReturnInfo === "object") ? payload.emptyLegReturnInfo : null,
        qtySettlement: (payload.qtySettlement && typeof payload.qtySettlement === "object") ? payload.qtySettlement : null,
        trailerVolumeM3Default: payload.trailerVolumeM3Default != null ? Number(payload.trailerVolumeM3Default) : null,
        exFactoryConsumerSettlementMode: payload.exFactoryConsumerSettlementMode === "flow" ? "flow" : "pressure",
    };
    if (payload.exFactoryConsumerFlowDone && out.qtySettlement && typeof out.qtySettlement === "object") {
        out.qtySettlement.exFactoryConsumerFlowDone = true;
    }
    return out;
}

/** 로컬 자정 기준: 오늘 00:00보다 7일 이전 00:00 이전에 찍힌 이력은 알림에서 제외·저장 시 정리 */
function getOrderNotifHistoryRetentionCutoffMs() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    return start.getTime() - 7 * 24 * 60 * 60 * 1000;
}

function pruneOrdersChangeHistoryInPlace() {
    const cutoff = getOrderNotifHistoryRetentionCutoffMs();
    let changed = false;
    for (const o of orders) {
        if (!o || !Array.isArray(o.changeHistory) || !o.changeHistory.length) continue;
        const next = o.changeHistory.filter((h) => {
            const t = new Date(h.at).getTime();
            return Number.isFinite(t) && t >= cutoff;
        });
        if (next.length !== o.changeHistory.length) {
            o.changeHistory = next;
            changed = true;
        }
    }
    return changed;
}

function saveOrdersToStorage() {
    pruneOrdersChangeHistoryInPlace();
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
    queueOrdersSyncToSupabase();
}

async function syncOrdersToSupabase() {
    if (!isSupabaseOrdersEnabled || !supabaseClient) return;
    const rows = orders.map(serializeOrderForSupabase).filter(Boolean);
    if (!rows.length) return;
    const authUserId = getAuth()?.supabaseUserId || null;
    const payload = rows.map((r) => ({ ...r, updated_by: authUserId || r.updated_by || null, created_by: r.created_by || authUserId || null }));
    const { error } = await supabaseClient.from("h2go_orders").upsert(payload, { onConflict: "id" });
    if (error) {
        console.error("[h2go] supabase order sync failed:", error.message || error);
    }
}

function queueOrdersSyncToSupabase() {
    if (!isSupabaseOrdersEnabled) return;
    if (syncOrdersTimer) clearTimeout(syncOrdersTimer);
    syncOrdersTimer = setTimeout(() => {
        syncOrdersToSupabase().catch((err) => console.error("[h2go] sync error:", err));
    }, 200);
}

function sortOrdersByRequestTime(list) {
    const arr = Array.isArray(list) ? [...list] : [];
    arr.sort((a, b) => {
        const ka = getOrderDateTimeSortKey(a) || "";
        const kb = getOrderDateTimeSortKey(b) || "";
        return ka.localeCompare(kb);
    });
    return arr;
}

function renderOrdersRemoteLoadBanner() {
    const host = document.getElementById("ordersRemoteLoadBanner");
    if (!host) return;
    if (!ordersRemoteLoadError) {
        host.hidden = true;
        host.innerHTML = "";
        return;
    }
    host.hidden = false;
    const msg = escapeBannerHtml(String(ordersRemoteLoadError));
    host.innerHTML = `<div class="orders-remote-load-banner__inner" role="status">
        <span class="orders-remote-load-banner__text">최신 주문을 불러오지 못했습니다. ${msg}</span>
        <button type="button" class="btn btn-tiny btn-secondary orders-remote-load-banner__dismiss" id="ordersRemoteLoadBannerDismiss">닫기</button>
    </div>`;
    document.getElementById("ordersRemoteLoadBannerDismiss")?.addEventListener(
        "click",
        () => {
            ordersRemoteLoadError = null;
            renderOrdersRemoteLoadBanner();
        },
        { once: true }
    );
}

async function loadOrdersFromSupabase() {
    if (!supabaseClient) return;
    const localBefore = deepClone(orders);
    const { data, error } = await supabaseClient
        .from("h2go_orders")
        .select("*")
        .order("order_requested_at", { ascending: true });
    if (error) {
        const msg = error.message || String(error);
        console.warn("[h2go] failed to load orders from supabase:", msg);
        ordersRemoteLoadError = msg;
        renderOrdersRemoteLoadBanner();
        return;
    }
    ordersRemoteLoadError = null;
    renderOrdersRemoteLoadBanner();
    if (!Array.isArray(data)) return;
    const fromDb = data.map(deserializeSupabaseOrder);
    const dbIds = new Set(fromDb.map((o) => String(o.id || "")));
    const merged = [...fromDb];
    /* 동기화 대기 중 로컬 전용 행은 유지(오프라인·upsert 지연) */
    for (const o of localBefore) {
        if (o && o.id && !dbIds.has(String(o.id))) merged.push(o);
    }
    orders = sortOrdersByRequestTime(merged);
    saveOrdersToStorage();
    lastOrdersSnapshot = deepClone(orders);
}

function teardownOrdersRealtime() {
    if (h2goOrdersRealtimeChannel && supabaseClient) {
        try {
            supabaseClient.removeChannel(h2goOrdersRealtimeChannel);
        } catch (_) {}
        h2goOrdersRealtimeChannel = null;
    }
}

function scheduleReloadOrdersFromRemote() {
    if (!isSupabaseOrdersEnabled || !supabaseClient) return;
    if (reloadOrdersFromRemoteTimer) clearTimeout(reloadOrdersFromRemoteTimer);
    reloadOrdersFromRemoteTimer = setTimeout(async () => {
        reloadOrdersFromRemoteTimer = null;
        const prev = deepClone(orders);
        await loadOrdersFromSupabase();
        try {
            renderConsumerView();
            renderSupplierView();
            detectAndNotifyChangeDecisions(prev, orders);
        } catch (err) {
            console.warn("[h2go] render after remote reload:", err?.message || err);
        }
        lastOrdersSnapshot = deepClone(orders);
    }, 400);
}

function subscribeOrdersRealtime() {
    teardownOrdersRealtime();
    if (!supabaseClient || !isSupabaseOrdersEnabled) return;
    try {
        h2goOrdersRealtimeChannel = supabaseClient
            .channel("h2go_orders_dashboard")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "h2go_orders" },
                () => scheduleReloadOrdersFromRemote()
            )
            .subscribe((status) => {
                if (status === "CHANNEL_ERROR") {
                    console.warn("[h2go] Supabase Realtime: h2go_orders 채널 오류(프로젝트에서 Realtime 활성화 여부 확인)");
                }
            });
    } catch (err) {
        console.warn("[h2go] orders realtime subscribe failed:", err?.message || err);
    }
}

async function initializeSupabaseOrders() {
    supabaseClient = getSupabaseClient();
    if (!supabaseClient) return true;
    try {
        let { data } = await supabaseClient.auth.getSession();
        let session = data?.session;
        if (!session) {
            const refreshed = await supabaseClient.auth.refreshSession();
            session = refreshed.data?.session;
        }
        if (!session) return true;

        const uid = session.user.id;
        const { data: prof, error: profErr } = await supabaseClient
            .from("member_profiles")
            .select("approval_status")
            .eq("id", uid)
            .maybeSingle();
        if (profErr || !prof) {
            console.warn("[h2go] member_profiles lookup failed:", profErr?.message || profErr);
            await supabaseClient.auth.signOut();
            clearAuth();
            alert("회원 정보를 확인할 수 없습니다. 다시 로그인해 주세요.");
            redirectToLogin();
            return false;
        }
        const st = String(prof.approval_status ?? "approved").toLowerCase();
        if (st === "pending") {
            await supabaseClient.auth.signOut();
            clearAuth();
            alert("관리자 승인 대기 중입니다. 승인 완료 후 다시 로그인해 주세요.");
            redirectToLogin();
            return false;
        }
        if (st === "rejected") {
            await supabaseClient.auth.signOut();
            clearAuth();
            alert("가입 신청이 거절되었습니다. 관리자에게 문의해 주세요.");
            redirectToLogin();
            return false;
        }

        isSupabaseOrdersEnabled = true;
        await loadOrdersFromSupabase();
        subscribeOrdersRealtime();
        syncFleetNavVisibility();
        return true;
    } catch (err) {
        console.warn("[h2go] supabase orders initialization skipped:", err?.message || err);
        isSupabaseOrdersEnabled = false;
        teardownOrdersRealtime();
        syncFleetNavVisibility();
        return true;
    }
}

/** Supabase 연동 시 구매/판매 모드에 맞춰 운송 자원 페이지 링크 표시 (수요자·공급자 모두 등록 가능) */
function syncFleetNavVisibility() {
    const item = document.getElementById("fleetNavItem");
    if (!item) return;
    const allowed = auth?.roles || [];
    const role = currentUser?.type;
    const roleOk =
        (role === "supplier" && allowed.includes("supplier")) ||
        (role === "consumer" && allowed.includes("consumer"));
    const show = isSupabaseOrdersEnabled && roleOk;
    item.classList.toggle("is-hidden", !show);
}

function fillDatalistFromValues(datalistEl, values) {
    if (!datalistEl) return;
    datalistEl.innerHTML = "";
    const uniq = [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];
    uniq.sort((a, b) => a.localeCompare(b, "ko"));
    uniq.forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v;
        datalistEl.appendChild(opt);
    });
}

async function loadTransportAssetDatalists() {
    const ttList = document.getElementById("transportTrailerDatalist");
    const drvList = document.getElementById("transportDriverDatalist");
    if (!ttList || !drvList) return;
    if (!supabaseClient || !isSupabaseOrdersEnabled) {
        fillDatalistFromValues(ttList, []);
        fillDatalistFromValues(drvList, []);
        return;
    }
    try {
        const [ttRes, drvRes] = await Promise.all([
            supabaseClient.from("h2go_tube_trailers").select("vehicle_number").order("vehicle_number", { ascending: true }),
            supabaseClient.from("h2go_transport_drivers").select("driver_name").order("driver_name", { ascending: true }),
        ]);
        if (ttRes.error) console.warn("[h2go] T/T datalist:", ttRes.error.message || ttRes.error);
        if (drvRes.error) console.warn("[h2go] driver datalist:", drvRes.error.message || drvRes.error);
        const ttNums = (ttRes.data || []).map((r) => r?.vehicle_number);
        const drvNames = (drvRes.data || []).map((r) => r?.driver_name);
        fillDatalistFromValues(ttList, ttNums);
        fillDatalistFromValues(drvList, drvNames);
    } catch (err) {
        console.warn("[h2go] transport asset datalists failed:", err?.message || err);
        fillDatalistFromValues(ttList, []);
        fillDatalistFromValues(drvList, []);
    }
}

/** 구매 화면 — 출하도 주문용 T/T·기사 datalist */
async function loadConsumerTransportDatalists() {
    const ttList = document.getElementById("orderConsumerTtDatalist");
    const drvList = document.getElementById("orderConsumerDriverDatalist");
    if (!ttList || !drvList) return;
    if (!supabaseClient || !isSupabaseOrdersEnabled) {
        fillDatalistFromValues(ttList, []);
        fillDatalistFromValues(drvList, []);
        return;
    }
    try {
        const [ttRes, drvRes] = await Promise.all([
            supabaseClient.from("h2go_tube_trailers").select("vehicle_number").order("vehicle_number", { ascending: true }),
            supabaseClient.from("h2go_transport_drivers").select("driver_name").order("driver_name", { ascending: true }),
        ]);
        if (ttRes.error) console.warn("[h2go] consumer T/T datalist:", ttRes.error.message || ttRes.error);
        if (drvRes.error) console.warn("[h2go] consumer driver datalist:", drvRes.error.message || drvRes.error);
        fillDatalistFromValues(ttList, (ttRes.data || []).map((r) => r?.vehicle_number));
        fillDatalistFromValues(drvList, (drvRes.data || []).map((r) => r?.driver_name));
    } catch (err) {
        console.warn("[h2go] consumer transport datalists failed:", err?.message || err);
        fillDatalistFromValues(ttList, []);
        fillDatalistFromValues(drvList, []);
    }
}

let transportAssetPickState = { kind: null, targetInputId: null, rows: [] };

function closeTransportAssetPickModal() {
    document.getElementById("transportAssetPickModal")?.classList.remove("active");
    transportAssetPickState = { kind: null, targetInputId: null, rows: [] };
}

function appendToCommaSeparatedField(inputEl, value) {
    if (!inputEl || !value) return;
    const v = String(value).trim();
    if (!v) return;
    const cur = String(inputEl.value || "").trim();
    if (!cur) inputEl.value = v;
    else if (cur.split(/[,，\s]+/).map((s) => s.trim().toLowerCase()).includes(v.toLowerCase())) return;
    else inputEl.value = `${cur}, ${v}`;
}

async function openTransportAssetPickModal(kind, targetInputId) {
    const modal = document.getElementById("transportAssetPickModal");
    const titleEl = document.getElementById("transportAssetPickTitle");
    const listEl = document.getElementById("transportAssetPickList");
    if (!modal || !titleEl || !listEl || !supabaseClient || !isSupabaseOrdersEnabled) {
        alert("Supabase에 연결된 경우에만 등록 목록을 불러올 수 있습니다.");
        return;
    }
    const table = kind === "tt" ? "h2go_tube_trailers" : "h2go_transport_drivers";
    const { data, error } = await supabaseClient.from(table).select("*").order(kind === "tt" ? "vehicle_number" : "driver_name", { ascending: true });
    if (error) {
        alert(error.message || "목록을 불러오지 못했습니다.");
        return;
    }
    const rows = Array.isArray(data) ? data : [];
    transportAssetPickState = { kind, targetInputId, rows };
    titleEl.textContent = kind === "tt" ? "등록된 T/T 선택" : "등록된 운반기사 선택";
    if (!rows.length) {
        listEl.innerHTML = '<p class="transport-pick-empty">등록된 항목이 없습니다. 운송 자원 메뉴에서 추가해 주세요.</p>';
        modal.classList.add("active");
        return;
    }
    if (kind === "tt") {
        listEl.innerHTML = rows
            .map((r) => {
                const num = String(r.vehicle_number || "").replace(/"/g, "&quot;");
                const owner = String(r.owner_name || "—").replace(/</g, "&lt;");
                const vInsp = r.vehicle_inspection_date || "—";
                const pInsp = r.pressure_vessel_inspection_date || "—";
                return `<button type="button" class="transport-asset-pick-item" data-pick-tt="${num}">
                    <div class="transport-asset-pick-item-title">${num}</div>
                    <div class="transport-asset-pick-item-meta">소유자 ${owner} · 차량검사 ${vInsp} · 압력용기 ${pInsp}</div>
                </button>`;
            })
            .join("");
    } else {
        listEl.innerHTML = rows
            .map((r) => {
                const name = String(r.driver_name || "").replace(/"/g, "&quot;");
                const plate = String(r.tractor_plate_number || "—").replace(/</g, "&lt;");
                const yr = String(r.vehicle_model_year || "—");
                const mdl = String(r.vehicle_model_name || "—").replace(/</g, "&lt;");
                return `<button type="button" class="transport-asset-pick-item" data-pick-driver="${name}">
                    <div class="transport-asset-pick-item-title">${name}</div>
                    <div class="transport-asset-pick-item-meta">트랙터 ${plate} · ${yr} · ${mdl}</div>
                </button>`;
            })
            .join("");
    }
    listEl.querySelectorAll("[data-pick-tt]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const input = document.getElementById(transportAssetPickState.targetInputId);
            appendToCommaSeparatedField(input, btn.getAttribute("data-pick-tt"));
            closeTransportAssetPickModal();
        });
    });
    listEl.querySelectorAll("[data-pick-driver]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const input = document.getElementById(transportAssetPickState.targetInputId);
            if (input) input.value = btn.getAttribute("data-pick-driver") || "";
            closeTransportAssetPickModal();
        });
    });
    modal.classList.add("active");
}

async function maybeSaveConsumerTransportAssets(ttRaw, driverName, saveTt, saveDriver) {
    if (!supabaseClient || !isSupabaseOrdersEnabled) return;
    const session = (await supabaseClient.auth.getSession()).data?.session;
    if (!session?.user?.id) return;
    const uid = session.user.id;
    const ownerLabel = String(currentUser?.name || auth?.name || "").trim();
    if (saveTt) {
        const nums = String(ttRaw || "")
            .split(/[,，\s]+/)
            .map((s) => s.trim())
            .filter(Boolean);
        for (const vehicle_number of nums) {
            const { error } = await supabaseClient.from("h2go_tube_trailers").upsert(
                {
                    owner_member_id: uid,
                    vehicle_number,
                    owner_name: ownerLabel,
                    vehicle_inspection_date: null,
                    pressure_vessel_inspection_date: null,
                    notes: "",
                },
                { onConflict: "owner_member_id,vehicle_number" }
            );
            if (error && !String(error.message || "").includes("duplicate")) console.warn("[h2go] save consumer T/T:", error.message || error);
        }
    }
    if (saveDriver) {
        const dn = String(driverName || "").trim();
        if (dn) {
            const { error } = await supabaseClient.from("h2go_transport_drivers").insert({
                owner_member_id: uid,
                driver_name: dn,
                tractor_plate_number: "",
                vehicle_model_year: "",
                vehicle_model_name: "",
                vehicle_inspection_date: null,
                notes: "",
            });
            if (error && !String(error.message || "").toLowerCase().includes("duplicate") && !String(error.code || "").includes("23")) {
                console.warn("[h2go] save consumer driver:", error.message || error);
            }
        }
    }
}

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
    let initialRole = hintedRole || auth.activeRole || "consumer";
    if (!auth.roles.includes(initialRole)) initialRole = auth.roles[0] || "consumer";
    currentUser = { type: initialRole, name: auth.name };
}

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

/**
 * 주문회차 2자리(01~99): 같은 날짜(YYMMDD)에 **해당 수요자가 해당 공급자에게** 연 주문 횟수 기준
 * (수요자 B→C 1건, 수요자 A→B 1건이면 각각 seq 01)
 */
function nextConsumerSupplierOrderSequence(year, month, day, consumerName, supplierName) {
    const dateCode = orderDateCode(year, month, day);
    const cWant = String(consumerName || "").trim().toLowerCase();
    const sWant = String(supplierName || "").trim().toLowerCase();
    const re = new RegExp(`^${dateCode}-([0-9]{2})-.+`);
    let maxSeq = 0;
    for (const o of orders) {
        if (!o || !o.id) continue;
        if (String(o.consumerName || "").trim().toLowerCase() !== cWant) continue;
        if (String(o.supplierName || "").trim().toLowerCase() !== sWant) continue;
        const m = String(o.id).match(re);
        if (!m) continue;
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n)) maxSeq = Math.max(maxSeq, n);
    }
    const next = maxSeq + 1;
    const bounded = Math.min(next, 99);
    return String(bounded).padStart(2, "0");
}

// 주문번호: 주문일시 6자리 - 수요자·공급자 쌍별 당일 순번 2자리 - 구매자번호 3자리 - 판매자번호 3자리
function generateOrderId({ supplierName, consumerName, year, month, day }) {
    const supplierCode = businessCodeFromName(supplierName);
    const consumerCode = businessCodeFromName(consumerName);
    const dateCode = orderDateCode(year, month, day); // YYMMDD
    const seq = nextConsumerSupplierOrderSequence(year, month, day, consumerName, supplierName);
    return `${dateCode}-${seq}-${consumerCode}-${supplierCode}`;
}

function getTodayParts() {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function getTomorrowParts() {
    const t = getTodayParts();
    const d = new Date(t.year, t.month - 1, t.day);
    d.setDate(d.getDate() + 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

/** 납품 예정일(주문의 year/month/day)이 해당 일자와 같은지 */
function isOrderDeliveryOnLocalDay(order, year, month, day) {
    if (!order) return false;
    return Number(order.year) === year && Number(order.month) === month && Number(order.day) === day;
}

function countOrdersByConsumerName(orderList) {
    const map = new Map();
    for (const o of orderList) {
        const name = String(o.consumerName || "").trim() || "—";
        map.set(name, (map.get(name) || 0) + 1);
    }
    return map;
}

function countOrdersBySupplierName(orderList) {
    const map = new Map();
    for (const o of orderList) {
        const name = String(o.supplierName || "").trim() || "—";
        map.set(name, (map.get(name) || 0) + 1);
    }
    return map;
}

function formatSupplierInsightTooltipPanelHtml(heading, orderList) {
    const by = countOrdersByConsumerName(orderList);
    const lines = Array.from(by.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
    const lis = lines.length
        ? lines.map(([k, v]) => `<li><span class="insight-tooltip-name">${escapeBannerHtml(k)}</span> <span class="insight-tooltip-count">${v}건</span></li>`).join("")
        : '<li class="insight-tooltip-empty">해당 없음</li>';
    return `<div class="insight-tooltip-title">${escapeBannerHtml(heading)}</div><ul class="insight-tooltip-list">${lis}</ul>`;
}

function formatConsumerInsightTooltipPanelHtml(heading, orderList) {
    const by = countOrdersBySupplierName(orderList);
    const lines = Array.from(by.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
    const lis = lines.length
        ? lines.map(([k, v]) => `<li><span class="insight-tooltip-name">${escapeBannerHtml(k)}</span> <span class="insight-tooltip-count">${v}건</span></li>`).join("")
        : '<li class="insight-tooltip-empty">해당 없음</li>';
    return `<div class="insight-tooltip-title">${escapeBannerHtml(heading)}</div><ul class="insight-tooltip-list">${lis}</ul>`;
}

function getConsumerOrders(consumerName) {
    // 수요자별 전체 주문 이력 (취소 포함) — DB·세션 표기 차이로 인한 미집계 방지
    const want = String(consumerName || "").trim().toLowerCase();
    if (!want) return [];
    return orders.filter((o) => String(o.consumerName || "").trim().toLowerCase() === want);
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
    if (!order) return '-';
    return `${order.year}/${order.month}/${order.day} ${formatTimeText(order.time)}`;
}

const TT_SWAP_MINUTES = 15;
/** 출하도: 공급자 T/T 충전 소요(분) — 예·회차 시각 산출에 사용 */
const EX_FACTORY_CHARGE_MINUTES = 150;
const DEFAULT_TT_VOLUME_M3 = 22;

/** @returns {string[]} */
function getOrderTrailerNumbers(order) {
    const ti = order?.transportInfo;
    const raw = ti && Array.isArray(ti.trailerNumbers) ? ti.trailerNumbers : [];
    const list = raw.map((x) => String(x || "").trim()).filter(Boolean);
    if (list.length) return list;
    const n = Math.max(1, Number(order?.tubeTrailers || 1));
    return Array.from({ length: n }, (_, i) => `T/T ${i + 1}`);
}

function findPreviousTrailerQtySnapshot(consumerName, address, trailerNo, excludeOrderId) {
    const keyConsumer = String(consumerName || "").trim().toLowerCase();
    const keyAddr = String(address || "").trim().toLowerCase();
    const tt = String(trailerNo || "").trim();
    if (!tt) return null;
    let best = null;
    let bestT = 0;
    for (const o of orders) {
        if (!o || o.id === excludeOrderId) continue;
        if (String(o.consumerName || "").trim().toLowerCase() !== keyConsumer) continue;
        if (String(o.address || "").trim().toLowerCase() !== keyAddr) continue;
        const qs = o.qtySettlement;
        if (!qs || typeof qs !== "object" || !qs.byTrailer || typeof qs.byTrailer !== "object") continue;
        const snap = qs.byTrailer[tt];
        if (!snap || typeof snap !== "object") continue;
        const t = o.completedAt || o.arrivedAt || o.createdAt || "";
        const ts = t ? new Date(t).getTime() : 0;
        if (ts >= bestT) {
            bestT = ts;
            best = snap;
        }
    }
    return best;
}

function computeQtyDeltas(method, snap, volM3) {
    const v = Number(volM3) > 0 ? Number(volM3) : DEFAULT_TT_VOLUME_M3;
    const num = (x) => {
        const n = parseFloat(String(x ?? "").replace(/,/g, ""));
        return Number.isFinite(n) ? n : null;
    };
    if (method === "flow") {
        const refIn = num(snap.flowInRef);
        const refOut = num(snap.flowOutRef);
        const curIn = num(snap.flowInCurr);
        const curOut = num(snap.flowOutCurr);
        if (refIn == null || refOut == null || curIn == null || curOut == null) return { delta: null, label: "유량계 차이(kg)" };
        const usageRef = refOut - refIn;
        const usageCur = curOut - curIn;
        return { delta: usageCur - usageRef, label: "유량계 차이(kg)" };
    }
    if (method === "pressure") {
        const refIn = num(snap.pressureInRef);
        const refOut = num(snap.pressureOutRef);
        const curIn = num(snap.pressureInCurr);
        const curOut = num(snap.pressureOutCurr);
        if (refIn == null || refOut == null || curIn == null || curOut == null) return { delta: null, label: "차압 기준 증감(m³)" };
        const deltaPRef = refOut - refIn;
        const deltaPCur = curOut - curIn;
        return { delta: (deltaPCur - deltaPRef) * v, label: "차압×내용적 증감(m³)" };
    }
    if (method === "weight") {
        const refB = num(snap.weightBeforeRef);
        const refA = num(snap.weightAfterRef);
        const curB = num(snap.weightBeforeCurr);
        const curA = num(snap.weightAfterCurr);
        if (refB == null || refA == null || curB == null || curA == null) return { delta: null, label: "T/T 계량 차이(kg)" };
        const chRef = refA - refB;
        const chCur = curA - curB;
        return { delta: chCur - chRef, label: "T/T 계량 차이(kg)" };
    }
    return { delta: null, label: "" };
}

/** 출하도 충전: 입고압(충전 전) → 출고압(실차 출발) × 내용적 = 부피(Nm³) */
function computeExFactoryChargeVolumeM3(chargeInBar, chargeOutBar, volM3) {
    const num = (x) => {
        const n = parseFloat(String(x ?? "").replace(/,/g, ""));
        return Number.isFinite(n) ? n : null;
    };
    const a = num(chargeInBar);
    const b = num(chargeOutBar);
    const v = Number(volM3) > 0 ? Number(volM3) : DEFAULT_TT_VOLUME_M3;
    if (a == null || b == null) return null;
    return (b - a) * v;
}

/** change/cancel 요청자 정규화 (저장값 대소문자·공백 흔들림 대비) */
function normalizeRequestParty(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (s === "consumer" || s === "buyer") return "consumer";
    if (s === "supplier" || s === "seller") return "supplier";
    return s;
}

/** actor: 'consumer' | 'supplier' — 상대방이 건 대기 중일 때만 승인 가능 */
function canActorApprovePendingChange(order, actor) {
    const ch = order?.changeRequest;
    if (!ch || ch.status !== "pending") return false;
    const rb = normalizeRequestParty(ch.requestedBy);
    if (rb === "consumer") return actor === "supplier";
    if (rb === "supplier") return actor === "consumer";
    return false;
}

function canActorApprovePendingCancel(order, actor) {
    const cr = order?.cancelRequest;
    if (!cr || cr.status !== "pending") return false;
    const rb = normalizeRequestParty(cr.requestedBy);
    if (rb === "consumer") return actor === "supplier";
    if (rb === "supplier") return actor === "consumer";
    return false;
}

const SEEN_CHANGE_REVIEW_PREFIX = "h2go_seen_change_review_v1:";
const SEEN_CANCEL_REVIEW_PREFIX = "h2go_seen_cancel_review_v1:";

function seenReviewStorageKey(prefix, actor, orderId) {
    const a = String(actor || "").trim();
    const id = String(orderId || "").trim();
    return `${prefix}${a}:${encodeURIComponent(id)}`;
}

function hasSeenPendingChangeReview(orderId, actor) {
    try {
        return localStorage.getItem(seenReviewStorageKey(SEEN_CHANGE_REVIEW_PREFIX, actor, orderId)) === "1";
    } catch (_) {
        return false;
    }
}

function markSeenPendingChangeReview(orderId, actor) {
    try {
        localStorage.setItem(seenReviewStorageKey(SEEN_CHANGE_REVIEW_PREFIX, actor, orderId), "1");
    } catch (_) {}
}

function hasSeenPendingCancelReview(orderId, actor) {
    try {
        return localStorage.getItem(seenReviewStorageKey(SEEN_CANCEL_REVIEW_PREFIX, actor, orderId)) === "1";
    } catch (_) {
        return false;
    }
}

function markSeenPendingCancelReview(orderId, actor) {
    try {
        localStorage.setItem(seenReviewStorageKey(SEEN_CANCEL_REVIEW_PREFIX, actor, orderId), "1");
    } catch (_) {}
}

function clearSeenChangeReviewForOrder(order) {
    const ch = order?.changeRequest;
    if (!ch) return;
    const approver = ch.requestedBy === "consumer" ? "supplier" : "consumer";
    try {
        localStorage.removeItem(seenReviewStorageKey(SEEN_CHANGE_REVIEW_PREFIX, approver, order.id));
    } catch (_) {}
}

function clearSeenCancelReviewForOrder(order) {
    const cr = order?.cancelRequest;
    if (!cr) return;
    const approver = cr.requestedBy === "consumer" ? "supplier" : "consumer";
    try {
        localStorage.removeItem(seenReviewStorageKey(SEEN_CANCEL_REVIEW_PREFIX, approver, order.id));
    } catch (_) {}
}

function decideCancelOrder(o, approved) {
    if (!o || !o.cancelRequest) return;
    const decidedAt = new Date().toISOString();
    const requestedBy = o.cancelRequest.requestedBy;
    const decidedBy = requestedBy === "consumer" ? "supplier" : "consumer";

    if (approved) {
        o.status = "cancelled";
        o.cancelledAt = decidedAt;
        o.cancelRequest.status = "approved";
        o.cancelRequest.decidedAt = decidedAt;
        o.cancelRequest.decidedBy = decidedBy;
        o.lastCancel = { result: "approved", decidedAt, decidedBy };
    } else {
        o.cancelRequest.status = "rejected";
        o.cancelRequest.decidedAt = decidedAt;
        o.cancelRequest.decidedBy = decidedBy;
        o.lastCancel = { result: "rejected", decidedAt, decidedBy, reason: o.cancelRequest.reason || "" };
        o.status = o.cancelRequest.originalStatus || "accepted";
    }
}

function parseIsoToDate(iso) {
    if (!iso) return null;
    const t = new Date(iso);
    return Number.isFinite(t.getTime()) ? t : null;
}

function getTransportStartedAtDate(order) {
    return parseIsoToDate(order?.transportStartedAt);
}

function formatCalendarDateTimeFromDate(d) {
    if (!d || !Number.isFinite(d.getTime())) return null;
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const h = d.getHours();
    const min = d.getMinutes();
    return `${y}/${m}/${day} ${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function addMinutesToDate(base, deltaMin) {
    if (!base || !Number.isFinite(base.getTime())) return null;
    return new Date(base.getTime() + deltaMin * 60 * 1000);
}

/** 주문 납품 약속 일시 → Date (출하도에서는 실차 납품 도착 목표 시각으로 해석) */
function orderDateTimeToDate(order) {
    if (!order) return null;
    const y = Number(order.year);
    const m = Number(order.month);
    const d = Number(order.day);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    const [hRaw = "0", mRaw = "0"] = String(order.time || "0:0").split(":");
    const hh = Math.max(0, Math.min(23, parseInt(hRaw, 10) || 0));
    const mm = Math.max(0, Math.min(59, parseInt(mRaw, 10) || 0));
    const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
    return Number.isFinite(dt.getTime()) ? dt : null;
}

/**
 * 출하도·구매자: 공차 미출발 시 — 납품 목표(실차 도착)에서 (편도×2 + 충전)을 빼 역산한 공차 출발 예정
 */
function getExFactoryConsumerEmptyDepartEstimate(order) {
    if (!isExFactoryOrder(order)) return null;
    const due = orderDateTimeToDate(order);
    const travel = getShipmentLegTravelMinutes(order);
    if (!due || travel <= 0) return null;
    return addMinutesToDate(due, -(travel * 2 + EX_FACTORY_CHARGE_MINUTES));
}

/** 실차(또는 도착도 본 운송) 기준: 출하=시작 시각, 예상도착=시작+편도, 회차=납품도착+T/T교체+복귀편도 (=시작+2*편도+교체) */
function getLiveTransportScheduleStrings(order) {
    const anchor = getTransportStartedAtDate(order);
    const travelMin = getShipmentLegTravelMinutes(order);
    if (!anchor || travelMin <= 0) return null;
    const departStr = formatCalendarDateTimeFromDate(anchor);
    const arrive = addMinutesToDate(anchor, travelMin);
    const arriveStr = formatCalendarDateTimeFromDate(arrive);
    const ret = addMinutesToDate(anchor, travelMin + TT_SWAP_MINUTES + travelMin);
    const returnStr = formatCalendarDateTimeFromDate(ret);
    return { departStr, arriveStr, returnStr };
}

function getEmptyLegStartedAtDate(order) {
    return parseIsoToDate(order?.emptyLegStartedAt);
}

function getOutboundStartedAtDate(order) {
    return parseIsoToDate(order?.outboundStartedAt);
}

function etaFromAnchorIso(iso, travelMin) {
    const base = parseIsoToDate(iso);
    if (!base || travelMin <= 0) return null;
    const arrive = addMinutesToDate(base, travelMin);
    return formatCalendarDateTimeFromDate(arrive);
}

/**
 * 예상도착(소요) 줄 — viewer: 구매/판매 카드에 따라 출하도 일정 해석이 다름
 * - 출하도·구매: 실차 출고(transportStartedAt) 후에만 납품지 도착 예정
 * - 출하도·판매: 도착도의 수요자와 유사 — 공차 운송 중이면 공급지 도착 예정, 실차 운송 중이면 납품지 도착 예정
 */
function getOrderEtaLines(order, viewer = "consumer") {
    const travelMin = getShipmentLegTravelMinutes(order);
    const st = normalizeStatus(order?.status);
    const lines = [];
    if (isExFactoryOrder(order)) {
        if (viewer === "consumer") {
            if (st === "in_transit" && order.transportStartedAt && travelMin > 0) {
                const t = etaFromAnchorIso(order.transportStartedAt, travelMin);
                if (t) lines.push({ prefix: "", text: t });
            }
            return lines;
        }
        if (st === "empty_in_transit" && order.emptyLegStartedAt && travelMin > 0) {
            const t = etaFromAnchorIso(order.emptyLegStartedAt, travelMin);
            if (t) lines.push({ prefix: "", text: t });
            return lines;
        }
        if (st === "in_transit" && order.transportStartedAt && travelMin > 0) {
            const t = etaFromAnchorIso(order.transportStartedAt, travelMin);
            if (t) lines.push({ prefix: "", text: t });
        }
        return lines;
    }
    if (["requested", "accepted", "change_accepted", "arrived"].includes(st)) {
        return lines;
    }
    if (st === "in_transit" && order.transportStartedAt) {
        const t = etaFromAnchorIso(order.transportStartedAt, travelMin);
        if (t) lines.push({ prefix: "", text: t });
        return lines;
    }
    if (st === "empty_in_transit" && order.emptyLegStartedAt && !isExFactoryOrder(order)) {
        const t2 = etaFromAnchorIso(order.emptyLegStartedAt, travelMin);
        if (t2) lines.push({ prefix: "", text: t2 });
        return lines;
    }
    return lines;
}

function escapeBannerHtml(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** 카드 열용: 연월일 —(실선)— 시각 (공백 기준 분리). 잘림·이상 줄바꿈 방지 */
function formatBannerDateTimeTwoLinesHtml(dateTimeStr, opts = {}) {
    const mutedClass = opts.muted ? " order-banner-datetime-stack--muted" : "";
    const div = `<span class="order-banner-datetime-divider" aria-hidden="true"></span>`;
    const dash = `<span class="order-banner-datetime-stack${mutedClass}"><span class="order-banner-date-line">—</span></span>`;
    if (dateTimeStr == null || dateTimeStr === "" || dateTimeStr === "—") return dash;
    const s = String(dateTimeStr).trim();
    if (!s || s === "—") return dash;
    const spaceIdx = s.indexOf(" ");
    if (spaceIdx === -1) {
        return `<span class="order-banner-datetime-stack${mutedClass}"><span class="order-banner-date-line">${escapeBannerHtml(s)}</span></span>`;
    }
    const datePart = s.slice(0, spaceIdx);
    const timePart = s.slice(spaceIdx + 1).trim();
    return `<span class="order-banner-datetime-stack${mutedClass}"><span class="order-banner-date-line">${escapeBannerHtml(
        datePart
    )}</span>${div}<span class="order-banner-time-line">${escapeBannerHtml(timePart)}</span></span>`;
}

/** 상단 행: 연월일만(또는 단일 토큰 한 줄) */
function formatBannerDateTimeDateOnlyHtml(dateTimeStr, opts = {}) {
    const mutedClass = opts.muted ? " order-banner-datetime-stack--muted" : "";
    const dash = `<span class="order-banner-datetime-stack order-banner-datetime-stack--date-only${mutedClass}"><span class="order-banner-date-line">—</span></span>`;
    if (dateTimeStr == null || dateTimeStr === "" || dateTimeStr === "—") return dash;
    const s = String(dateTimeStr).trim();
    if (!s || s === "—") return dash;
    const spaceIdx = s.indexOf(" ");
    const datePart = spaceIdx === -1 ? s : s.slice(0, spaceIdx);
    return `<span class="order-banner-datetime-stack order-banner-datetime-stack--date-only${mutedClass}"><span class="order-banner-date-line">${escapeBannerHtml(
        datePart
    )}</span></span>`;
}

/** 하단 행: 시각·소요만 */
function formatBannerDateTimeTimeOnlyHtml(dateTimeStr, opts = {}) {
    const mutedClass = opts.muted ? " order-banner-datetime-stack--muted" : "";
    const dash = `<span class="order-banner-datetime-stack order-banner-datetime-stack--time-only${mutedClass}"><span class="order-banner-time-line">—</span></span>`;
    if (dateTimeStr == null || dateTimeStr === "" || dateTimeStr === "—") return dash;
    const s = String(dateTimeStr).trim();
    if (!s || s === "—") return dash;
    const spaceIdx = s.indexOf(" ");
    const timePart = spaceIdx === -1 ? s : s.slice(spaceIdx + 1).trim();
    return `<span class="order-banner-datetime-stack order-banner-datetime-stack--time-only${mutedClass}"><span class="order-banner-time-line">${escapeBannerHtml(
        timePart
    )}</span></span>`;
}

/** T/T 번호만(상단 행). 메모는 하단 열용 */
function formatOrderBannerTtNumberOnlyHtml(ttLine, extraHtml = "") {
    const ttRaw = ttLine == null || ttLine === "" ? "—" : String(ttLine);
    const tt = escapeBannerHtml(ttRaw);
    return `<div class="order-banner-tt-stack order-banner-tt-stack--number-only"><div class="order-banner-strong order-tt-num">${tt}</div>${extraHtml || ""}</div>`;
}

/** T/T번호 + 실선 + 운송기사명 (+ 선택 메모) — 레거시·모달 등 */
function formatOrderBannerTtStackHtml(ttLine, driverLine, extraHtml = "") {
    const ttRaw = ttLine == null || ttLine === "" ? "—" : String(ttLine);
    const tt = escapeBannerHtml(ttRaw);
    const drv = String(driverLine || "").trim();
    const hasDriver = drv && drv !== "—";
    const driverPart = hasDriver
        ? `<span class="order-banner-tt-divider" aria-hidden="true"></span><div class="order-banner-tt-driver">${escapeBannerHtml(drv)}</div>`
        : "";
    return `<div class="order-banner-tt-stack"><div class="order-banner-strong order-tt-num">${tt}</div>${driverPart}${extraHtml || ""}</div>`;
}

function formatOrderEtaToolbarHtml(order, viewer = "consumer") {
    const lines = getOrderEtaLines(order, viewer);
    if (!lines.length) return "";
    const segments = lines
        .filter((l) => l.text)
        .map((l) => {
            const stack = formatBannerDateTimeTwoLinesHtml(l.text, { muted: false });
            return `<div class="order-card-eta-segment">${stack}</div>`;
        });
    if (!segments.length) return "";
    return `<div class="order-card-eta-toolbar order-card-eta-toolbar--stacked">${segments.join("")}</div>`;
}

function formatOrderEtaDateToolbarHtml(order, viewer = "consumer") {
    const lines = getOrderEtaLines(order, viewer).filter((l) => l.text);
    if (!lines.length) return "";
    const segments = lines.map((l) => {
        const stack = formatBannerDateTimeDateOnlyHtml(l.text, { muted: false });
        return `<div class="order-card-eta-segment">${stack}</div>`;
    });
    return `<div class="order-card-eta-toolbar order-card-eta-toolbar--stacked order-card-eta-toolbar--dates-only">${segments.join("")}</div>`;
}

function formatOrderEtaTimeToolbarHtml(order, viewer = "consumer") {
    const lines = getOrderEtaLines(order, viewer).filter((l) => l.text);
    if (!lines.length) return "";
    const segments = lines.map((l) => {
        const stack = formatBannerDateTimeTimeOnlyHtml(l.text, { muted: false });
        return `<div class="order-card-eta-segment">${stack}</div>`;
    });
    return `<div class="order-card-eta-toolbar order-card-eta-toolbar--stacked order-card-eta-toolbar--times-only">${segments.join("")}</div>`;
}

function buildOrderCardEtaCells(order, travelTimeText, viewer = "consumer") {
    const stEta = normalizeStatus(order?.status);
    if (
        isExFactoryOrder(order) &&
        viewer === "consumer" &&
        stEta === "empty_arrived" &&
        order.exFactoryChargeCompletedAt
    ) {
        const d = parseIsoToDate(order.exFactoryChargeCompletedAt);
        if (d) {
            const stack = formatBannerDateTimeTwoLinesHtml(formatCalendarDateTimeFromDate(d), { muted: false });
            const etaCellTopReady = `<div class="supplier-tl-value supplier-tl-eta"><div class="order-exfactory-ready-eta"><span class="order-exfactory-ready-label">출하 가능</span>${stack}</div></div>`;
            const etaFooterReady = `<div class="order-card-footer-eta-wrap">${formatBannerDateTimeTimeOnlyHtml(null, {
                muted: true,
            })}</div>`;
            return { etaCellTop: etaCellTopReady, etaCellFooter: etaFooterReady };
        }
    }
    const etaLines = getOrderEtaLines(order, viewer).filter((l) => l.text);
    let etaCellTop;
    let etaCellFooter;
    if (etaLines.length) {
        etaCellTop = `<div class="supplier-tl-value supplier-tl-eta"><div class="supplier-tl-eta-toolbar">${formatOrderEtaDateToolbarHtml(
            order,
            viewer
        )}</div></div>`;
        etaCellFooter = `<div class="order-card-footer-eta-wrap">${formatOrderEtaTimeToolbarHtml(order, viewer)}</div>`;
    } else {
        etaCellTop = `<div class="supplier-tl-value supplier-tl-eta">${formatBannerDateTimeDateOnlyHtml(null, {
            muted: true,
        })}</div>`;
        if (travelTimeText && travelTimeText !== "—") {
            etaCellTop = `<div class="supplier-tl-value supplier-tl-eta"><span class="order-banner-datetime-stack order-banner-datetime-stack--date-only order-banner-datetime-stack--muted"><span class="order-banner-date-line">—</span></span></div>`;
            etaCellFooter = `<span class="order-footer-time-line">${escapeBannerHtml("소요 " + travelTimeText)}</span>`;
        } else {
            etaCellFooter = formatBannerDateTimeTimeOnlyHtml(null, { muted: true });
        }
    }
    return { etaCellTop, etaCellFooter };
}

function buildOrderCardFooterGridHtml({
    orderId,
    deliveryAddress,
    /** 카드 하단 주소 열에 넣을 문자열(미지정 시 deliveryAddress) — 구매: 공급자 출하 주소, 판매: 납품지 등 */
    footerAddressDisplay,
    driverLine,
    transportNoteHtml,
    etaFooterHtml,
    shipmentFooterHtml,
    returnFooterHtml,
    variant,
    footerStatusActionsHtml = "",
    memoText = "",
}) {
    const drv = String(driverLine || "").trim();
    const driverInner =
        drv && drv !== "—"
            ? `<span class="order-footer-driver">${escapeBannerHtml(drv)}</span>`
            : `<span class="order-footer-driver order-footer-driver--empty">—</span>`;
    const noteBlock = transportNoteHtml || "";
    const addrRaw = String(
        footerAddressDisplay !== undefined && footerAddressDisplay !== null ? footerAddressDisplay : deliveryAddress || ""
    ).trim();
    const titleAttr = addrRaw
        ? ` title="${escapeBannerHtml(addrRaw).replace(/"/g, "&quot;")}"`
        : "";
    const addressBlock = addrRaw
        ? `<div class="order-footer-address-wrap"><span class="order-footer-address"${titleAttr}>${escapeBannerHtml(
              addrRaw
          )}</span></div>`
        : `<div class="order-footer-address-wrap"><span class="order-footer-address order-footer-address--empty">—</span></div>`;
    const gridExtra = "order-card-footer-grid--unified";
    const memoRaw = String(memoText || "").trim();
    const memoBlock = memoRaw
        ? `<div class="order-footer-memo change-summary">메모: ${escapeBannerHtml(memoRaw)}</div>`
        : "";
    const statusCol =
        String(footerStatusActionsHtml || "").trim() !== ""
            ? `<div class="order-banner-cell order-footer-cell order-footer-cell--status-actions"><div class="order-footer-status-actions-inner">${footerStatusActionsHtml}</div></div>`
            : `<div class="order-banner-cell order-footer-cell order-footer-cell--status-gap"></div>`;
    return `<div class="order-card-footer-grid ${gridExtra}">
        <div class="order-banner-cell order-footer-cell order-footer-cell--id">
            <span class="order-card-order-id">주문번호 ${escapeBannerHtml(orderId)}</span>
            ${memoBlock}
        </div>
        <div class="order-banner-cell order-footer-cell order-footer-cell--address">${addressBlock}</div>
        <div class="order-banner-cell order-footer-cell order-footer-cell--tt">${driverInner}${noteBlock}</div>
        <div class="order-banner-cell order-footer-cell order-footer-cell--eta">${etaFooterHtml}</div>
        <div class="order-banner-cell order-footer-cell">${shipmentFooterHtml}</div>
        <div class="order-banner-cell order-footer-cell">${returnFooterHtml}</div>
        ${statusCol}
    </div>`;
}

/**
 * 주문 카드 7열 중 출하·회차 열 표시 여부
 * - 도착도·수요자: 출하/회차(계획) 숨김 — 실차 출발 후 예상도착만 사용
 * - 출하도·공급자: 출하/회차 열 숨김 — 공차 출발 시 예상도착만, 공차 도착 후 충전완료 시각은 ETA 열
 */
function orderCardShowShipmentReturnColumns(order, viewer) {
    if (!order) return { showShipment: true, showReturn: true };
    if (order.supplyCondition === "delivery" && viewer === "consumer") {
        return { showShipment: false, showReturn: false };
    }
    if (isExFactoryOrder(order) && viewer === "supplier") {
        return { showShipment: false, showReturn: false };
    }
    return { showShipment: true, showReturn: true };
}

function orderCardMutedShipmentReturnBannerCells() {
    const dash = formatBannerDateTimeDateOnlyHtml(null, { muted: true });
    return { shipmentBanner: dash, returnBanner: dash };
}

/**
 * 출하·회차 표시 일시
 * opts.viewer: 'consumer' | 'supplier' — 출하도는 공급자 화면에서 출하/회차 열 미사용(null)
 */
function formatShipmentDateTime(order, opts = {}) {
    const viewer = opts.viewer || "consumer";
    if (!order) return null;
    if (isExFactoryOrder(order)) {
        if (viewer === "supplier") return null;
        const emptyAt = getEmptyLegStartedAtDate(order);
        if (emptyAt) return formatCalendarDateTimeFromDate(emptyAt);
        const est = getExFactoryConsumerEmptyDepartEstimate(order);
        return est ? formatCalendarDateTimeFromDate(est) : null;
    }
    const live = getLiveTransportScheduleStrings(order);
    if (live) return live.departStr;
    const travelMin = getShipmentLegTravelMinutes(order);
    if (travelMin <= 0) return null;
    const y = order.year, m = order.month, d = order.day;
    const [hRaw = '0', mRaw = '0'] = String(order.time || '0:0').split(':');
    let h = parseInt(hRaw, 10) || 0;
    let min = (parseInt(mRaw, 10) || 0) - travelMin;
    while (min < 0) { min += 60; h -= 1; }
    let day = d, month = m, year = y;
    while (h < 0) { h += 24; day -= 1; }
    if (day < 1) {
        day += new Date(year, month, 0).getDate();
        month -= 1;
        if (month < 1) { month += 12; year -= 1; }
    }
    const timeStr = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    return `${year}/${month}/${day} ${timeStr}`;
}

/** 도착도(계획): 약속 납품일시 + T/T교체(15분) + 편도(복귀). 운송 시작 후에는 getLiveTransportScheduleStrings와 동일(납품도착+교체+복귀). */
function formatReturnDateTime(order, opts = {}) {
    const viewer = opts.viewer || "consumer";
    if (!order) return null;
    if (isExFactoryOrder(order)) {
        if (viewer === "supplier") return null;
        const travelMin = getShipmentLegTravelMinutes(order);
        const loadedAt = getTransportStartedAtDate(order);
        if (loadedAt && travelMin > 0) {
            const arrive = addMinutesToDate(loadedAt, travelMin);
            return formatCalendarDateTimeFromDate(arrive);
        }
        const anchor = getEmptyLegStartedAtDate(order) || getExFactoryConsumerEmptyDepartEstimate(order);
        if (anchor && travelMin > 0) {
            const ret = addMinutesToDate(anchor, travelMin + EX_FACTORY_CHARGE_MINUTES + travelMin);
            return formatCalendarDateTimeFromDate(ret);
        }
        return null;
    }
    const live = getLiveTransportScheduleStrings(order);
    if (live) return live.returnStr;
    const travelMin = getShipmentLegTravelMinutes(order);
    if (travelMin <= 0) return null;
    /* 납품 약속 시각 기준: 교체 15분 + 복귀 편도 1회(이중 편도를 더하지 않음) */
    const totalMin = TT_SWAP_MINUTES + travelMin;
    const y = order.year, m = order.month, d = order.day;
    const [hRaw = '0', mRaw = '0'] = String(order.time || '0:0').split(':');
    let h = parseInt(hRaw, 10) || 0;
    let min = (parseInt(mRaw, 10) || 0) + totalMin;
    while (min >= 60) { min -= 60; h += 1; }
    let day = d, month = m, year = y;
    while (h >= 24) { h -= 24; day += 1; }
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day > daysInMonth) {
        day -= daysInMonth;
        month += 1;
        if (month > 12) { month -= 12; year += 1; }
    }
    const timeStr = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    return `${year}/${month}/${day} ${timeStr}`;
}

/** @deprecated 카드는 getOrderEtaLines / formatOrderEtaToolbarHtml 사용 */
function formatExpectedArrivalDateTime(order) {
    const lines = getOrderEtaLines(order, "consumer");
    if (!lines.length) return null;
    return lines.map((l) => `${l.text}`).join(" · ");
}

function formatOrderDate(order) {
    if (!order) return '-';
    return `${order.year}/${order.month}/${order.day}`;
}

function getOrderDateTimeSortKey(order) {
    const y = String(order?.year ?? "").padStart(4, "0");
    const m = String(order?.month ?? "").padStart(2, "0");
    const d = String(order?.day ?? "").padStart(2, "0");
    const t = formatTimeText(order?.time);
    return `${y}-${m}-${d} ${t}`;
}

/** 동일 수요자·납품지에서 납품일시 기준 직전 도착도 주문 (연속 납품 물량 연계용) */
function findPreviousDeliveryOrderByDeliveryTime(currentOrder) {
    if (!currentOrder || currentOrder.supplyCondition !== "delivery") return null;
    const me = String(currentOrder.consumerName || "").trim().toLowerCase();
    const addr = String(currentOrder.address || "").trim().toLowerCase();
    const myKey = getOrderDateTimeSortKey(currentOrder);
    let best = null;
    let bestKey = "";
    for (const o of orders) {
        if (!o || o.id === currentOrder.id) continue;
        if (o.supplyCondition !== "delivery") continue;
        if (String(o.consumerName || "").trim().toLowerCase() !== me) continue;
        if (String(o.address || "").trim().toLowerCase() !== addr) continue;
        if (normalizeStatus(o.status) === "cancelled") continue;
        const k = getOrderDateTimeSortKey(o);
        if (k < myKey && (!best || k > bestKey)) {
            best = o;
            bestKey = k;
        }
    }
    return best;
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

function getSupplierStatusLabel(order) {
    const status = normalizeStatus(order?.status);
    if (order?.cancelRequest?.status === 'pending' || status === 'cancel_requested') return '취소 요청';
    if (order?.changeRequest?.status === 'pending' || status === 'change_requested') return '변경 요청';
    if (status === 'empty_in_transit') return '공차 입고 중';
    if (status === 'in_transit') return '실차 출고 중';
    if (status === 'empty_arrived') return '공차 도착·충전';
    return getStatusLabel(status);
}

/** 구매 화면 카드: 수요자 관점 입고/이동 문구 */
function getConsumerStatusDisplayLabel(order) {
    const status = normalizeStatus(order?.status);
    if (order?.cancelRequest?.status === 'pending' || status === 'cancel_requested') return '취소 요청';
    if (order?.changeRequest?.status === 'pending' || status === 'change_requested') return '변경 요청';
    if (status === 'empty_in_transit') return '공차 입고 중';
    if (status === 'in_transit') return '실차 입고 중';
    if (status === 'empty_arrived') return '공차 도착·충전';
    return getStatusLabel(status);
}

function getSupplierAdvanceAction(order) {
    const status = normalizeStatus(order?.status);
    switch (status) {
        case 'requested':
            return { label: '접수', next: 'accepted' };
        case 'accepted':
        case 'change_accepted':
            if (isExFactoryOrder(order)) return null;
            return { label: '실차 출발', next: 'in_transit' };
        case 'empty_in_transit':
            if (isExFactoryOrder(order)) {
                return { label: '공차 도착', next: 'empty_arrived' };
            }
            return { label: '공차 도착', next: 'completed' };
        case 'empty_arrived':
            if (!isExFactoryOrder(order)) return null;
            return { label: '실차 출발', next: 'in_transit' };
        case 'collecting':
            if (isExFactoryOrder(order)) return null;
            return { label: '공차 도착', next: 'completed' };
        default:
            return null;
    }
}

function getConsumerAdvanceAction(order) {
    const status = normalizeStatus(order?.status);
    if (isExFactoryOrder(order)) {
        switch (status) {
            case 'accepted':
            case 'change_accepted':
                return { label: '공차 출발', next: 'empty_in_transit' };
            case 'in_transit':
                return { label: '실차 도착', next: 'completed' };
            default:
                return null;
        }
    }
    switch (status) {
        case 'in_transit':
            if (isExFactoryOrder(order)) {
                return { label: '실차 도착', next: 'completed' };
            }
            return null;
        case 'arrived':
            return { label: '공차 출고(회수)', next: 'empty_in_transit' };
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

// ========== 뷰 렌더링 ==========
function showView(viewId) {
    document.querySelectorAll('.dashboard-view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById((viewId || '') + 'View');
    if (el) el.classList.add('active');
}

function tickDashboardClock() {
    const now = new Date();
    let text;
    try {
        text = new Intl.DateTimeFormat('ko-KR', {
            weekday: 'short',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        }).format(now);
    } catch (_) {
        return;
    }
    const iso = now.toISOString();
    document.querySelectorAll('.dashboard-live-clock').forEach((el) => {
        try {
            el.dateTime = iso;
        } catch (_) {}
        el.textContent = text;
    });
}

function setDashboardStatFilter(filterKey) {
    const role = currentUser?.type === 'supplier' ? 'supplier' : 'consumer';
    const current = dashboardStatFilters[role] || 'all';
    // 같은 배너를 다시 누르면 전체 보기로 복귀
    dashboardStatFilters[role] = current === filterKey ? 'all' : filterKey;
}

function isConsumerInProgressStatus(status) {
    // 주문 요청부터 회수 중까지를 "진행 중"으로 간주 (완료/취소 제외)
    return ['requested', 'accepted', 'change_requested', 'change_accepted', 'empty_in_transit', 'empty_arrived', 'in_transit', 'arrived', 'collecting'].includes(status);
}

function isConsumerPendingApprovalStatus(status) {
    // 결재 대기: 변경 요청/변경 접수 상태
    return ['change_requested', 'change_accepted'].includes(status);
}

function updateDashboardStats() {
    const consumerContainer = document.getElementById('consumerDashboardStats');
    const supplierContainer = document.getElementById('supplierDashboardStats');
    const me = String(currentUser?.name || '').trim();

    if (consumerContainer && me) {
        const hidden = new Set(readHiddenConsumerIds());
        const mine = getConsumerOrders(currentUser.name).filter((o) => !hidden.has(o.id));
        const todayP = getTodayParts();
        const tomorrowP = getTomorrowParts();

        const todayDelivery = mine.filter((o) => {
            const st = normalizeStatus(o.status);
            return st !== "cancelled" && isOrderDeliveryOnLocalDay(o, todayP.year, todayP.month, todayP.day);
        });
        const todayAccepted = todayDelivery.filter((o) => normalizeStatus(o.status) !== "requested");
        const todayCompleted = todayDelivery.filter((o) => normalizeStatus(o.status) === "completed");
        const todayIncomplete = todayAccepted.filter((o) => normalizeStatus(o.status) !== "completed");

        const tomorrowDelivery = mine.filter((o) => {
            const st = normalizeStatus(o.status);
            return st !== "cancelled" && isOrderDeliveryOnLocalDay(o, tomorrowP.year, tomorrowP.month, tomorrowP.day);
        });
        const tomorrowCount = tomorrowDelivery.length;

        const tipTodayInner = formatConsumerInsightTooltipPanelHtml("납품일 오늘 · 공급자별", todayDelivery);
        const tipTomorrowInner = formatConsumerInsightTooltipPanelHtml("납품일 내일 · 공급자별", tomorrowDelivery);

        consumerContainer.innerHTML = `
            <div class="insight-stat insight-stat--banner insight-stat--readonly insight-stat--tip order-card-insight-tile" role="listitem" tabindex="0" aria-describedby="insight-consumer-tip-today">
                <span class="insight-stat-label">오늘 주문<span class="insight-stat-label-suffix"> (납품일 기준)</span></span>
                <span class="insight-stat-values-triple" aria-label="접수 완료, 완료, 미완료 순">
                    <span class="insight-stat-value">${todayAccepted.length}</span>
                    <span class="insight-stat-triple-sep">/</span>
                    <span class="insight-stat-value">${todayCompleted.length}</span>
                    <span class="insight-stat-triple-sep">/</span>
                    <span class="insight-stat-value">${todayIncomplete.length}</span>
                </span>
                <div id="insight-consumer-tip-today" class="insight-tooltip-panel" role="tooltip">${tipTodayInner}</div>
            </div>
            <div class="insight-stat insight-stat--banner insight-stat--readonly insight-stat--tip order-card-insight-tile" role="listitem" tabindex="0" aria-describedby="insight-consumer-tip-tomorrow">
                <span class="insight-stat-label">내일 주문<span class="insight-stat-label-suffix"> (납품일 기준)</span></span>
                <span class="insight-stat-value insight-stat-value--solo">${tomorrowCount}</span>
                <div id="insight-consumer-tip-tomorrow" class="insight-tooltip-panel" role="tooltip">${tipTomorrowInner}</div>
            </div>
        `;
    } else if (consumerContainer) {
        consumerContainer.innerHTML = '';
    }

    if (supplierContainer && me) {
        const hidden = new Set(readHiddenSupplierIds());
        const mine = getAllOrders().filter((o) => !hidden.has(o.id));
        const todayP = getTodayParts();
        const tomorrowP = getTomorrowParts();

        const todayDelivery = mine.filter((o) => {
            const st = normalizeStatus(o.status);
            return st !== "cancelled" && isOrderDeliveryOnLocalDay(o, todayP.year, todayP.month, todayP.day);
        });
        const todayAccepted = todayDelivery.filter((o) => normalizeStatus(o.status) !== "requested");
        const todayCompleted = todayDelivery.filter((o) => normalizeStatus(o.status) === "completed");
        const todayIncomplete = todayAccepted.filter((o) => normalizeStatus(o.status) !== "completed");

        const tomorrowDelivery = mine.filter((o) => {
            const st = normalizeStatus(o.status);
            return st !== "cancelled" && isOrderDeliveryOnLocalDay(o, tomorrowP.year, tomorrowP.month, tomorrowP.day);
        });
        const tomorrowCount = tomorrowDelivery.length;

        const tipTodayInner = formatSupplierInsightTooltipPanelHtml("납품일 오늘 · 수요처별", todayDelivery);
        const tipTomorrowInner = formatSupplierInsightTooltipPanelHtml("납품일 내일 · 수요처별", tomorrowDelivery);

        supplierContainer.innerHTML = `
            <div class="insight-stat insight-stat--banner insight-stat--readonly insight-stat--tip order-card-insight-tile" role="listitem" tabindex="0" aria-describedby="insight-supplier-tip-today">
                <span class="insight-stat-label">오늘 주문<span class="insight-stat-label-suffix"> (납품일 기준)</span></span>
                <span class="insight-stat-values-triple" aria-label="접수 완료, 완료, 미완료 순">
                    <span class="insight-stat-value">${todayAccepted.length}</span>
                    <span class="insight-stat-triple-sep">/</span>
                    <span class="insight-stat-value">${todayCompleted.length}</span>
                    <span class="insight-stat-triple-sep">/</span>
                    <span class="insight-stat-value">${todayIncomplete.length}</span>
                </span>
                <div id="insight-supplier-tip-today" class="insight-tooltip-panel" role="tooltip">${tipTodayInner}</div>
            </div>
            <div class="insight-stat insight-stat--banner insight-stat--readonly insight-stat--tip order-card-insight-tile" role="listitem" tabindex="0" aria-describedby="insight-supplier-tip-tomorrow">
                <span class="insight-stat-label">내일 주문<span class="insight-stat-label-suffix"> (납품일 기준)</span></span>
                <span class="insight-stat-value insight-stat-value--solo">${tomorrowCount}</span>
                <div id="insight-supplier-tip-tomorrow" class="insight-tooltip-panel" role="tooltip">${tipTomorrowInner}</div>
            </div>
        `;
    } else if (supplierContainer) {
        supplierContainer.innerHTML = '';
    }
}

function applyConsumerDashboardStatFilter(list) {
    return list;
}

function applySupplierDashboardStatFilter(list) {
    return list;
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
// 출하도: 공차 운송(empty_in_transit) → 공차 도착·충전(empty_arrived) → 실차 운송(in_transit) → 완료
const ORDER_STATUSES = [
    { value: 'requested', label: '주문 요청' },
    { value: 'accepted', label: '접수' },
    { value: 'change_requested', label: '변경 요청' },
    { value: 'change_accepted', label: '변경 접수' },
    { value: 'empty_in_transit', label: '공차 이동 중' },
    { value: 'empty_arrived', label: '공차 도착' },
    { value: 'in_transit', label: '실차 이동 중' },
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

function isExFactoryOrder(order) {
    return order?.supplyCondition === "ex_factory";
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
    // trailers 배열 보장 (손상된 데이터 방지)
    if (!Array.isArray(raw.trailers)) raw.trailers = defaultInventory().trailers;
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
    const trailers = Array.isArray(inv.trailers) ? inv.trailers : [];

    listEl.innerHTML = trailers.map(t => {
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
            const t = inv2.trailers.find(x => x.id === parseInt(inp.dataset.id, 10));
            if (t) {
                t.pressure = Math.max(0, Math.min(INV_MAX_PRESSURE, parseInt(inp.value, 10) || 0));
                saveInventory(inv2);
                renderInventoryPanel();
            }
        });
    });

    listEl.querySelectorAll('.trailer-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const inv2 = readInventory();
            inv2.trailers = inv2.trailers.filter(t => t.id !== parseInt(btn.dataset.id, 10));
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
    if (!list) return;
    const hiddenConsumerIds = new Set(readHiddenConsumerIds());
    let allMyOrders = getConsumerOrders(currentUser.name).filter(o => !hiddenConsumerIds.has(o.id));

    // 조회기간 필터(시작일~종료일)
    let myOrders = allMyOrders;
    const fromInput = document.getElementById('ordersFromDate');
    const toInput = document.getElementById('ordersToDate');
    const fromVal = fromInput?.value;
    const toVal = toInput?.value;
    if (fromVal && toVal) {
        const fromTime = new Date(fromVal + 'T00:00:00').getTime();
        const toTime = new Date(toVal + 'T23:59:59').getTime();
        if (Number.isFinite(fromTime) && Number.isFinite(toTime) && fromTime <= toTime) {
            myOrders = allMyOrders.filter(o => {
                const key = getOrderDateTimeSortKey(o);
                const t = new Date(key.replace(' ', 'T')).getTime();
                return Number.isFinite(t) && t >= fromTime && t <= toTime;
            });
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

    const searchEl = document.getElementById('consumerOrderSearch');
    const q = (searchEl?.value || '').trim().toLowerCase();
    if (q) {
        myOrders = myOrders.filter(
            (o) =>
                String(o.id || '').toLowerCase().includes(q) ||
                String(o.address || '').toLowerCase().includes(q) ||
                String(o.supplierName || '').toLowerCase().includes(q)
        );
    }
    myOrders = applyConsumerDashboardStatFilter(myOrders);

    const consumerColHeader = document.getElementById('consumerOrdersColumnHeader');
    if (myOrders.length === 0) {
        if (consumerColHeader) consumerColHeader.hidden = true;
        if (!allMyOrders.length) {
            list.innerHTML = '<div class="empty-state"><p>등록된 주문이 없습니다.</p><p>새 주문을 등록하세요.</p></div>';
        } else if (q) {
            list.innerHTML =
                '<div class="empty-state"><p>검색 조건에 맞는 주문이 없습니다.</p><p>검색어를 바꿔 보세요.</p></div>';
        } else {
            const label = fromVal && toVal ? `${fromVal} ~ ${toVal}` : '선택한 기간';
            list.innerHTML = `<div class="empty-state"><p>${label}에는 주문 이력이 없습니다.</p><p>다른 기간을 선택해 보세요.</p></div>`;
        }
        renderInventoryPanel();
        updateDashboardStats();
        renderOrderNotificationPanels();
        return;
    }

    if (consumerColHeader) consumerColHeader.hidden = false;

    list.innerHTML = myOrders.map(order => {
        const cr = order.changeRequest;
        const hasPendingChange = cr && cr.status === 'pending';
        const hasRejectedChange = cr && cr.status === 'rejected';
        const cancelReq = order.cancelRequest;
        const hasPendingCancel = cancelReq && cancelReq.status === 'pending';
        const hasRejectedCancel = cancelReq && cancelReq.status === 'rejected';

        const status = normalizeStatus(order.status);
        const canRequestChange = !hasPendingChange && !hasPendingCancel && ['requested', 'accepted', 'change_accepted', 'empty_in_transit', 'empty_arrived', 'in_transit', 'arrived'].includes(status);
        const canRequestCancel = !hasPendingCancel && !hasPendingChange && !hasRejectedCancel && !['completed', 'cancelled', 'collecting'].includes(status);
        const immediateCancelable = canRequestCancel && canImmediateCancelOrder(order, 'consumer');
        const canCancelChangeRequest = hasPendingChange && cr.requestedBy === 'consumer';

        const canApproveChange = canActorApprovePendingChange(order, 'consumer');
        const canApproveCancel = canActorApprovePendingCancel(order, 'consumer');
        const seenChangeReview = canApproveChange && hasSeenPendingChangeReview(order.id, 'consumer');
        const seenCancelReview = canApproveCancel && hasSeenPendingCancelReview(order.id, 'consumer');
        const hasDecisionRequest = canApproveChange || canApproveCancel;

        const showChangeBtn = canRequestChange && !immediateCancelable;
        const consumerAdvanceAction = !hasPendingChange && !hasPendingCancel ? getConsumerAdvanceAction(order) : null;
        const showDeliverySettle =
            !hasPendingChange &&
            !hasPendingCancel &&
            order.supplyCondition === 'delivery' &&
            status === 'in_transit';
        const showExFactoryFlowKg =
            !hasPendingChange &&
            !hasPendingCancel &&
            order.supplyCondition === 'ex_factory' &&
            status === 'in_transit' &&
            order.exFactoryConsumerSettlementMode === 'flow' &&
            !order.qtySettlement?.exFactoryConsumerFlowDone;
        const actionButtons = `
            ${showDeliverySettle ? `<button type="button" class="btn btn-small btn-primary" data-action="open-delivery-settlement" data-id="${order.id}">실차 도착</button>` : ''}
            ${showExFactoryFlowKg ? `<button type="button" class="btn btn-small btn-primary" data-action="open-exfactory-flow-kg" data-id="${order.id}">유량계 질량(kg) 입력</button>` : ''}
            ${consumerAdvanceAction ? `<button type="button" class="btn btn-small btn-primary" data-action="advance-status" data-next-status="${consumerAdvanceAction.next}" data-id="${order.id}">${consumerAdvanceAction.label}</button>` : ''}
            ${canCancelChangeRequest ? `<button type="button" class="btn btn-small btn-secondary" data-action="cancel-change-request" data-id="${order.id}">변경요청 취소</button>` : ''}
            ${showChangeBtn ? `<button type="button" class="btn btn-small" data-action="request-change" data-id="${order.id}">변경</button>` : ''}
            ${canRequestCancel ? `<button type="button" class="btn btn-small btn-secondary" data-action="request-cancel" data-id="${order.id}">${immediateCancelable ? '즉시 취소' : '취소'}</button>` : ''}
            ${order.supplyCondition === 'delivery' ? `<button type="button" class="btn btn-small btn-secondary" data-action="open-order-map" data-id="${order.id}">지도·출하/회차</button>` : ''}
        `.trim();
        const decisionButtons = `
            ${canApproveChange && !seenChangeReview ? `<button type="button" class="btn btn-small btn-primary" data-action="review-change-request" data-id="${order.id}">확인</button>` : ''}
            ${canApproveChange && seenChangeReview ? `<button type="button" class="btn btn-small btn-primary" data-action="approve-change" data-id="${order.id}">승인</button>
            <button type="button" class="btn btn-small btn-secondary" data-action="reject-change" data-id="${order.id}">반려</button>` : ''}
            ${canApproveCancel && !seenCancelReview ? `<button type="button" class="btn btn-small btn-primary" data-action="review-cancel-request" data-id="${order.id}">확인</button>` : ''}
            ${canApproveCancel && seenCancelReview ? `<button type="button" class="btn btn-small btn-primary" data-action="approve-cancel" data-id="${order.id}">승인</button>
            <button type="button" class="btn btn-small btn-secondary" data-action="reject-cancel" data-id="${order.id}">반려</button>` : ''}
        `.trim();

        const travelTimeMinC = getOrderTravelTimeMinutes(order);
        const travelTimeTextC = travelTimeMinC === 0 ? '—' : `${travelTimeMinC}분`;
        const shipmentDtC = formatShipmentDateTime(order, { viewer: "consumer" });
        const returnDtC = formatReturnDateTime(order, { viewer: "consumer" });
        const shipmentDisplayC = shipmentDtC || '—';
        const returnDisplayC = returnDtC || '—';
        const colFlagsConsumer = orderCardShowShipmentReturnColumns(order, "consumer");
        const mutedSrConsumer = orderCardMutedShipmentReturnBannerCells();
        const shipmentBannerCellC = colFlagsConsumer.showShipment
            ? formatBannerDateTimeDateOnlyHtml(shipmentDtC ? shipmentDisplayC : null, { muted: !shipmentDtC })
            : mutedSrConsumer.shipmentBanner;
        const returnBannerCellC = colFlagsConsumer.showReturn
            ? formatBannerDateTimeDateOnlyHtml(returnDtC ? returnDisplayC : null, { muted: !returnDtC })
            : mutedSrConsumer.returnBanner;
        const shipmentFooterC = colFlagsConsumer.showShipment
            ? formatBannerDateTimeTimeOnlyHtml(shipmentDtC ? shipmentDisplayC : null, { muted: !shipmentDtC })
            : formatBannerDateTimeTimeOnlyHtml(null, { muted: true });
        const returnFooterC = colFlagsConsumer.showReturn
            ? formatBannerDateTimeTimeOnlyHtml(returnDtC ? returnDisplayC : null, { muted: !returnDtC })
            : formatBannerDateTimeTimeOnlyHtml(null, { muted: true });
        const supplyBadgeClassC =
            order.supplyCondition === 'ex_factory' ? 'supply-condition-ex-factory' : 'supply-condition-delivery';
        const { ttLine: ttLineC, driverLine: driverLineC } = getOrderCardTransportDisplay(order);
        const emptyReturnNoteC =
            order.supplyCondition === 'delivery' && order.emptyLegReturnInfo
                ? formatTransportInfoLine(order.emptyLegReturnInfo, '공차 회수')
                : '';
        const emptyReturnNoteFooterC = emptyReturnNoteC
            ? `<div class="order-footer-transport-note">${escapeBannerHtml(emptyReturnNoteC)}</div>`
            : "";
        const { etaCellTop: etaCellInnerC, etaCellFooter: etaFooterC } = buildOrderCardEtaCells(order, travelTimeTextC, "consumer");

        const isCancelled = order.status === 'cancelled';
        const statusLabelC = getConsumerStatusDisplayLabel(order);
        const decisionActionsRow = hasDecisionRequest
            ? `<div class="order-actions order-actions--footer order-actions--decision">${decisionButtons}</div>`
            : '';
        const toolbarActions = [
            decisionActionsRow,
            actionButtons ? `<div class="order-actions order-actions--footer">${actionButtons}</div>` : '',
        ].filter(Boolean).join('');

        const noteTextConsumer = String(order.note || "").trim();
        const footerGridConsumer = buildOrderCardFooterGridHtml({
            orderId: order.id,
            deliveryAddress: order.address,
            footerAddressDisplay: getOrderSupplierAddressDisplay(order),
            driverLine: driverLineC,
            transportNoteHtml: emptyReturnNoteFooterC,
            etaFooterHtml: etaFooterC,
            shipmentFooterHtml: shipmentFooterC,
            returnFooterHtml: returnFooterC,
            variant: "consumer",
            footerStatusActionsHtml: toolbarActions,
            memoText: noteTextConsumer,
        });

        const orderDataRowConsumer = `
            <div class="order-card-data-row">
                <div class="order-card-banner-grid">
                    <div class="order-banner-cell">
                        <div class="order-banner-value order-banner-datetime order-datetime-with-badge-inline">
                            <span class="order-datetime">${formatOrderDateTime(order)}</span>
                            <span class="supply-condition-badge ${supplyBadgeClassC}">${getSupplyConditionLabel(order)}</span>
                        </div>
                    </div>
                    <div class="order-banner-cell">
                        <div class="order-banner-value">
                            <div class="order-banner-strong">${order.supplierName || '—'}</div>
                        </div>
                    </div>
                    <div class="order-banner-cell">
                        <div class="order-banner-value order-banner-value--tt">
                            ${formatOrderBannerTtNumberOnlyHtml(ttLineC, "")}
                        </div>
                    </div>
                    <div class="order-banner-cell">
                        <div class="order-banner-value">${etaCellInnerC}</div>
                    </div>
                    <div class="order-banner-cell">
                        <div class="order-banner-value">${shipmentBannerCellC}</div>
                    </div>
                    <div class="order-banner-cell">
                        <div class="order-banner-value">${returnBannerCellC}</div>
                    </div>
                    <div class="order-banner-cell order-banner-cell--status">
                        <div class="order-banner-value order-banner-status-wrap">
                            <span class="order-status ${status}">${statusLabelC}</span>
                            ${isCancelled ? `<button type="button" class="order-remove-cancelled-btn" data-action="remove-cancelled-consumer" data-id="${order.id}" title="취소 주문 목록에서 삭제">&times;</button>` : ''}
                        </div>
                    </div>
                </div>
            </div>`;

        return `
        <div class="order-item order-item-clickable ${isCancelled ? 'order-item--cancelled' : ''} ${(hasPendingChange || hasRejectedChange || hasPendingCancel || hasRejectedCancel) ? 'has-change-request' : ''}" data-order-id="${order.id}">
            <div class="order-card-flat-scroll">
            ${orderDataRowConsumer}
            <div class="order-card-toolbar">
                <div class="order-card-toolbar-primary">
                    ${footerGridConsumer}
                </div>
            </div>
            </div>
        </div>
    `}).join('');

    list.querySelectorAll('.order-item-clickable[data-order-id]').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            const orderId = el.dataset.orderId;
            openQtyConfirmModal(orderId);
        });
    });

    renderInventoryPanel();
    updateDashboardStats();
    renderOrderNotificationPanels();
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

        const canApproveChange = showActions && canActorApprovePendingChange(o, 'supplier');
        const canApproveCancel = showActions && canActorApprovePendingCancel(o, 'supplier');
        const seenChangeReviewT = canApproveChange && hasSeenPendingChangeReview(o.id, 'supplier');
        const seenCancelReviewT = canApproveCancel && hasSeenPendingCancelReview(o.id, 'supplier');

        const canProposeChange = showActions && !hasPendingChange && !hasPendingCancel && ['requested', 'accepted', 'change_accepted', 'empty_in_transit', 'empty_arrived'].includes(status);
        const canRequestCancel = showActions && !hasPendingChange && !hasPendingCancel && !['completed', 'cancelled'].includes(status);
        const canCancelChangeRequest = showActions && hasPendingChange && o.changeRequest.requestedBy === 'supplier';
        const advanceAction = showActions && !hasPendingChange && !hasPendingCancel ? getSupplierAdvanceAction(o) : null;

        const travelTimeMin = getOrderTravelTimeMinutes(o);
        const travelTimeText = travelTimeMin === 0 ? '—' : `${travelTimeMin}분`;
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
                ${o.transportInfo ? `<div class="change-summary">T/T: ${(o.transportInfo.trailerNumbers || []).join(', ')} · 기사: ${o.transportInfo.driverName || '-'}</div>` : ''}
            </td>
            <td class="table-actions">
                ${isCancelled ? `<button type="button" class="btn btn-tiny order-remove-cancelled-btn" data-action="remove-cancelled-supplier" data-id="${o.id}" title="취소 주문 목록에서 삭제">&times;</button>` : ''}
                ${advanceAction ? `<button type="button" class="btn btn-tiny btn-primary" data-action="advance-status" data-next-status="${advanceAction.next}" data-id="${o.id}">${advanceAction.label}</button>` : ''}
                ${canCancelChangeRequest ? `<button type="button" class="btn btn-tiny btn-secondary" data-action="cancel-change-request" data-id="${o.id}">변경요청 취소</button>` : ''}
                ${canProposeChange ? `<button type="button" class="btn btn-tiny" data-action="request-change" data-id="${o.id}">변경</button>` : ''}
                ${canRequestCancel ? `<button type="button" class="btn btn-tiny btn-secondary" data-action="request-cancel" data-id="${o.id}">취소</button>` : ''}
                ${canApproveChange && !seenChangeReviewT ? `<button type="button" class="btn btn-tiny btn-primary" data-action="review-change-request" data-id="${o.id}">확인</button>` : ''}
                ${canApproveChange && seenChangeReviewT ? `<button type="button" class="btn btn-tiny btn-primary" data-action="approve-change" data-id="${o.id}">승인</button>
                <button type="button" class="btn btn-tiny btn-secondary" data-action="reject-change" data-id="${o.id}">반려</button>` : ''}
                ${canApproveCancel && !seenCancelReviewT ? `<button type="button" class="btn btn-tiny btn-primary" data-action="review-cancel-request" data-id="${o.id}">확인</button>` : ''}
                ${canApproveCancel && seenCancelReviewT ? `<button type="button" class="btn btn-tiny btn-primary" data-action="approve-cancel" data-id="${o.id}">승인</button>
                <button type="button" class="btn btn-tiny btn-secondary" data-action="reject-cancel" data-id="${o.id}">반려</button>` : ''}
            </td>
        </tr>
    `}).join('') || `<tr><td colspan="${colspan}" class="empty-state">주문이 없습니다.</td></tr>`;

    tbody.querySelectorAll('.order-row[data-order-id]').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            const orderId = row.dataset.orderId;
            openQtyConfirmModal(orderId);
        });
    });
}

function renderSupplierOrdersCards() {
    const listEl = document.getElementById('supplierOrdersList');
    if (!listEl) return;
    const hiddenSupplierIds = new Set(readHiddenSupplierIds());
    let allOrders = getAllOrders().filter(o => !hiddenSupplierIds.has(o.id));

    // 기간 필터 적용
    const fromInput = document.getElementById('supplierFromDate');
    const toInput = document.getElementById('supplierToDate');
    const fromVal = fromInput?.value;
    const toVal = toInput?.value;
    if (fromVal && toVal) {
        const fromTime = new Date(fromVal + 'T00:00:00').getTime();
        const toTime = new Date(toVal + 'T23:59:59').getTime();
        if (Number.isFinite(fromTime) && Number.isFinite(toTime) && fromTime <= toTime) {
            allOrders = allOrders.filter(o => {
                const key = getOrderDateTimeSortKey(o);
                const t = new Date(key.replace(' ', 'T')).getTime();
                return Number.isFinite(t) && t >= fromTime && t <= toTime;
            });
        }
    }

    // 납품일시 오름차순 정렬
    let ordersForView = allOrders.slice().sort((a, b) => {
        const ka = getOrderDateTimeSortKey(a);
        const kb = getOrderDateTimeSortKey(b);
        const byDateTime = ka.localeCompare(kb);
        if (byDateTime !== 0) return byDateTime;
        return String(a.id || '').localeCompare(String(b.id || ''));
    });

    const supSearchEl = document.getElementById('supplierOrderSearch');
    const sq = (supSearchEl?.value || '').trim().toLowerCase();
    if (sq) {
        ordersForView = ordersForView.filter(
            (o) =>
                String(o.id || '').toLowerCase().includes(sq) ||
                String(o.address || '').toLowerCase().includes(sq) ||
                String(o.consumerName || '').toLowerCase().includes(sq)
        );
    }
    ordersForView = applySupplierDashboardStatFilter(ordersForView);

    const supplierColHeader = document.getElementById('supplierOrdersColumnHeader');
    if (ordersForView.length === 0) {
        if (supplierColHeader) supplierColHeader.hidden = true;
        if (sq) {
            listEl.innerHTML = '<div class="empty-state"><p>검색 조건에 맞는 주문이 없습니다.</p><p>검색어를 바꿔 보세요.</p></div>';
        } else {
            listEl.innerHTML = '<div class="empty-state"><p>표시할 주문이 없습니다.</p><p>기간을 변경해 보세요.</p></div>';
        }
        return;
    }

    if (supplierColHeader) supplierColHeader.hidden = false;

    listEl.innerHTML = ordersForView.map(o => {
        const status = normalizeStatus(o.status);
        const hasPendingChange = o.changeRequest && o.changeRequest.status === 'pending';
        const hasPendingCancel = o.cancelRequest && o.cancelRequest.status === 'pending';

        const canApproveChange = canActorApprovePendingChange(o, 'supplier');
        const canApproveCancel = canActorApprovePendingCancel(o, 'supplier');
        const seenChangeReviewS = canApproveChange && hasSeenPendingChangeReview(o.id, 'supplier');
        const seenCancelReviewS = canApproveCancel && hasSeenPendingCancelReview(o.id, 'supplier');
        const decisionButtonsSupplier = `
            ${canApproveChange && !seenChangeReviewS ? `<button type="button" class="btn btn-small btn-primary" data-action="review-change-request" data-id="${o.id}">확인</button>` : ''}
            ${canApproveChange && seenChangeReviewS ? `<button type="button" class="btn btn-small btn-primary" data-action="approve-change" data-id="${o.id}">승인</button>
            <button type="button" class="btn btn-small btn-secondary" data-action="reject-change" data-id="${o.id}">반려</button>` : ''}
            ${canApproveCancel && !seenCancelReviewS ? `<button type="button" class="btn btn-small btn-primary" data-action="review-cancel-request" data-id="${o.id}">확인</button>` : ''}
            ${canApproveCancel && seenCancelReviewS ? `<button type="button" class="btn btn-small btn-primary" data-action="approve-cancel" data-id="${o.id}">승인</button>
            <button type="button" class="btn btn-small btn-secondary" data-action="reject-cancel" data-id="${o.id}">반려</button>` : ''}
        `.trim();
        const hasSupplierDecision = canApproveChange || canApproveCancel;

        const canProposeChange = !hasPendingChange && !hasPendingCancel && ['requested', 'accepted', 'change_accepted', 'empty_in_transit', 'empty_arrived'].includes(status);
        const canRequestCancel = !hasPendingChange && !hasPendingCancel && !['completed', 'cancelled'].includes(status);
        const canCancelChangeRequest = hasPendingChange && o.changeRequest.requestedBy === 'supplier';
        const advanceAction = !hasPendingChange && !hasPendingCancel ? getSupplierAdvanceAction(o) : null;

        const travelTimeMin = getOrderTravelTimeMinutes(o);
        const travelTimeText = travelTimeMin === 0 ? '—' : `${travelTimeMin}분`;
        const noteText = String(o.note || '').trim();

        const supplierStatus = getSupplierStatusLabel(o);
        const supplyLabel = getSupplyConditionLabel(o);
        const supplyBadgeClass = o.supplyCondition === 'ex_factory' ? 'supply-condition-ex-factory' : 'supply-condition-delivery';

        const isCancelled = o.status === 'cancelled';

        const shipmentDt = formatShipmentDateTime(o, { viewer: "supplier" });
        const returnDt = formatReturnDateTime(o, { viewer: "supplier" });
        const shipmentDisplay = shipmentDt || '—';
        const returnDisplay = returnDt || '—';
        const colFlagsSupplier = orderCardShowShipmentReturnColumns(o, "supplier");
        const mutedSrSupplier = orderCardMutedShipmentReturnBannerCells();
        const shipmentBannerCellS = colFlagsSupplier.showShipment
            ? formatBannerDateTimeDateOnlyHtml(shipmentDt ? shipmentDisplay : null, { muted: !shipmentDt })
            : mutedSrSupplier.shipmentBanner;
        const returnBannerCellS = colFlagsSupplier.showReturn
            ? formatBannerDateTimeDateOnlyHtml(returnDt ? returnDisplay : null, { muted: !returnDt })
            : mutedSrSupplier.returnBanner;
        const shipmentFooterS = colFlagsSupplier.showShipment
            ? formatBannerDateTimeTimeOnlyHtml(shipmentDt ? shipmentDisplay : null, { muted: !shipmentDt })
            : formatBannerDateTimeTimeOnlyHtml(null, { muted: true });
        const returnFooterS = colFlagsSupplier.showReturn
            ? formatBannerDateTimeTimeOnlyHtml(returnDt ? returnDisplay : null, { muted: !returnDt })
            : formatBannerDateTimeTimeOnlyHtml(null, { muted: true });

        const { ttLine, driverLine } = getOrderCardTransportDisplay(o);
        const emptyReturnNoteS =
            o.supplyCondition === 'delivery' && o.emptyLegReturnInfo
                ? formatTransportInfoLine(o.emptyLegReturnInfo, '공차 회수')
                : '';
        const emptyReturnNoteFooterS = emptyReturnNoteS
            ? `<div class="order-footer-transport-note">${escapeBannerHtml(emptyReturnNoteS)}</div>`
            : "";
        const { etaCellTop: etaCellInner, etaCellFooter: etaFooterS } = buildOrderCardEtaCells(o, travelTimeText, "supplier");
        const canEditExFactoryCharge =
            o.supplyCondition === "ex_factory" &&
            status === "empty_arrived" &&
            !hasPendingChange &&
            !hasPendingCancel;
        const actionButtons = `
            ${advanceAction ? `<button type="button" class="btn btn-small btn-primary" data-action="advance-status" data-next-status="${advanceAction.next}" data-id="${o.id}">${advanceAction.label}</button>` : ''}
            ${canEditExFactoryCharge ? `<button type="button" class="btn btn-small btn-secondary" data-action="edit-exfactory-charge" data-id="${o.id}">충전완료 수정</button>` : ''}
            ${canCancelChangeRequest ? `<button type="button" class="btn btn-small btn-secondary" data-action="cancel-change-request" data-id="${o.id}">변경요청 취소</button>` : ''}
            ${canProposeChange ? `<button type="button" class="btn btn-small" data-action="request-change" data-id="${o.id}">변경</button>` : ''}
            ${canRequestCancel ? `<button type="button" class="btn btn-small btn-secondary" data-action="request-cancel" data-id="${o.id}">취소</button>` : ''}
        `.trim();

        const supplierToolbarActions = [
            hasSupplierDecision ? `<div class="order-actions order-actions--footer order-actions--decision">${decisionButtonsSupplier}</div>` : '',
            actionButtons ? `<div class="order-actions order-actions--footer order-actions--supplier">${actionButtons}</div>` : '',
        ].filter(Boolean).join('');

        const footerGridSupplier = buildOrderCardFooterGridHtml({
            orderId: o.id,
            deliveryAddress: o.address,
            footerAddressDisplay: o.address,
            driverLine,
            transportNoteHtml: emptyReturnNoteFooterS,
            etaFooterHtml: etaFooterS,
            shipmentFooterHtml: shipmentFooterS,
            returnFooterHtml: returnFooterS,
            variant: "supplier",
            footerStatusActionsHtml: supplierToolbarActions,
            memoText: noteText,
        });

        const orderDataRowSupplier = `
            <div class="order-card-data-row">
                <div class="order-card-banner-grid">
                    <div class="order-banner-cell">
                        <div class="order-banner-value order-banner-datetime order-datetime-with-badge-inline">
                            <span class="order-datetime">${formatOrderDateTime(o)}</span>
                            <span class="supply-condition-badge ${supplyBadgeClass}">${supplyLabel}</span>
                        </div>
                    </div>
                    <div class="order-banner-cell">
                        <div class="order-banner-value">
                            <div class="order-banner-strong">${o.consumerName || '—'}</div>
                        </div>
                    </div>
                    <div class="order-banner-cell">
                        <div class="order-banner-value order-banner-value--tt">
                            ${formatOrderBannerTtNumberOnlyHtml(ttLine, "")}
                        </div>
                    </div>
                    <div class="order-banner-cell">
                        <div class="order-banner-value">${etaCellInner}</div>
                    </div>
                    <div class="order-banner-cell">
                        <div class="order-banner-value">${shipmentBannerCellS}</div>
                    </div>
                    <div class="order-banner-cell">
                        <div class="order-banner-value">${returnBannerCellS}</div>
                    </div>
                    <div class="order-banner-cell order-banner-cell--status">
                        <div class="order-banner-value order-banner-status-wrap">
                            <span class="order-status ${status}">${supplierStatus}</span>
                            ${isCancelled ? `<button type="button" class="order-remove-cancelled-btn" data-action="remove-cancelled-supplier" data-id="${o.id}" title="취소 주문 목록에서 삭제">&times;</button>` : ''}
                        </div>
                    </div>
                </div>
            </div>`;

        return `
        <div class="order-item order-item-supplier order-item-clickable ${isCancelled ? 'order-item--cancelled' : ''} ${(hasPendingChange || hasPendingCancel) ? 'has-change-request' : ''}" data-order-id="${o.id}">
            <div class="order-card-flat-scroll">
            ${orderDataRowSupplier}
            <div class="order-card-toolbar">
                <div class="order-card-toolbar-primary">
                    ${footerGridSupplier}
                </div>
            </div>
            </div>
        </div>
        `;
    }).join('');

    listEl.querySelectorAll('.order-item-clickable[data-order-id]').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            const orderId = el.dataset.orderId;
            openQtyConfirmModal(orderId);
        });
    });
}

function openQtyConfirmModal(orderId, trailerNo) {
    const order = orders.find((o) => o.id === orderId);
    let tt = trailerNo != null && String(trailerNo).trim() ? String(trailerNo).trim() : '';
    if (!tt && order?.qtySettlement?.byTrailer && typeof order.qtySettlement.byTrailer === 'object') {
        const ks = Object.keys(order.qtySettlement.byTrailer);
        if (ks.length === 1) tt = ks[0];
        else if (ks.length > 1) tt = ks[0];
    }
    const iframe = document.getElementById('qtyConfirmIframe');
    const modal = document.getElementById('qtyConfirmModal');
    if (iframe && modal) {
        const q = tt ? `&trailerNo=${encodeURIComponent(tt)}` : '';
        iframe.src = '물량확인증_양식.html?orderId=' + encodeURIComponent(orderId) + '&embed=1' + q;
        modal.classList.add('active');
    }
}

function closeQtyConfirmModal() {
    const iframe = document.getElementById('qtyConfirmIframe');
    const modal = document.getElementById('qtyConfirmModal');
    if (iframe && modal) {
        modal.classList.remove('active');
        iframe.src = 'about:blank';
    }
}

function renderSupplierView() {
    renderSupplierOrdersCards();
    updateDashboardStats();
    renderOrderNotificationPanels();
}

// ========== 주문 지도 모달 ==========
let orderMapInstance = null;

function isoToDatetimeLocalValue(iso) {
    const d = parseIsoToDate(iso);
    if (!d) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 출하도: 충전 완료 시각이 타임라인과 맞는지 검사 */
function validateExFactoryChargeCompletedAt(order, chargeIso) {
    const charge = parseIsoToDate(chargeIso);
    if (!charge || !Number.isFinite(charge.getTime())) return "올바른 일시를 입력해 주세요.";
    const now = Date.now();
    if (charge.getTime() > now + 5 * 60 * 1000) {
        return "충전 완료 시각은 현재 시각 이후로 둘 수 없습니다.";
    }
    const emptyLeg = order.emptyLegStartedAt ? parseIsoToDate(order.emptyLegStartedAt) : null;
    if (emptyLeg && charge.getTime() < emptyLeg.getTime()) {
        return "충전 완료 시각은 수요자 공차 출발 시각 이후여야 합니다.";
    }
    const loaded = order.transportStartedAt ? parseIsoToDate(order.transportStartedAt) : null;
    if (loaded && charge.getTime() > loaded.getTime()) {
        return "충전 완료 시각은 실차 출발 시각 이전이어야 합니다.";
    }
    return null;
}

function openExFactoryChargeModal(orderId, mode) {
    const order = orders.find((o) => o.id === orderId);
    const modal = document.getElementById("exFactoryChargeModal");
    const idEl = document.getElementById("exFactoryChargeOrderId");
    const modeEl = document.getElementById("exFactoryChargeMode");
    const dtEl = document.getElementById("exFactoryChargeDatetime");
    const titleEl = document.getElementById("exFactoryChargeModalTitle");
    const hintEl = document.getElementById("exFactoryChargeModalHint");
    if (!modal || !idEl || !modeEl || !dtEl) return;
    idEl.value = orderId;
    modeEl.value = mode;
    if (titleEl) titleEl.textContent = mode === "edit" ? "충전 완료 시각 수정" : "충전 완료 시각";
    if (hintEl) {
        hintEl.textContent =
            mode === "edit"
                ? "저장된 충전 완료 시각을 수정합니다. 공차 출발·실차 출발 시각과의 선후 관계가 맞아야 합니다."
                : "공차가 공급지에 도착해 충전이 끝난 시각을 입력해 주세요. 수요자 화면에 출하 가능 시각으로 표시됩니다.";
    }
    if (order?.exFactoryChargeCompletedAt) {
        dtEl.value = isoToDatetimeLocalValue(order.exFactoryChargeCompletedAt);
    } else {
        dtEl.value = isoToDatetimeLocalValue(new Date().toISOString());
    }
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
}

function closeExFactoryChargeModal() {
    const modal = document.getElementById("exFactoryChargeModal");
    if (modal) {
        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");
    }
}

function applyExFactoryChargeFromModal() {
    const idEl = document.getElementById("exFactoryChargeOrderId");
    const modeEl = document.getElementById("exFactoryChargeMode");
    const dtEl = document.getElementById("exFactoryChargeDatetime");
    const orderId = idEl?.value;
    const mode = modeEl?.value || "create";
    const raw = dtEl?.value;
    const order = orderId ? orders.find((o) => o.id === orderId) : null;
    if (!order || !isExFactoryOrder(order)) {
        alert("주문을 찾을 수 없습니다.");
        return;
    }
    if (getActorForOrder(order) !== "supplier") {
        alert("공급자만 충전 완료 시각을 등록·수정할 수 있습니다.");
        return;
    }
    if (mode === "edit" && normalizeStatus(order.status) !== "empty_arrived") {
        alert("공차 도착·충전 상태에서만 수정할 수 있습니다.");
        return;
    }
    if (!raw || !String(raw).trim()) {
        alert("충전 완료 일시를 입력해 주세요.");
        return;
    }
    const local = new Date(String(raw).replace(" ", "T"));
    if (!Number.isFinite(local.getTime())) {
        alert("올바른 일시를 입력해 주세요.");
        return;
    }
    const chargeIso = local.toISOString();
    const err = validateExFactoryChargeCompletedAt(order, chargeIso);
    if (err) {
        alert(err);
        return;
    }
    order.exFactoryChargeCompletedAt = chargeIso;
    const nowIso = new Date().toISOString();
    if (mode === "create") {
        order.status = "empty_arrived";
        order.emptyArrivedAt = nowIso;
        appendOrderChangeHistory(order, "ex_factory_charge_completed", "supplier", {
            chargeCompletedAt: chargeIso,
        });
        appendOrderChangeHistory(order, "status_changed", "supplier", {
            to: "empty_arrived",
            at: nowIso,
        });
    } else {
        appendOrderChangeHistory(order, "ex_factory_charge_updated", "supplier", {
            chargeCompletedAt: chargeIso,
        });
    }
    saveOrdersToStorage();
    renderConsumerView();
    renderSupplierView();
    renderOrderNotificationPanels();
    lastOrdersSnapshot = deepClone(orders);
    closeExFactoryChargeModal();
    alert(mode === "create" ? `공차 도착이 등록되었습니다. 충전 완료: ${formatCalendarDateTimeFromDate(local)}` : "충전 완료 시각이 수정되었습니다.");
}

function openOrderMapModal(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const destCoords = getCoordinatesFromAddress(order.address);
    const travelTimeMin = getOrderTravelTimeMinutes(order);
    const isExFactory = order.supplyCondition === 'ex_factory';
    const shipPlan = formatShipmentDateTime(order, { viewer: "consumer" });
    const retPlan = formatReturnDateTime(order, { viewer: "consumer" });
    const planRows =
        !isExFactory && shipPlan && retPlan
            ? `<div class="map-info-row"><strong>출하·회차(계획):</strong> ${escapeBannerHtml(shipPlan)} → ${escapeBannerHtml(
                  retPlan
              )}</div>
        <div class="map-info-row map-info-row--muted">카드에서는 납품 약속과 혼동을 줄이기 위해 숨깁니다. 여기서만 참고하세요.</div>`
            : "";

    document.getElementById('orderMapTitle').textContent = isExFactory ? `주문 ${order.id} - 출하지 픽업` : `주문 ${order.id} - 튜브트레일러 배송 경로`;
    document.getElementById('orderMapInfo').innerHTML = `
        <div class="map-info-row"><strong>수요처:</strong> ${order.consumerName}</div>
        <div class="map-info-row"><strong>공급조건:</strong> ${getSupplyConditionLabel(order)}</div>
        <div class="map-info-row"><strong>${isExFactory ? '픽업지' : '납품지'}:</strong> ${order.address}</div>
        <div class="map-info-row"><strong>트레일러:</strong> ${order.tubeTrailers}대</div>
        <div class="map-info-row"><strong>${isExFactory ? "구간당 편도(공차·실차 추정)" : "생산지→수요처 운송시간"}:</strong> 약 ${travelTimeMin}분</div>
        ${planRows}
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

function toDatetimeLocalValue(d) {
    if (!d || !Number.isFinite(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDatetimeLocalToIso(value) {
    if (!value || typeof value !== "string") return null;
    const t = new Date(value);
    return Number.isFinite(t.getTime()) ? t.toISOString() : null;
}

// mode: 'delivery' | 'loaded_ex_factory' | 'empty_leg'
async function openTransportStartModal(orderId, prefillFromConsumerTransport, mode = "delivery") {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const modeEl = document.getElementById("transportStartMode");
    if (modeEl) modeEl.value = mode;
    const titleEl = document.getElementById("transportStartModalTitle");
    const submitBtn = document.getElementById("transportStartSubmitBtn");
    const depEl = document.getElementById("transportDepartureLocal");
    const now = new Date();
    if (depEl) depEl.value = toDatetimeLocalValue(now);

    if (titleEl) {
        if (mode === "empty_leg") titleEl.textContent = "공차 출발 정보 입력";
        else if (mode === "loaded_ex_factory") titleEl.textContent = "실차 운송 시작 (충전 완료 후)";
        else titleEl.textContent = "운송 시작 정보 입력";
    }
    if (submitBtn) {
        if (mode === "empty_leg") submitBtn.textContent = "공차 출발";
        else if (mode === "loaded_ex_factory") submitBtn.textContent = "실차 운송 시작";
        else submitBtn.textContent = "운송 시작";
    }

    document.getElementById('transportStartOrderId').value = orderId;
    document.getElementById('transportTrailerNumbers').value = '';
    document.getElementById('transportDriverName').value = '';
    const exChg = document.getElementById('transportExFactoryChargeGroup');
    const exFlowHint = document.getElementById('transportExFactoryFlowConsumerHint');
    const volEl = document.getElementById('transportChargeVolumeM3');
    const inPEl = document.getElementById('transportChargeInPressure');
    const outPEl = document.getElementById('transportChargeOutPressure');
    const prevVol = order.trailerVolumeM3Default != null && Number.isFinite(Number(order.trailerVolumeM3Default))
        ? Number(order.trailerVolumeM3Default)
        : DEFAULT_TT_VOLUME_M3;
    if (mode === 'loaded_ex_factory') {
        if (exChg) exChg.classList.remove('is-hidden');
        if (volEl) volEl.value = String(prevVol);
        if (inPEl) inPEl.value = '';
        if (outPEl) outPEl.value = '';
        if (exFlowHint) {
            exFlowHint.classList.toggle(
                'is-hidden',
                order.exFactoryConsumerSettlementMode !== 'flow'
            );
        }
        updateTransportChargePreview();
    } else {
        if (exChg) exChg.classList.add('is-hidden');
    }
    await loadTransportAssetDatalists();
    if (prefillFromConsumerTransport) {
        const ct = order.consumerTransport && typeof order.consumerTransport === "object" ? order.consumerTransport : null;
        const src =
            ct && ((Array.isArray(ct.trailerNumbers) && ct.trailerNumbers.length) || String(ct.driverName || "").trim())
                ? ct
                : hasInboundTransportInfo(order)
                  ? order.transportInfo
                  : null;
        if (src) {
            const ttEl = document.getElementById("transportTrailerNumbers");
            const drvEl = document.getElementById("transportDriverName");
            if (ttEl && Array.isArray(src.trailerNumbers) && src.trailerNumbers.length) {
                ttEl.value = src.trailerNumbers.map((x) => String(x || "").trim()).filter(Boolean).join(", ");
            }
            if (drvEl && src.driverName) drvEl.value = String(src.driverName).trim();
        }
    }
    document.getElementById('transportStartModal').classList.add('active');
}

function closeTransportStartModal() {
    document.getElementById('transportStartModal').classList.remove('active');
}

function updateTransportChargePreview() {
    const volEl = document.getElementById('transportChargeVolumeM3');
    const inPEl = document.getElementById('transportChargeInPressure');
    const outPEl = document.getElementById('transportChargeOutPressure');
    const preview = document.getElementById('transportChargeVolumePreview');
    if (!preview || !volEl || !inPEl || !outPEl) return;
    const v = computeExFactoryChargeVolumeM3(inPEl.value, outPEl.value, parseFloat(volEl.value || ''));
    preview.textContent =
        v != null && Number.isFinite(v)
            ? `산정 부피(차압×내용적): ${v.toLocaleString('ko-KR', { maximumFractionDigits: 3 })} m³`
            : '입고·출고 압력과 내용적을 입력하면 부피(m³)가 표시됩니다.';
}

function closeDeliverySettlementModal() {
    document.getElementById('deliverySettlementModal')?.classList.remove('active');
}

function closeExFactoryFlowKgModal() {
    document.getElementById('exFactoryFlowKgModal')?.classList.remove('active');
}

function wireExFactoryFlowKgRecalc(container) {
    if (!container) return;
    const sync = () => {
        container.querySelectorAll('[data-exflow-block]').forEach((block) => {
            const num = (x) => {
                const n = parseFloat(String(x ?? '').replace(/,/g, ''));
                return Number.isFinite(n) ? n : null;
            };
            const g = (name) => block.querySelector(`[name="${name}"]`);
            const gv = (name) => (g(name)?.value ?? '').trim();
            const refIn = num(gv('flowInRef'));
            const refOut = num(gv('flowOutRef'));
            const curIn = num(gv('flowInCurr'));
            const curOut = num(gv('flowOutCurr'));
            const outEl = block.querySelector('.exfactory-flow-delta-out');
            if (!outEl) return;
            if (refIn == null || refOut == null || curIn == null || curOut == null) {
                outEl.textContent = '—';
                return;
            }
            const d = curOut - curIn - (refOut - refIn);
            outEl.textContent = Number.isFinite(d)
                ? `유량계 차이(kg): ${d.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}`
                : '—';
        });
    };
    container.querySelectorAll('input').forEach((el) => {
        el.addEventListener('input', sync);
    });
    sync();
}

function openExFactoryFlowKgModal(orderId) {
    const order = orders.find((o) => o.id === orderId);
    if (!order || !isExFactoryOrder(order)) return;
    if (order.exFactoryConsumerSettlementMode !== 'flow') return;
    const wrap = document.getElementById('exFactoryFlowKgTrailers');
    const hid = document.getElementById('exFactoryFlowKgOrderId');
    if (!wrap || !hid) return;
    hid.value = orderId;
    const trailers = getOrderTrailerNumbers(order);
    const prevRoot = order.qtySettlement?.byTrailer && typeof order.qtySettlement.byTrailer === 'object'
        ? order.qtySettlement.byTrailer
        : {};
    wrap.innerHTML = trailers
        .map((tt) => {
            const p = findPreviousTrailerQtySnapshot(order.consumerName, order.address, tt, order.id);
            const cur = prevRoot[tt] || {};
            const fr = (k, def = '') => (cur[k] != null && cur[k] !== '' ? String(cur[k]) : def);
            const flowRefIn = fr('consumerFlowInRef', p?.flowInCurr ?? p?.flowOutCurr ?? '');
            const flowRefOut = fr('consumerFlowOutRef', p?.flowOutCurr ?? '');
            return `
            <div class="delivery-settle-tt-block" data-exflow-block data-trailer-id="${String(tt).replace(/"/g, '&quot;')}">
                <h4 class="delivery-settle-tt-title">T/T ${String(tt).replace(/</g, '&lt;')}</h4>
                <p class="delivery-settle-ref-note">유량계 지침(kg) — 기준은 직전 정산 또는 수동</p>
                <table class="delivery-settle-mini-table">
                    <thead><tr><th></th><th>기준 입고</th><th>기준 출고</th><th>현재 입고</th><th>현재 출고</th></tr></thead>
                    <tbody>
                        <tr>
                            <td>kg</td>
                            <td><input type="text" name="flowInRef" value="${String(flowRefIn).replace(/"/g, '&quot;')}"></td>
                            <td><input type="text" name="flowOutRef" value="${String(flowRefOut).replace(/"/g, '&quot;')}"></td>
                            <td><input type="text" name="flowInCurr" value="${fr('consumerFlowInCurr')}"></td>
                            <td><input type="text" name="flowOutCurr" value="${fr('consumerFlowOutCurr')}"></td>
                        </tr>
                    </tbody>
                </table>
                <p class="exfactory-flow-delta-out delivery-settle-delta-out"></p>
            </div>`;
        })
        .join('');
    wireExFactoryFlowKgRecalc(wrap);
    document.getElementById('exFactoryFlowKgModal')?.classList.add('active');
}

function wireDeliverySettlementRecalc(container) {
    if (!container) return;
    const vol = () => parseFloat(document.getElementById('deliverySettleVolume')?.value || '') || DEFAULT_TT_VOLUME_M3;
    const sync = () => {
        container.querySelectorAll('[data-del-settle-block]').forEach((block) => {
            const method = block.querySelector('.delivery-settle-method')?.value || 'flow';
            const snap = {};
            const g = (name) => block.querySelector(`[name="${name}"]`);
            const gv = (name) => (g(name)?.value ?? '').trim();
            snap.flowInRef = gv('flowInRef');
            snap.flowOutRef = gv('flowOutRef');
            snap.flowInCurr = gv('flowInCurr');
            snap.flowOutCurr = gv('flowOutCurr');
            snap.pressureInRef = gv('pressureInRef');
            snap.pressureOutRef = gv('pressureOutRef');
            snap.pressureInCurr = gv('pressureInCurr');
            snap.pressureOutCurr = gv('pressureOutCurr');
            snap.weightBeforeRef = gv('weightBeforeRef');
            snap.weightAfterRef = gv('weightAfterRef');
            snap.weightBeforeCurr = gv('weightBeforeCurr');
            snap.weightAfterCurr = gv('weightAfterCurr');
            const { delta, label } = computeQtyDeltas(method, snap, vol());
            const outEl = block.querySelector('.delivery-settle-delta-out');
            if (outEl) {
                outEl.textContent =
                    delta == null || !Number.isFinite(delta)
                        ? '—'
                        : `${label}: ${delta.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}`;
            }
        });
    };
    container.querySelectorAll('input, select').forEach((el) => {
        el.addEventListener('input', sync);
        el.addEventListener('change', sync);
    });
    const volEl = document.getElementById('deliverySettleVolume');
    if (volEl && !volEl.dataset.settleVolBound) {
        volEl.dataset.settleVolBound = '1';
        volEl.addEventListener('input', sync);
    }
    sync();
}

function syncChainHandoffFlowToCurrent() {
    const handoff = document.getElementById('chainHandoffFlow');
    const v = handoff?.value?.trim() ?? '';
    document.querySelectorAll('.delivery-settle-flow-in-curr-sync').forEach((el) => {
        el.value = v;
    });
    wireDeliverySettlementRecalc(document.getElementById('deliverySettleTrailers'));
}

function openDeliverySettlementModal(orderId) {
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.supplyCondition !== 'delivery') return;
    const wrap = document.getElementById('deliverySettleTrailers');
    const hid = document.getElementById('deliverySettleOrderId');
    const chainHid = document.getElementById('deliverySettleChainPrevId');
    const volInput = document.getElementById('deliverySettleVolume');
    const introEl = document.querySelector('.delivery-settlement-intro');
    if (!wrap || !hid) return;
    hid.value = orderId;
    const prevOrder = findPreviousDeliveryOrderByDeliveryTime(order);
    if (chainHid) chainHid.value = prevOrder?.id || '';

    const volDef =
        order.trailerVolumeM3Default != null && Number.isFinite(Number(order.trailerVolumeM3Default))
            ? Number(order.trailerVolumeM3Default)
            : DEFAULT_TT_VOLUME_M3;
    if (volInput) volInput.value = String(volDef);

    if (introEl) {
        introEl.textContent = prevOrder
            ? '연속 납품입니다. 이전 주문(공차 회수)과 이번 주문(실차 입고)을 한 번에 입력합니다. 유량계 값은 이전 출고 지침과 이번 입고 지침이 동일합니다.'
            : '실차 입고 압력과 전입고 공차 잔압을 입력한 뒤, 정산 방식을 선택하고 기준값 대비 현재값을 입력하면 차이가 자동 계산됩니다.';
    }

    const trailers = getOrderTrailerNumbers(order);
    const prev = order.qtySettlement?.byTrailer && typeof order.qtySettlement.byTrailer === 'object'
        ? order.qtySettlement.byTrailer
        : {};

    const prevTT = prevOrder ? getOrderTrailerNumbers(prevOrder)[0] : '';
    const prevSnap = prevTT && prevOrder?.qtySettlement?.byTrailer?.[prevTT]
        ? prevOrder.qtySettlement.byTrailer[prevTT]
        : {};
    const prevP = prevTT ? findPreviousTrailerQtySnapshot(prevOrder.consumerName, prevOrder.address, prevTT, prevOrder.id) : null;
    const prevDriverDefault =
        prevOrder?.transportInfo?.driverName ||
        prevSnap?.handoffDriverName ||
        '';

    let chainHtml = '';
    if (prevOrder && prevTT) {
        chainHtml = `
        <div class="delivery-settle-chain-block" data-chain-section>
            <h4 class="delivery-settle-chain-title">① 이전 납품 · 주문 ${String(prevOrder.id).replace(/</g, '&lt;')} · T/T ${String(prevTT).replace(/</g, '&lt;')}</h4>
            <div class="form-row form-row-2">
                <div class="form-group">
                    <label for="chainPrevEmptyResidual">공차 잔압 (bar)</label>
                    <input type="text" id="chainPrevEmptyResidual" name="chainPrevEmptyResidual" value="${String(prevSnap?.emptyResidualPressureBar ?? '').replace(/"/g, '&quot;')}" required>
                </div>
                <div class="form-group">
                    <label for="chainDriverName">회수·인계 기사명</label>
                    <input type="text" id="chainDriverName" name="chainDriverName" value="${String(prevDriverDefault).replace(/"/g, '&quot;')}" required>
                </div>
            </div>
            <p class="delivery-settle-ref-note">유량계 (kg) — 이전 T/T 출고 지침 = 아래 이번 T/T 입고 지침과 동일</p>
            <div class="form-row form-row-3">
                <div class="form-group">
                    <label for="chainPrevFlowIn">입고 지침 (kg)</label>
                    <input type="text" id="chainPrevFlowIn" name="chainPrevFlowIn" value="${String(prevSnap?.flowInCurr ?? prevSnap?.consumerFlowInCurr ?? '').replace(/"/g, '&quot;')}">
                </div>
                <div class="form-group">
                    <label for="chainHandoffFlow">출고 = 이번 입고 (kg)</label>
                    <input type="text" id="chainHandoffFlow" name="chainHandoffFlow" value="${String(prevSnap?.flowOutCurr ?? prevSnap?.consumerFlowOutCurr ?? '').replace(/"/g, '&quot;')}" required>
                </div>
            </div>
        </div>`;
    }

    const currentBlocks = trailers
        .map((tt) => {
            const p = findPreviousTrailerQtySnapshot(order.consumerName, order.address, tt, order.id);
            const cur = prev[tt] || {};
            const method = cur.method || 'flow';
            const loadedP = cur.loadedInboundPressureBar ?? '';
            const emptyP = cur.emptyResidualPressureBar ?? '';
            const fr = (k, def = '') => (cur[k] != null && cur[k] !== '' ? String(cur[k]) : def);
            const flowRefIn = fr('flowInRef', p?.flowInCurr ?? p?.flowOutCurr ?? '');
            const flowRefOut = fr('flowOutRef', p?.flowOutCurr ?? '');
            const prInRef = fr('pressureInRef', p?.pressureInCurr ?? '');
            const prOutRef = fr('pressureOutRef', p?.pressureOutCurr ?? '');
            const wBeforeRef = fr('weightBeforeRef', p?.weightAfterCurr ?? p?.weightBeforeCurr ?? '');
            const wAfterRef = fr('weightAfterRef', p?.weightAfterCurr ?? '');
            const flowInInit = fr('flowInCurr');

            return `
            <div class="delivery-settle-tt-block" data-del-settle-block data-trailer-id="${String(tt).replace(/"/g, '&quot;')}">
                <h4 class="delivery-settle-tt-title">② 이번 납품 · 주문 ${String(order.id).replace(/</g, '&lt;')} · T/T ${String(tt).replace(/</g, '&lt;')}</h4>
                <div class="form-row form-row-2">
                    <div class="form-group">
                        <label>실차 입고 압력 (bar)</label>
                        <input type="text" name="loadedInboundPressureBar" class="delivery-settle-loaded-p" value="${String(loadedP).replace(/"/g, '&quot;')}" required>
                    </div>
                    <div class="form-group">
                        <label>전입고 공차 잔압 (bar)</label>
                        <input type="text" name="emptyResidualPressureBar" class="delivery-settle-empty-p" value="${String(emptyP).replace(/"/g, '&quot;')}" required>
                    </div>
                </div>
                <div class="form-group">
                    <label>정산 방법</label>
                    <select name="method" class="delivery-settle-method">
                        <option value="flow" ${method === 'flow' ? 'selected' : ''}>유량계</option>
                        <option value="pressure" ${method === 'pressure' ? 'selected' : ''}>차압</option>
                        <option value="weight" ${method === 'weight' ? 'selected' : ''}>T/T 계량</option>
                    </select>
                </div>
                <div class="delivery-settle-ref-curr">
                    <p class="delivery-settle-ref-note">기준값(직전 정산 저장값 또는 수동 입력)</p>
                    <table class="delivery-settle-mini-table">
                        <thead><tr><th></th><th>기준 입고/전</th><th>기준 출고/후</th><th>현재 입고/전</th><th>현재 출고/후</th></tr></thead>
                        <tbody>
                            <tr class="delivery-row-flow" style="display:${method === 'flow' ? 'table-row' : 'none'}">
                                <td>유량계(kg)</td>
                                <td><input type="text" name="flowInRef" value="${String(flowRefIn).replace(/"/g, '&quot;')}"></td>
                                <td><input type="text" name="flowOutRef" value="${String(flowRefOut).replace(/"/g, '&quot;')}"></td>
                                <td><input type="text" name="flowInCurr" class="delivery-settle-flow-in-curr-sync" value="${String(prevOrder ? '' : flowInInit).replace(/"/g, '&quot;')}" ${prevOrder ? 'readonly' : ''}></td>
                                <td><input type="text" name="flowOutCurr" value="${fr('flowOutCurr')}"></td>
                            </tr>
                            <tr class="delivery-row-pressure" style="display:${method === 'pressure' ? 'table-row' : 'none'}">
                                <td>차압(bar)</td>
                                <td><input type="text" name="pressureInRef" value="${String(prInRef).replace(/"/g, '&quot;')}"></td>
                                <td><input type="text" name="pressureOutRef" value="${String(prOutRef).replace(/"/g, '&quot;')}"></td>
                                <td><input type="text" name="pressureInCurr" value="${fr('pressureInCurr')}"></td>
                                <td><input type="text" name="pressureOutCurr" value="${fr('pressureOutCurr')}"></td>
                            </tr>
                            <tr class="delivery-row-weight" style="display:${method === 'weight' ? 'table-row' : 'none'}">
                                <td>중량(kg)</td>
                                <td><input type="text" name="weightBeforeRef" value="${String(wBeforeRef).replace(/"/g, '&quot;')}"></td>
                                <td><input type="text" name="weightAfterRef" value="${String(wAfterRef).replace(/"/g, '&quot;')}"></td>
                                <td><input type="text" name="weightBeforeCurr" value="${fr('weightBeforeCurr')}"></td>
                                <td><input type="text" name="weightAfterCurr" value="${fr('weightAfterCurr')}"></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p class="delivery-settle-delta-out"></p>
            </div>`;
        })
        .join('');

    wrap.innerHTML = chainHtml + currentBlocks;

    document.getElementById('chainHandoffFlow')?.addEventListener('input', syncChainHandoffFlowToCurrent);
    syncChainHandoffFlowToCurrent();

    wrap.querySelectorAll('.delivery-settle-method').forEach((sel) => {
        sel.addEventListener('change', () => {
            const block = sel.closest('[data-del-settle-block]');
            if (!block) return;
            const m = sel.value;
            const show = (cls, on) => {
                const row = block.querySelector(cls);
                if (row) row.style.display = on ? 'table-row' : 'none';
            };
            show('.delivery-row-flow', m === 'flow');
            show('.delivery-row-pressure', m === 'pressure');
            show('.delivery-row-weight', m === 'weight');
        });
    });

    wireDeliverySettlementRecalc(wrap);
    document.getElementById('deliverySettlementModal')?.classList.add('active');
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
        <p><strong>주문 ${escapeBannerHtml(order.id)}</strong></p>
        <p>${cr.requestedBy === 'supplier' ? '공급자' : '수요자'}가 아래와 같이 변경을 요청했습니다.</p>
        <p class="change-summary">요약: ${escapeBannerHtml(summary)}</p>
        <div class="change-diff">
            <p><strong>현재:</strong> ${order.year}/${order.month}/${order.day} ${formatTimeText(order.time)}, 트레일러 ${order.tubeTrailers}대</p>
            <p><strong>변경 후:</strong> ${cr.proposed.year}/${cr.proposed.month}/${cr.proposed.day} ${formatTimeText(cr.proposed.time)}, 트레일러 ${cr.proposed.tubeTrailers}대</p>
            <p><strong>주소:</strong> ${escapeBannerHtml(cr.proposed.address || order.address)}</p>
        </div>
    `;
    document.getElementById('approvalModalTitle').textContent = '주문 변경 요청 확인';
    document.getElementById('changeApprovalModal').classList.add('active');
    document.getElementById('changeApprovalModal')?.setAttribute('aria-hidden', 'false');
}

function openCancelApprovalModal(orderId) {
    const order = orders.find((o) => o.id === orderId);
    if (!order || !order.cancelRequest || order.cancelRequest.status !== "pending") return;
    pendingCancelApprovalOrderId = orderId;
    const cr = order.cancelRequest;
    const body = document.getElementById("cancelApprovalModalBody");
    const reqBy = cr.requestedBy === "supplier" ? "공급자" : "수요자";
    const reason = String(cr.requestReason || "").trim();
    if (body) {
        body.innerHTML = `
        <p><strong>주문 ${escapeBannerHtml(order.id)}</strong></p>
        <p>${reqBy}가 주문 취소를 요청했습니다.</p>
        ${reason ? `<p class="change-summary">사유: ${escapeBannerHtml(reason)}</p>` : "<p class=\"change-summary\">별도 사유 없음</p>"}
        <p class="supplier-modal-hint" style="margin-top:0.5rem;">승인 시 주문이 취소되고, 반려 시 이전 상태로 돌아갑니다.</p>
        `;
    }
    const modal = document.getElementById("cancelApprovalModal");
    modal?.classList.add("active");
    modal?.setAttribute("aria-hidden", "false");
}

function closeCancelApprovalModal() {
    pendingCancelApprovalOrderId = null;
    const modal = document.getElementById("cancelApprovalModal");
    modal?.classList.remove("active");
    modal?.setAttribute("aria-hidden", "true");
}

function applyChange(orderId, approved) {
    const order = orders.find(o => o.id === orderId);
    if (!order || !order.changeRequest) return;
    clearSeenChangeReviewForOrder(order);

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
        order.acceptedAt = decidedAt;
        appendOrderChangeHistory(order, "change_approved", decidedBy, {
            requestedBy,
            summary,
            proposed: p,
        });
    } else {
        order.lastChange = { result: 'rejected', summary, decidedAt, decidedBy, requestedBy };
        order.changeRequest.status = 'rejected';
        order.changeRequest.decidedAt = decidedAt;
        order.changeRequest.decidedBy = decidedBy;
        order.status = order.changeRequest.originalStatus || 'accepted';
        appendOrderChangeHistory(order, "change_rejected", decidedBy, {
            requestedBy,
            summary,
        });
    }

    saveOrdersToStorage();
    pendingApprovalOrderId = null;
    document.getElementById('changeApprovalModal').classList.remove('active');
    document.getElementById('changeApprovalModal')?.setAttribute('aria-hidden', 'true');
    renderConsumerView();
    renderSupplierView();
}

function appendOrderChangeHistory(order, eventType, actor, details = {}) {
    if (!order) return;
    if (!Array.isArray(order.changeHistory)) order.changeHistory = [];
    order.changeHistory.push({
        eventType,
        actor,
        details,
        at: new Date().toISOString(),
    });
}

const ORDER_NOTIF_SEEN_PREFIX = "h2go_order_notif_seen_v1_";

function escapeNotificationText(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function getOrderNotifSeenKey(role) {
    const user = String(currentUser?.name || "").trim();
    return ORDER_NOTIF_SEEN_PREFIX + role + "_" + encodeURIComponent(user || "anon");
}

function getOrderNotifSeenTs(role) {
    const key = getOrderNotifSeenKey(role);
    try {
        const v = localStorage.getItem(key);
        if (v == null) {
            const n = Date.now();
            localStorage.setItem(key, String(n));
            return n;
        }
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : Date.now();
    } catch (_) {
        return Date.now();
    }
}

function getOrderNotifAckKey(role) {
    const user = String(currentUser?.name || "").trim();
    return "h2go_order_notif_ack_v1_" + role + "_" + encodeURIComponent(user || "anon");
}

function getOrderNotifAckSet(role) {
    try {
        const raw = localStorage.getItem(getOrderNotifAckKey(role));
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr.filter(Boolean) : []);
    } catch (_) {
        return new Set();
    }
}

function setOrderNotifAckSet(role, set) {
    try {
        const arr = [...set].slice(-400);
        localStorage.setItem(getOrderNotifAckKey(role), JSON.stringify(arr));
    } catch (_) {}
}

/** 알림 건별 읽음(클릭) 키 — 주문 ID + 이력 시각 */
function notifStableItemKey(orderId, atIso) {
    return String(orderId ?? "") + "\t" + String(atIso ?? "");
}

function ackOrderNotifItem(role, orderId, atIso) {
    const set = getOrderNotifAckSet(role);
    set.add(notifStableItemKey(orderId, atIso));
    setOrderNotifAckSet(role, set);
}

function clearOrderNotifAckSet(role) {
    try {
        localStorage.removeItem(getOrderNotifAckKey(role));
    } catch (_) {}
}

function setOrderNotifSeenNow(role) {
    try {
        localStorage.setItem(getOrderNotifSeenKey(role), String(Date.now()));
        clearOrderNotifAckSet(role);
    } catch (_) {}
}

function isOrderNotifEntryUnread(role, it, seenTs, ackSet) {
    if (it.ts <= seenTs) return false;
    return !ackSet.has(notifStableItemKey(it.orderId, it.atIso));
}

function isOrderInDashboardDateRange(order, role) {
    const fromId = role === "consumer" ? "ordersFromDate" : "supplierFromDate";
    const toId = role === "consumer" ? "ordersToDate" : "supplierToDate";
    const fromVal = document.getElementById(fromId)?.value;
    const toVal = document.getElementById(toId)?.value;
    if (!fromVal || !toVal || !order) return true;
    const fromTime = new Date(fromVal + "T00:00:00").getTime();
    const toTime = new Date(toVal + "T23:59:59").getTime();
    if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || fromTime > toTime) return true;
    const key = getOrderDateTimeSortKey(order);
    const t = new Date(String(key).replace(" ", "T")).getTime();
    return Number.isFinite(t) && t >= fromTime && t <= toTime;
}

function focusDashboardOrderFromNotif(role, orderId) {
    if (orderId == null || String(orderId) === "") return;
    const order = orders.find((o) => o && String(o.id) === String(orderId));
    if (!order) {
        alert("주문을 찾을 수 없습니다.");
        return;
    }

    const run = () => {
        if (!isOrderInDashboardDateRange(order, role)) {
            alert(
                "해당 주문이 현재 조회기간에 포함되어 있지 않습니다. 조회기간 상자에서 기간을 조정한 뒤 다시 시도해 주세요."
            );
            return;
        }
        if (role === "consumer") renderConsumerView();
        else renderSupplierView();

        requestAnimationFrame(() => {
            const listSel = role === "consumer" ? "#consumerOrdersList" : "#supplierOrdersList";
            const el = document.querySelector(
                `${listSel} .order-item[data-order-id="${cssEscapeForSelector(orderId)}"]`
            );
            if (!el) {
                alert(
                    "주문이 목록에 표시되지 않습니다. 검색어를 지우거나 조회기간·필터를 확인해 주세요."
                );
                return;
            }
            const scrollWrap = el.closest(".orders-table-hscroll") || el.closest(".orders-list");
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            if (scrollWrap && scrollWrap !== el.parentElement) {
                const er = el.getBoundingClientRect();
                const wr = scrollWrap.getBoundingClientRect();
                if (er.left < wr.left || er.right > wr.right) {
                    el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
                }
            }
            el.classList.remove("order-item--notif-focus");
            void el.offsetWidth;
            el.classList.add("order-item--notif-focus");
            window.setTimeout(() => el.classList.remove("order-item--notif-focus"), 2600);
        });
    };

    const rs = document.getElementById("roleSelect");
    if (rs && rs.value !== role) {
        rs.value = role;
        rs.dispatchEvent(new Event("change", { bubbles: true }));
        window.setTimeout(run, 80);
    } else {
        run();
    }
}

function cssEscapeForSelector(val) {
    const s = String(val ?? "");
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(s);
    return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formatNotifListTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** 이력 actor(consumer|supplier|system|기타) → 화면에 쓸 사용자·역할 표시명 */
function formatActorNameForNotif(order, h) {
    const raw = String(h?.actor ?? "").trim();
    if (!raw || raw === "system") return "시스템";
    if (raw === "consumer") {
        const n = String(order?.consumerName ?? "").trim();
        return n || "수요자";
    }
    if (raw === "supplier") {
        const n = String(order?.supplierName ?? "").trim();
        return n || "공급자";
    }
    return raw || "—";
}

function formatHistoryNotification(order, h, viewerRole) {
    const et = h.eventType;
    const d = h.details || {};
    const oid = order.id || "";
    const otherParty =
        viewerRole === "consumer" ? order.supplierName || "공급자" : order.consumerName || "수요자";

    switch (et) {
        case "created":
            return { title: "새 주문", text: `${oid} · ${otherParty}에게 주문이 전달되었습니다.` };
        case "status_changed": {
            const toLab = d.to ? getStatusLabel(normalizeStatus(d.to)) : "상태 변경";
            return { title: "주문 상태 변경", text: `${oid} · ${toLab}` };
        }
        case "change_requested": {
            const by = h.actor === "supplier" ? "공급자" : "수요자";
            let extra = "";
            if (d.proposed && order) {
                try {
                    extra = summarizeChange(order, d.proposed);
                } catch (_) {}
            }
            return { title: "납품 변경 요청", text: `${oid} · ${by} 요청${extra ? ` · ${extra}` : ""}` };
        }
        case "change_approved":
            return { title: "변경 요청 승인", text: `${oid} · 변경이 반영되었습니다.` };
        case "change_rejected": {
            const sum = d.summary ? ` · 요청 내용: ${d.summary}` : "";
            return { title: "변경 요청 반려", text: `${oid} · 변경이 반려되었습니다.${sum}` };
        }
        case "change_request_cancelled":
            return { title: "변경 요청 취소", text: `${oid} · 대기 중이던 변경 요청이 취소되었습니다.` };
        case "cancel_requested": {
            const r = d.reason ? ` · 사유: ${d.reason}` : "";
            return { title: "취소 요청", text: `${oid} · 상대방이 주문 취소를 요청했습니다.${r}` };
        }
        case "cancel_approved":
            return { title: "취소 승인", text: `${oid} · 주문이 취소되었습니다.` };
        case "cancel_rejected": {
            const r = d.reason ? ` (${d.reason})` : "";
            return { title: "취소 요청 반려", text: `${oid} · 취소 요청이 반려되었습니다.${r}` };
        }
        case "cancelled_immediately":
            return { title: "즉시 취소", text: `${oid} · 주문이 즉시 취소되었습니다.` };
        case "transport_started": {
            const drv = d.driverName ? ` · 기사 ${d.driverName}` : "";
            return { title: "실차 운송 시작", text: `${oid} · 실차 운송이 시작되었습니다.${drv}` };
        }
        case "empty_leg_started":
            return { title: "공차 운송 시작", text: `${oid} · 공차 운송이 시작되었습니다.` };
        case "ex_factory_charge_completed":
            if (viewerRole === "consumer") {
                return {
                    title: "출하 가능 시각",
                    text: `${oid} · 공급자가 충전 완료 시각을 등록했습니다. 주문 카드에서 확인하세요.`,
                };
            }
            return { title: "충전 완료 등록", text: `${oid} · 충전 완료 시각이 저장되었습니다.` };
        case "ex_factory_charge_updated":
            return { title: "충전 완료 시각 수정", text: `${oid} · 충전 완료 시각이 변경되었습니다.` };
        case "delivery_qty_settled":
            return { title: "물량 정산", text: `${oid} · 실차 도착 물량이 정산되었습니다.` };
        case "ex_factory_consumer_flow":
            return { title: "유량계 질량 입력", text: `${oid} · 출하도 유량 정보가 반영되었습니다.` };
        case "delivery_chain_prev_updated":
            return { title: "연속 납품 연계", text: `${oid} · 직전 주문과 물량이 연계되었습니다.` };
        case "tt_outbound_confirmed":
            return { title: "T/T 출고 확인", text: `${oid} · 출고 물량·서명이 확인되었습니다.` };
        default:
            return { title: "주문 이벤트", text: `${oid} · ${et}` };
    }
}

function collectAllOrderNotificationsForRole(role) {
    const me = String(currentUser?.name || "").trim();
    if (!me) return [];
    const cutoff = getOrderNotifHistoryRetentionCutoffMs();
    const out = [];
    for (const order of orders) {
        if (!order?.id) continue;
        if (role === "consumer" && String(order.consumerName || "").trim() !== me) continue;
        if (role === "supplier" && String(order.supplierName || "").trim() !== me) continue;
        const hist = Array.isArray(order.changeHistory) ? order.changeHistory : [];
        for (const h of hist) {
            const ts = new Date(h.at).getTime();
            if (!Number.isFinite(ts) || ts < cutoff) continue;
            const formatted = formatHistoryNotification(order, h, role);
            if (!formatted) continue;
            out.push({
                ...formatted,
                actorLabel: formatActorNameForNotif(order, h),
                ts,
                atIso: h.at,
                orderId: order.id,
            });
        }
    }
    out.sort((a, b) => b.ts - a.ts);
    return out.slice(0, 250);
}

function renderOneOrderNotifPanel(role, cardId, listId) {
    const card = document.getElementById(cardId);
    const list = document.getElementById(listId);
    if (!card || !list) return;
    const seen = getOrderNotifSeenTs(role);
    const ack = getOrderNotifAckSet(role);
    const allItems = collectAllOrderNotificationsForRole(role);
    if (!allItems.length) {
        card.hidden = true;
        list.innerHTML = "";
        card.classList.remove("dashboard-order-notifications--has-unread");
        return;
    }
    card.hidden = false;
    const hasUnread = allItems.some((it) => isOrderNotifEntryUnread(role, it, seen, ack));
    card.classList.toggle("dashboard-order-notifications--has-unread", hasUnread);
    list.innerHTML = allItems
        .map((it) => {
            const unread = isOrderNotifEntryUnread(role, it, seen, ack);
            const unreadClass = unread ? " dashboard-order-notif-item--unread" : "";
            const oid = escapeNotificationText(String(it.orderId ?? ""));
            const oAt = escapeNotificationText(String(it.atIso ?? ""));
            const actorLabel = String(it.actorLabel ?? "—");
            const ariaGo = `${escapeNotificationText(actorLabel)} · ${escapeNotificationText(it.title)} 상세로 이동`;
            return `
        <li class="dashboard-order-notif-item${unreadClass}" data-order-id="${oid}" data-notif-at="${oAt}" tabindex="0" role="button" aria-label="${ariaGo}">
            <span class="dashboard-order-notif-actor">${escapeNotificationText(actorLabel)}</span>
            <span class="dashboard-order-notif-time">${escapeNotificationText(formatNotifListTime(it.atIso))}</span>
            <span class="dashboard-order-notif-title">${escapeNotificationText(it.title)}</span>
            <span class="dashboard-order-notif-text">${escapeNotificationText(it.text)}</span>
        </li>`;
        })
        .join("");
}

function renderOrderNotificationPanels() {
    renderOneOrderNotifPanel("consumer", "consumerOrderNotificationsCard", "consumerOrderNotificationsList");
    renderOneOrderNotifPanel("supplier", "supplierOrderNotificationsCard", "supplierOrderNotificationsList");
}

function findPreviousInboundOrder(currentOrder) {
    const currentKey = getOrderDateTimeSortKey(currentOrder);
    return orders
        .filter((o) => {
            if (!o || o.id === currentOrder.id) return false;
            if (o.consumerName !== currentOrder.consumerName) return false;
            if (o.supplierName !== currentOrder.supplierName) return false;
            if (!o.transportInfo?.trailerNumbers?.length) return false;
            if (o.outboundInfo?.outboundAt) return false;
            return getOrderDateTimeSortKey(o) < currentKey;
        })
        .sort((a, b) => getOrderDateTimeSortKey(b).localeCompare(getOrderDateTimeSortKey(a)))[0];
}

function handleTrailerOutboundOnCompleted(currentOrder) {
    const previousOrder = findPreviousInboundOrder(currentOrder);
    if (!previousOrder) return;
    const outboundDriverName = String(currentOrder?.transportInfo?.driverName || "").trim();
    const outboundAt = new Date().toISOString();
    const quantityRaw = window.prompt(
        `직전 주문(${previousOrder.id}) 출고 납품량(kg)을 입력해 주세요.`,
        String(previousOrder.outboundInfo?.quantityKg || "")
    );
    if (quantityRaw === null) return;
    const quantityKg = Number(String(quantityRaw).replace(/,/g, "").trim());
    if (!Number.isFinite(quantityKg) || quantityKg < 0) {
        alert("출고 납품량은 0 이상의 숫자로 입력해 주세요.");
        return;
    }
    const supplierSignerName = String(
        window.prompt("출고 확인 - 기사(공급자 측) 서명자명을 입력해 주세요.", outboundDriverName || "") || ""
    ).trim();
    const consumerSignerName = String(
        window.prompt("출고 확인 - 수요자 담당자명을 입력해 주세요.", previousOrder.consumerName || "") || ""
    ).trim();
    if (!supplierSignerName || !consumerSignerName) {
        alert("기사/수요자 담당자 서명자명은 모두 입력해야 합니다.");
        return;
    }

    previousOrder.outboundInfo = {
        trailerNumbers: Array.isArray(previousOrder.transportInfo?.trailerNumbers)
            ? previousOrder.transportInfo.trailerNumbers
            : [],
        driverName: outboundDriverName,
        quantityKg,
        outboundAt,
        outboundByOrderId: currentOrder.id,
    };
    previousOrder.deliveryConfirmation = {
        supplierSignerName,
        consumerSignerName,
        confirmedAt: outboundAt,
    };
    appendOrderChangeHistory(previousOrder, "tt_outbound_confirmed", "system", {
        outboundByOrderId: currentOrder.id,
        trailerNumbers: previousOrder.outboundInfo.trailerNumbers,
        driverName: outboundDriverName,
        quantityKg,
        supplierSignerName,
        consumerSignerName,
    });
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
    const fromInput = document.getElementById('ordersFromDate');
    const toInput = document.getElementById('ordersToDate');
    if (!fromInput || !toInput) return;
    if (fromInput.value && toInput.value) return;
    const today = getTodayParts();
    const fromVal = `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;
    const end = new Date(today.year, today.month - 1, today.day + 1);
    const toVal = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    fromInput.value = fromVal;
    toInput.value = toVal;
}

function initSupplierDateFilterDefault() {
    const fromInput = document.getElementById('supplierFromDate');
    const toInput = document.getElementById('supplierToDate');
    if (!fromInput || !toInput) return;
    if (fromInput.value && toInput.value) return;
    const today = getTodayParts();
    const fromVal = `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;
    const end = new Date(today.year, today.month - 1, today.day + 1);
    const toVal = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    fromInput.value = fromVal;
    toInput.value = toVal;
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

// 출하도 선택 시 납품 주소 숨김 → 수요자 운송 자원 입력 표시, 도착도 시 납품 주소 표시
function toggleOrderAddressBySupplyCondition() {
    const scInput = document.getElementById('supplyConditionInput');
    const isExFactory = (scInput && scInput.value) === 'ex_factory';
    const group = document.getElementById('orderAddressFormGroup');
    const input = document.getElementById('orderAddress');
    const exGroup = document.getElementById('consumerExFactoryTransportGroup');
    const ttIn = document.getElementById('orderConsumerTtInput');
    const drvIn = document.getElementById('orderConsumerDriverInput');
    if (!group || !input) return;
    const settleGrp = document.getElementById('exFactoryConsumerSettleGroup');
    if (isExFactory) {
        group.style.display = 'none';
        input.removeAttribute('required');
        input.value = '';
        if (settleGrp) settleGrp.classList.remove('is-hidden');
        if (exGroup) {
            exGroup.classList.remove('is-hidden');
            /* 출하도는 주문 시점에 T/T·기사를 몰 수 있음 — 공차 출발 시 대시보드에서 입력 */
            if (ttIn) ttIn.removeAttribute('required');
            if (drvIn) drvIn.removeAttribute('required');
        }
        loadConsumerTransportDatalists().catch((err) => console.warn("[h2go] consumer transport datalists:", err?.message || err));
    } else {
        if (settleGrp) settleGrp.classList.add('is-hidden');
        group.style.display = '';
        input.setAttribute('required', 'required');
        if (exGroup) {
            exGroup.classList.add('is-hidden');
            if (ttIn) {
                ttIn.removeAttribute('required');
                ttIn.value = '';
            }
            if (drvIn) {
                drvIn.removeAttribute('required');
                drvIn.value = '';
            }
        }
        const saveTt = document.getElementById('orderSaveConsumerTt');
        const saveDrv = document.getElementById('orderSaveConsumerDriver');
        if (saveTt) saveTt.checked = false;
        if (saveDrv) saveDrv.checked = false;
    }
}

function openSupplierSelectModal() {
    void openSupplierSelectModalAsync();
}

async function openSupplierSelectModalAsync() {
    const modal = document.getElementById("supplierSelectModal");
    const listEl = document.getElementById("supplierList");
    const addressDisplay = document.getElementById("supplierShippingAddressDisplay");
    const manualNameEl = document.getElementById("supplierManualNameInput");
    const manualAddressEl = document.getElementById("supplierManualAddressInput");
    if (!modal || !listEl) return;

    const currentSupplier = String(selectedSupplierName || "").trim();
    if (addressDisplay) {
        addressDisplay.textContent = currentSupplier
            ? getSupplierShippingAddress(currentSupplier)
            : "공급자를 선택하면 출하 주소가 표시됩니다.";
    }

    listEl.innerHTML =
        '<p class="supplier-list-empty supplier-list-loading" role="status">공급자 목록을 불러오는 중…</p>';

    let candidates = [];
    try {
        candidates = await fetchApprovedSupplierDirectoryUsernames();
    } catch (err) {
        console.warn("[h2go] supplier directory:", err?.message || err);
    }

    if (candidates.length === 0) {
        listEl.innerHTML =
            '<p class="supplier-list-empty">등록된 공급자(플랫폼에 공급자로 등록·승인된 계정)가 없습니다. 아래 직접 입력으로 신규 공급자를 지정하세요.</p>';
    } else {
        listEl.innerHTML = candidates
            .map((n) => {
                const addr = getSupplierShippingAddress(n);
                return `<button type="button" data-supplier="${String(n).replace(/"/g, "&quot;")}" data-address="${String(addr).replace(/"/g, "&quot;")}">${n}</button>`;
            })
            .join("");
    }

    listEl.querySelectorAll("button[data-supplier]").forEach((btn) => {
        btn.addEventListener("click", () => {
            setSupplierName(btn.dataset.supplier);
            if (addressDisplay && btn.dataset.address) addressDisplay.textContent = btn.dataset.address;
            modal.classList.remove("active");
        });
    });

    if (manualNameEl) manualNameEl.value = "";
    if (manualAddressEl) manualAddressEl.value = "";
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

const NEW_ORDER_MODAL_CLOSE_MS = 340;
let newOrderModalCloseTimer = null;

function openNewOrderModal() {
    const m = document.getElementById("newOrderModal");
    if (!m) return;
    m.classList.remove("modal--closing");
    void m.offsetWidth;
    m.classList.add("active");
    m.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-new-order-open");
    initFormDefaults();
    initTimeInputs();
}

function closeNewOrderModal() {
    const m = document.getElementById("newOrderModal");
    if (!m || !m.classList.contains("active")) return;
    if (m.classList.contains("modal--closing")) return;
    m.classList.add("modal--closing");
    m.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-new-order-open");
    if (newOrderModalCloseTimer) clearTimeout(newOrderModalCloseTimer);
    newOrderModalCloseTimer = setTimeout(() => {
        m.classList.remove("active", "modal--closing");
        newOrderModalCloseTimer = null;
    }, NEW_ORDER_MODAL_CLOSE_MS);
}

document.getElementById("openNewOrderModalBtn")?.addEventListener("click", () => openNewOrderModal());
document.querySelectorAll("[data-new-order-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeNewOrderModal());
});
document.getElementById("newOrderModal")?.addEventListener("click", (e) => {
    if (e.target.id === "newOrderModal") closeNewOrderModal();
});
document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const m = document.getElementById("newOrderModal");
    if (m?.classList.contains("active")) {
        closeNewOrderModal();
    }
});
document.getElementById("supplierManualApplyBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("supplierSelectModal");
    const addressDisplay = document.getElementById("supplierShippingAddressDisplay");
    const manualNameEl = document.getElementById("supplierManualNameInput");
    const manualAddressEl = document.getElementById("supplierManualAddressInput");
    const name = String(manualNameEl?.value || "").trim();
    const address = String(manualAddressEl?.value || "").trim();
    if (!name) {
        alert("공급자명을 입력해 주세요.");
        return;
    }
    if (!address) {
        alert("공급자 주소를 입력해 주세요.");
        return;
    }
    setSupplierName(name);
    if (addressDisplay) addressDisplay.textContent = address;
    // 직접 입력한 신규 공급자는 등록된 공급자 목록에도 함께 저장해 출하 주소로 활용
    const list = readRegisteredSuppliers();
    const exists = list.some(s => {
        const n = typeof s === 'string' ? s : s?.name;
        return String(n || "").trim().toLowerCase() === name.toLowerCase();
    });
    if (!exists) {
        list.push({ name, address });
        writeRegisteredSuppliers(list);
        renderSupplierRegistration();
    }
    modal?.classList.remove("active");
});

document.getElementById('roleSelect').addEventListener('change', (e) => {
    const sel = e.target;
    const role = sel.value;
    const allowed = auth?.roles || ["consumer", "supplier"];
    if (!allowed.includes(role)) {
        sel.value = allowed[0] || "consumer";
        return;
    }
    currentUser.type = role;
    if (auth?.name) currentUser.name = auth.name;
    const bizEl = document.getElementById('bizName');
    if (bizEl) bizEl.textContent = currentUser.name;
    try {
        const nextAuth = { ...auth, activeRole: role, businessParties: auth.businessParties };
        localStorage.setItem(AUTH_KEY, JSON.stringify(nextAuth));
    } catch (_) {}
    showView(role);
    syncFleetNavVisibility();
    updateDashboardStats();
    renderOrderNotificationPanels();
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
    let addressValue;
    let consumerTransport = null;
    if (supplyCondition === 'ex_factory') {
        const ttRaw = String(document.getElementById('orderConsumerTtInput')?.value || '');
        const driverRaw = String(document.getElementById('orderConsumerDriverInput')?.value || '').trim();
        const trailerNumbers = ttRaw.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
        addressValue = getSupplierShippingAddress(supplierName);
        /* 미리 알고 있으면 저장; 비우면 공차 출발 시 수요자가 입력 */
        if (trailerNumbers.length || driverRaw) {
            consumerTransport = { trailerNumbers, driverName: driverRaw };
        }
        const saveTt = Boolean(document.getElementById('orderSaveConsumerTt')?.checked);
        const saveDrv = Boolean(document.getElementById('orderSaveConsumerDriver')?.checked);
        if ((saveTt || saveDrv) && (trailerNumbers.length || driverRaw)) {
            void maybeSaveConsumerTransportAssets(ttRaw, driverRaw, saveTt, saveDrv);
        }
    } else {
        addressValue = normalizeAddress(document.getElementById('orderAddress').value);
    }
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
        supplierAddress: getSupplierShippingAddress(supplierName),
        supplyCondition: supplyCondition,
        exFactoryConsumerSettlementMode:
            supplyCondition === 'ex_factory'
                ? (document.querySelector('input[name="exFactoryConsumerSettlementMode"]:checked')?.value === 'flow'
                      ? 'flow'
                      : 'pressure')
                : 'pressure',
        consumerTransport,
        note: document.getElementById('orderNote').value,
        status: 'requested',
        createdAt: new Date().toISOString()
    };
    appendOrderChangeHistory(order, "created", "consumer", {
        consumerName: order.consumerName,
        supplierName: order.supplierName,
        consumerAddress: order.address,
        supplierAddress: getSupplierShippingAddress(order.supplierName),
        supplyCondition: order.supplyCondition,
        note: order.note || "",
        consumerTransport: consumerTransport || undefined,
    });
    orders.push(order);
    saveOrdersToStorage();
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
    closeNewOrderModal();
    alert('주문이 등록되었습니다. 공급자에게 전달됩니다.');
});

document.getElementById('changeRequestForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const orderId = document.getElementById('changeOrderId')?.value;
    const requestedBy = document.getElementById('changeRequestedBy')?.value;
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const year = parseInt(document.getElementById('changeYear')?.value, 10);
    const month = parseInt(document.getElementById('changeMonth')?.value, 10);
    const day = parseInt(document.getElementById('changeDay')?.value, 10);
    const tubeTrailers = parseInt(document.getElementById('changeTrailers')?.value, 10);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(tubeTrailers)) {
        alert('날짜와 트레일러 대수를 올바르게 입력해 주세요.');
        return;
    }
    const proposed = {
        year,
        month,
        day,
        time: `${String(document.getElementById('changeHour')?.value ?? '09').padStart(2, '0')}:${String(document.getElementById('changeMinute')?.value ?? '00').padStart(2, '0')}`,
        tubeTrailers,
        address: document.getElementById('changeAddress')?.value ?? order.address
    };

    order.changeRequest = {
        requestedBy,
        proposed,
        status: 'pending',
        requestedAt: new Date().toISOString(),
        originalStatus: normalizeStatus(order.status),
    };
    order.status = 'change_requested';
    clearSeenChangeReviewForOrder(order);
    appendOrderChangeHistory(order, "change_requested", requestedBy, {
        proposed,
        originalStatus: order.changeRequest.originalStatus,
    });

    saveOrdersToStorage();
    document.getElementById('changeRequestModal').classList.remove('active');
    renderConsumerView();
    renderSupplierView();
    alert('변경 요청이 제출되었습니다. 상대방의 확정을 기다립니다.');
});

document.getElementById('deliverySettlementForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const orderId = document.getElementById('deliverySettleOrderId')?.value;
    const chainPrevId = document.getElementById('deliverySettleChainPrevId')?.value?.trim() || '';
    const order = orderId ? orders.find((o) => o.id === orderId) : null;
    if (!order || order.supplyCondition !== 'delivery' || normalizeStatus(order.status) !== 'in_transit') return;
    const vol = parseFloat(document.getElementById('deliverySettleVolume')?.value || '');
    if (!Number.isFinite(vol) || vol <= 0) {
        alert('내용적(m³)을 올바르게 입력해 주세요.');
        return;
    }
    const wrap = document.getElementById('deliverySettleTrailers');
    if (!wrap) return;

    const prevOrder = chainPrevId ? orders.find((o) => o.id === chainPrevId) : null;
    if (chainPrevId && !prevOrder) {
        alert('이전 주문 정보를 찾을 수 없습니다.');
        return;
    }
    const prevTT = prevOrder ? getOrderTrailerNumbers(prevOrder)[0] : '';
    if (prevOrder && prevTT) {
        const emptyP = document.getElementById('chainPrevEmptyResidual')?.value?.trim();
        const handoff = document.getElementById('chainHandoffFlow')?.value?.trim();
        const prevFlowIn = document.getElementById('chainPrevFlowIn')?.value?.trim();
        const drv = document.getElementById('chainDriverName')?.value?.trim();
        if (!emptyP || !handoff || !drv) {
            alert('① 이전 납품: 공차 잔압, 유량계 출고(인계) 값, 기사명을 모두 입력해 주세요.');
            return;
        }
        const prevVol =
            prevOrder.trailerVolumeM3Default != null && Number.isFinite(Number(prevOrder.trailerVolumeM3Default))
                ? Number(prevOrder.trailerVolumeM3Default)
                : vol;
        const prevBt = prevOrder.qtySettlement?.byTrailer && typeof prevOrder.qtySettlement.byTrailer === 'object'
            ? { ...prevOrder.qtySettlement.byTrailer }
            : {};
        const base = prevBt[prevTT] && typeof prevBt[prevTT] === 'object' ? { ...prevBt[prevTT] } : {};
        const snapPrev = {
            ...base,
            method: 'flow',
            emptyResidualPressureBar: emptyP,
            flowOutCurr: handoff,
            consumerFlowOutCurr: handoff,
            flowInCurr: prevFlowIn || base.flowInCurr || '',
            consumerFlowInCurr: prevFlowIn || base.consumerFlowInCurr || '',
            handoffDriverName: drv,
            chainHandoffToOrderId: order.id,
            chainHandoffFlowKg: handoff,
        };
        const rin = snapPrev.flowInRef ?? base.flowInRef ?? '';
        const rout = snapPrev.flowOutRef ?? base.flowOutRef ?? '';
        const fakePrev = {
            flowInRef: rin || snapPrev.flowInCurr,
            flowOutRef: rout || snapPrev.flowOutCurr,
            flowInCurr: snapPrev.flowInCurr,
            flowOutCurr: snapPrev.flowOutCurr,
        };
        const dPrev = computeQtyDeltas('flow', fakePrev, prevVol);
        snapPrev.deltaValue = dPrev.delta;
        snapPrev.deltaLabel = dPrev.label || '유량계 차이(kg)';
        prevBt[prevTT] = snapPrev;
        prevOrder.qtySettlement = {
            ...(prevOrder.qtySettlement && typeof prevOrder.qtySettlement === 'object' ? prevOrder.qtySettlement : {}),
            byTrailer: prevBt,
            chainUpdatedAt: new Date().toISOString(),
        };
        appendOrderChangeHistory(prevOrder, 'delivery_chain_prev_updated', 'consumer', { nextOrderId: order.id });
    }

    const byTrailer = {};
    const blocks = wrap.querySelectorAll('[data-del-settle-block]');
    for (const block of blocks) {
        const tt = block.dataset.trailerId || '';
        if (!tt) continue;
        const loadedP = block.querySelector('.delivery-settle-loaded-p')?.value?.trim();
        const emptyP = block.querySelector('.delivery-settle-empty-p')?.value?.trim();
        if (!loadedP || !emptyP) {
            alert(`T/T ${tt}: 실차 입고 압력과 전입고 공차 잔압을 모두 입력해 주세요.`);
            return;
        }
        const method = block.querySelector('.delivery-settle-method')?.value || 'flow';
        const gv = (name) => (block.querySelector(`[name="${name}"]`)?.value ?? '').trim();
        const snap = {
            method,
            loadedInboundPressureBar: loadedP,
            emptyResidualPressureBar: emptyP,
            flowInRef: gv('flowInRef'),
            flowOutRef: gv('flowOutRef'),
            flowInCurr: gv('flowInCurr'),
            flowOutCurr: gv('flowOutCurr'),
            pressureInRef: gv('pressureInRef'),
            pressureOutRef: gv('pressureOutRef'),
            pressureInCurr: gv('pressureInCurr'),
            pressureOutCurr: gv('pressureOutCurr'),
            weightBeforeRef: gv('weightBeforeRef'),
            weightAfterRef: gv('weightAfterRef'),
            weightBeforeCurr: gv('weightBeforeCurr'),
            weightAfterCurr: gv('weightAfterCurr'),
        };
        if (prevOrder && prevTT) {
            const h = document.getElementById('chainHandoffFlow')?.value?.trim();
            snap.flowInCurr = h || snap.flowInCurr;
            snap.chainHandoffFromOrderId = prevOrder.id;
            snap.chainHandoffFromTrailer = prevTT;
            snap.handoffDriverName = document.getElementById('chainDriverName')?.value?.trim() || '';
        }
        const { delta, label } = computeQtyDeltas(method, snap, vol);
        snap.deltaValue = delta;
        snap.deltaLabel = label;
        byTrailer[tt] = snap;
    }
    if (Object.keys(byTrailer).length === 0) {
        alert('정산할 T/T 정보가 없습니다.');
        return;
    }
    order.trailerVolumeM3Default = vol;
    order.qtySettlement = {
        settledAt: new Date().toISOString(),
        volumeM3: vol,
        byTrailer,
    };
    order.arrivedAt = new Date().toISOString();
    order.status = 'arrived';
    appendOrderChangeHistory(order, 'delivery_qty_settled', 'consumer', { trailerKeys: Object.keys(byTrailer), chainPrevId: chainPrevId || null });
    saveOrdersToStorage();
    closeDeliverySettlementModal();
    renderConsumerView();
    renderSupplierView();
    alert('물량 정산이 저장되었습니다. 이제 공차 회수를 진행할 수 있습니다.');
});

document.getElementById('exFactoryFlowKgForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const orderId = document.getElementById('exFactoryFlowKgOrderId')?.value;
    const order = orderId ? orders.find((o) => o.id === orderId) : null;
    if (!order || !isExFactoryOrder(order) || order.exFactoryConsumerSettlementMode !== 'flow') return;
    const wrap = document.getElementById('exFactoryFlowKgTrailers');
    if (!wrap) return;
    const prevBt =
        order.qtySettlement?.byTrailer && typeof order.qtySettlement.byTrailer === 'object'
            ? { ...order.qtySettlement.byTrailer }
            : {};
    const blocks = wrap.querySelectorAll('[data-exflow-block]');
    for (const block of blocks) {
        const tt = block.dataset.trailerId || '';
        if (!tt) continue;
        const gv = (name) => (block.querySelector(`[name="${name}"]`)?.value ?? '').trim();
        const base = prevBt[tt] && typeof prevBt[tt] === 'object' ? { ...prevBt[tt] } : {};
        const snap = {
            ...base,
            settlementKind: base.settlementKind || 'ex_factory_charge',
            method: 'flow',
            consumerFlowInRef: gv('flowInRef'),
            consumerFlowOutRef: gv('flowOutRef'),
            consumerFlowInCurr: gv('flowInCurr'),
            consumerFlowOutCurr: gv('flowOutCurr'),
        };
        const fake = {
            flowInRef: snap.consumerFlowInRef,
            flowOutRef: snap.consumerFlowOutRef,
            flowInCurr: snap.consumerFlowInCurr,
            flowOutCurr: snap.consumerFlowOutCurr,
        };
        const { delta } = computeQtyDeltas('flow', fake, DEFAULT_TT_VOLUME_M3);
        snap.consumerFlowDeltaKg = delta;
        snap.deltaValue = delta;
        snap.deltaLabel = '유량계 차이(kg)';
        prevBt[tt] = snap;
    }
    order.qtySettlement = {
        ...(order.qtySettlement && typeof order.qtySettlement === 'object' ? order.qtySettlement : {}),
        byTrailer: prevBt,
        exFactoryConsumerFlowDone: true,
        consumerFlowSettledAt: new Date().toISOString(),
    };
    appendOrderChangeHistory(order, 'ex_factory_consumer_flow', 'consumer', {});
    saveOrdersToStorage();
    closeExFactoryFlowKgModal();
    renderConsumerView();
    renderSupplierView();
    alert('유량계 질량(kg) 정산이 저장되었습니다.');
});

document.getElementById('transportStartForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const orderId = document.getElementById('transportStartOrderId').value;
    const mode = String(document.getElementById('transportStartMode')?.value || 'delivery');
    const trailerInput = String(document.getElementById('transportTrailerNumbers').value || '').trim();
    const driverName = String(document.getElementById('transportDriverName').value || '').trim();
    const depRaw = document.getElementById('transportDepartureLocal')?.value;
    const departedAt = parseDatetimeLocalToIso(depRaw) || new Date().toISOString();
    if (!trailerInput || !driverName) {
        alert('T/T 번호와 운송기사를 모두 입력해 주세요.');
        return;
    }
    const trailerNumbers = trailerInput.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean);
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    if (mode === 'empty_leg') {
        if (getActorForOrder(order) !== 'consumer') return;
        const legInfo = { trailerNumbers, driverName };
        if (isExFactoryOrder(order)) {
            order.transportInfo = legInfo;
            order.consumerTransport = null;
        } else {
            order.emptyLegReturnInfo = legInfo;
        }
        order.emptyLegStartedAt = departedAt;
        order.status = 'empty_in_transit';
        if (!isExFactoryOrder(order) && order.qtySettlement?.byTrailer && typeof order.qtySettlement.byTrailer === 'object') {
            const drv = String(driverName).trim();
            getOrderTrailerNumbers(order).forEach((tt) => {
                const row = order.qtySettlement.byTrailer[tt];
                if (row && typeof row === 'object') {
                    row.outboundDriverNamePlanned = drv;
                }
            });
        }
        appendOrderChangeHistory(order, "empty_leg_started", "consumer", {
            trailerNumbers,
            driverName,
            departedAt,
            leg: isExFactoryOrder(order) ? "to_supplier" : "return_to_supplier",
        });
    } else {
        if (getActorForOrder(order) !== 'supplier') return;
        order.transportInfo = { trailerNumbers, driverName };
        order.transportStartedAt = departedAt;
        const volM =
            parseFloat(document.getElementById('transportChargeVolumeM3')?.value || '') ||
            order.trailerVolumeM3Default ||
            DEFAULT_TT_VOLUME_M3;
        order.trailerVolumeM3Default = volM;

        if (mode === 'loaded_ex_factory') {
            const inP = String(document.getElementById('transportChargeInPressure')?.value || '').trim();
            const outP = String(document.getElementById('transportChargeOutPressure')?.value || '').trim();
            if (!inP || !outP) {
                alert('충전 시작 시 입고 압력과 실차 출발 시 출고 압력을 모두 입력해 주세요.');
                return;
            }
            const volDelta = computeExFactoryChargeVolumeM3(inP, outP, volM);
            if (volDelta == null || !Number.isFinite(volDelta)) {
                alert('압력과 내용적을 확인해 주세요.');
                return;
            }
            const prevBt =
                order.qtySettlement?.byTrailer && typeof order.qtySettlement.byTrailer === 'object'
                    ? { ...order.qtySettlement.byTrailer }
                    : {};
            const byTrailer = { ...prevBt };
            trailerNumbers.forEach((tt) => {
                const row =
                    byTrailer[tt] && typeof byTrailer[tt] === 'object' ? { ...byTrailer[tt] } : {};
                row.settlementKind = 'ex_factory_charge';
                row.method = 'pressure';
                row.chargeInPressureBar = inP;
                row.chargeOutPressureBar = outP;
                row.volumeM3 = volM;
                row.volumeNm3 = volDelta;
                row.deltaValue = volDelta;
                row.deltaLabel = '차압×내용적(m³)';
                byTrailer[tt] = row;
            });
            order.qtySettlement = {
                ...(order.qtySettlement && typeof order.qtySettlement === 'object' ? order.qtySettlement : {}),
                settledAt: new Date().toISOString(),
                volumeM3: volM,
                byTrailer,
                exFactorySupplierChargeDone: true,
            };
        }

        order.status = 'in_transit';
        appendOrderChangeHistory(order, 'transport_started', 'supplier', {
            trailerNumbers,
            driverName,
            departedAt,
            mode,
        });
    }

    saveOrdersToStorage();
    closeTransportStartModal();
    renderConsumerView();
    renderSupplierView();
    if (mode === 'empty_leg') {
        alert('공차 출발이 등록되었습니다. 공급자에게 공차 도착 예정 시각이 안내됩니다.');
    } else if (mode === 'loaded_ex_factory') {
        alert(
            '실차 출발 및 차압 정산(부피)이 기록되었습니다. 출고 기사명이 물량확인증에 반영됩니다.' +
                (order.exFactoryConsumerSettlementMode === 'flow'
                    ? ' 유량계 질량(kg)은 수요자 화면에서 입력해 주세요.'
                    : '')
        );
    } else {
        alert('운송이 시작되었습니다. T/T 번호와 운송기사 정보가 상대방에게 표시됩니다.');
    }
});

document.getElementById('approveChangeBtn').addEventListener('click', () => {
    if (!pendingApprovalOrderId) return;
    const oid = pendingApprovalOrderId;
    const order = orders.find((o) => o.id === oid);
    const actor = getActorForOrder(order || {});
    if (!order || !hasSeenPendingChangeReview(oid, actor)) return;
    applyChange(oid, true);
    alert('변경 요청을 승인했습니다. 주문 상태가 "변경 접수"로 변경됩니다.');
});

document.getElementById('rejectChangeBtn').addEventListener('click', () => {
    if (!pendingApprovalOrderId) return;
    const oid = pendingApprovalOrderId;
    const order = orders.find((o) => o.id === oid);
    const actor = getActorForOrder(order || {});
    if (!order || !hasSeenPendingChangeReview(oid, actor)) return;
    applyChange(oid, false);
    alert('변경 요청을 반려했습니다. 주문 상태가 이전 단계로 유지됩니다.');
});

document.getElementById("approveCancelBtn")?.addEventListener("click", () => {
    const oid = pendingCancelApprovalOrderId;
    if (!oid) return;
    const order = orders.find((o) => o.id === oid);
    const actor = getActorForOrder(order || {});
    if (!order || !order.cancelRequest || order.cancelRequest.status !== "pending") return;
    if (!canActorApprovePendingCancel(order, actor) || !hasSeenPendingCancelReview(oid, actor)) return;
    clearSeenCancelReviewForOrder(order);
    decideCancelOrder(order, true);
    appendOrderChangeHistory(order, "cancel_approved", actor, {});
    saveOrdersToStorage();
    renderConsumerView();
    renderSupplierView();
    lastOrdersSnapshot = deepClone(orders);
    closeCancelApprovalModal();
    alert("취소 요청을 승인했습니다. 주문이 취소 상태로 표시됩니다.");
});

document.getElementById("rejectCancelBtn")?.addEventListener("click", () => {
    const oid = pendingCancelApprovalOrderId;
    if (!oid) return;
    const order = orders.find((o) => o.id === oid);
    const actor = getActorForOrder(order || {});
    if (!order || !order.cancelRequest || order.cancelRequest.status !== "pending") return;
    if (!canActorApprovePendingCancel(order, actor) || !hasSeenPendingCancelReview(oid, actor)) return;
    const reason = window.prompt("취소 요청 반려 사유를 입력해 주세요.", "");
    if (reason === null) return;
    order.cancelRequest.reason = String(reason || "").trim();
    clearSeenCancelReviewForOrder(order);
    decideCancelOrder(order, false);
    appendOrderChangeHistory(order, "cancel_rejected", actor, { reason: order.cancelRequest.reason });
    saveOrdersToStorage();
    renderConsumerView();
    renderSupplierView();
    lastOrdersSnapshot = deepClone(orders);
    closeCancelApprovalModal();
    alert("취소 요청을 반려했습니다. 사유가 요청자에게 전달됩니다.");
});

document.getElementById("cancelApprovalModalClose")?.addEventListener("click", closeCancelApprovalModal);
document.getElementById("cancelApprovalModal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeCancelApprovalModal();
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
    else if (document.getElementById('qtyConfirmModal').classList.contains('active')) closeQtyConfirmModal();
    else if (document.getElementById('transportAssetPickModal')?.classList.contains('active')) closeTransportAssetPickModal();
    else if (document.getElementById('transportStartModal').classList.contains('active')) closeTransportStartModal();
    else if (document.getElementById('deliverySettlementModal')?.classList.contains('active')) closeDeliverySettlementModal();
    else if (document.getElementById('exFactoryFlowKgModal')?.classList.contains('active')) closeExFactoryFlowKgModal();
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
document.querySelector('#qtyConfirmModal .modal-close')?.addEventListener('click', closeQtyConfirmModal);
document.getElementById('qtyConfirmModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeQtyConfirmModal();
});

document.getElementById('deliverySettlementModalClose')?.addEventListener('click', closeDeliverySettlementModal);
document.getElementById('deliverySettlementModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDeliverySettlementModal();
});

document.getElementById('exFactoryFlowKgModalClose')?.addEventListener('click', closeExFactoryFlowKgModal);
document.getElementById('exFactoryFlowKgModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeExFactoryFlowKgModal();
});

document.getElementById("exFactoryChargeModalClose")?.addEventListener("click", closeExFactoryChargeModal);
document.getElementById("exFactoryChargeModalCancel")?.addEventListener("click", closeExFactoryChargeModal);
document.getElementById("exFactoryChargeModal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeExFactoryChargeModal();
});
document.getElementById("exFactoryChargeForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    applyExFactoryChargeFromModal();
});

document.querySelector('#transportAssetPickModal .modal-close')?.addEventListener('click', closeTransportAssetPickModal);
document.getElementById('transportAssetPickModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeTransportAssetPickModal();
});

document.getElementById('transportTtPickBtn')?.addEventListener('click', () => {
    openTransportAssetPickModal('tt', 'transportTrailerNumbers');
});
document.getElementById('transportDriverPickBtn')?.addEventListener('click', () => {
    openTransportAssetPickModal('driver', 'transportDriverName');
});
document.getElementById('orderConsumerTtPickBtn')?.addEventListener('click', () => {
    openTransportAssetPickModal('tt', 'orderConsumerTtInput');
});
document.getElementById('orderConsumerDriverPickBtn')?.addEventListener('click', () => {
    openTransportAssetPickModal('driver', 'orderConsumerDriverInput');
});

document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const orderId = btn.dataset.id;
    const order = orderId ? orders.find(o => o.id === orderId) : null;

    function persistAndRerender() {
        saveOrdersToStorage();
        renderConsumerView();
        renderSupplierView();
        lastOrdersSnapshot = deepClone(orders);
    }

    function requestCancel(o, requestedBy, requestReason) {
        if (!o) return;
        if (o.cancelRequest && o.cancelRequest.status === 'pending') return;
        const reqReason = String(requestReason ?? "").trim();
        o.cancelRequest = {
            requestedBy,
            status: 'pending',
            requestedAt: new Date().toISOString(),
            originalStatus: normalizeStatus(o.status),
            requestReason: reqReason,
        };
        o.status = 'cancel_requested';
    }

    if (action === 'cancel-change-request') {
        if (!order || !order.changeRequest || order.changeRequest.status !== 'pending') return;
        const actor = getActorForOrder(order);
        if (order.changeRequest.requestedBy !== actor) return;
        if (!confirm('변경 요청을 취소하시겠습니까?')) return;
        clearSeenChangeReviewForOrder(order);
        order.status = order.changeRequest.originalStatus || 'accepted';
        order.changeRequest = null;
        appendOrderChangeHistory(order, "change_request_cancelled", actor, {});
        persistAndRerender();
        alert('변경 요청이 취소되었습니다.');
    } else if (action === 'request-change') {
        if (!order) return;
        const actor = getActorForOrder(order);
        if (order.changeRequest && order.changeRequest.status === 'pending') return;
        if (order.cancelRequest && order.cancelRequest.status === 'pending') return;
        openChangeRequestModal(orderId, actor);
    } else if (action === 'review-change-request') {
        if (!order || !order.changeRequest || order.changeRequest.status !== "pending") return;
        const actor = getActorForOrder(order);
        if (!canActorApprovePendingChange(order, actor)) return;
        markSeenPendingChangeReview(orderId, actor);
        openApprovalModal(orderId);
        persistAndRerender();
    } else if (action === 'review-cancel-request') {
        if (!order || !order.cancelRequest || order.cancelRequest.status !== "pending") return;
        const actor = getActorForOrder(order);
        if (!canActorApprovePendingCancel(order, actor)) return;
        markSeenPendingCancelReview(orderId, actor);
        openCancelApprovalModal(orderId);
        persistAndRerender();
    } else if (action === 'approve-change') {
        if (!order || !order.changeRequest || order.changeRequest.status !== 'pending') return;
        const actor = getActorForOrder(order);
        if (!canActorApprovePendingChange(order, actor)) return;
        if (!hasSeenPendingChangeReview(orderId, actor)) return;
        applyChange(orderId, true);
        persistAndRerender();
        alert('변경 요청을 승인했습니다. 주문 상태가 "변경 접수"로 변경됩니다.');
    } else if (action === 'reject-change') {
        if (!order || !order.changeRequest || order.changeRequest.status !== 'pending') return;
        const actor = getActorForOrder(order);
        if (!canActorApprovePendingChange(order, actor)) return;
        if (!hasSeenPendingChangeReview(orderId, actor)) return;
        applyChange(orderId, false);
        persistAndRerender();
        alert('변경 요청을 반려했습니다.');
    } else if (action === 'open-delivery-settlement') {
        if (!order) return;
        if (getActorForOrder(order) !== 'consumer') return;
        if (order.supplyCondition !== 'delivery' || normalizeStatus(order.status) !== 'in_transit') {
            alert('도착도 주문이 실차 입고 중일 때만 물량 정산을 진행할 수 있습니다.');
            return;
        }
        if (!document.getElementById('deliverySettlementModal')) {
            alert('물량 정산 창을 불러올 수 없습니다. 페이지를 새로고침해 주세요.');
            return;
        }
        openDeliverySettlementModal(orderId);
    } else if (action === 'open-exfactory-flow-kg') {
        if (!order) return;
        if (getActorForOrder(order) !== 'consumer') return;
        openExFactoryFlowKgModal(orderId);
    } else if (action === 'edit-exfactory-charge') {
        if (!order || !isExFactoryOrder(order)) return;
        if (getActorForOrder(order) !== 'supplier') return;
        if (normalizeStatus(order.status) !== 'empty_arrived') return;
        if (order.changeRequest?.status === 'pending' || order.cancelRequest?.status === 'pending') return;
        openExFactoryChargeModal(orderId, 'edit');
    } else if (action === 'open-order-map') {
        if (!order || order.supplyCondition !== 'delivery') return;
        openOrderMapModal(orderId);
    } else if (action === 'advance-status') {
        if (!order) return;
        const actor = getActorForOrder(order);
        if (order.changeRequest?.status === 'pending' || order.cancelRequest?.status === 'pending') return;
        const nextStatus = String(btn.dataset.nextStatus || '').trim();
        if (!nextStatus) return;
        const st = normalizeStatus(order.status);
        if (actor === 'supplier') {
            if (nextStatus === 'in_transit') {
                const mode = isExFactoryOrder(order) && st === 'empty_arrived' ? 'loaded_ex_factory' : 'delivery';
                openTransportStartModal(orderId, mode === 'loaded_ex_factory', mode).catch((err) =>
                    console.warn("[h2go] transport start modal:", err?.message || err)
                );
                return;
            }
            if (nextStatus === 'empty_arrived' && isExFactoryOrder(order)) {
                openExFactoryChargeModal(orderId, "create");
                return;
            }
            const supplierAction = getSupplierAdvanceAction(order);
            if (!supplierAction || supplierAction.next !== nextStatus) return;
        } else if (actor === 'consumer') {
            if (nextStatus === 'empty_in_transit') {
                openTransportStartModal(orderId, isExFactoryOrder(order), 'empty_leg').catch((err) =>
                    console.warn("[h2go] transport start modal:", err?.message || err)
                );
                return;
            }
            const consumerAction = getConsumerAdvanceAction(order);
            if (!consumerAction || consumerAction.next !== nextStatus) return;
        } else {
            return;
        }
        order.status = nextStatus;
        const nowIso = new Date().toISOString();
        if (nextStatus === 'accepted' || nextStatus === 'change_accepted') order.acceptedAt = nowIso;
        if (nextStatus === 'arrived') order.arrivedAt = nowIso;
        if (nextStatus === 'empty_arrived') order.emptyArrivedAt = nowIso;
        if (nextStatus === 'collecting') {
            order.collectingAt = nowIso;
        }
        if (nextStatus === 'completed') {
            order.completedAt = nowIso;
            if (!isExFactoryOrder(order)) {
                handleTrailerOutboundOnCompleted(order);
            }
        }
        appendOrderChangeHistory(order, "status_changed", actor, {
            to: nextStatus,
            at: nowIso,
        });
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
            appendOrderChangeHistory(order, "cancelled_immediately", actor, {});
            persistAndRerender();
            alert('주문이 즉시 취소되었습니다.');
            return;
        }
        if (!confirm('이 주문에 대해 취소(삭제) 요청을 보내시겠습니까? 상대방 승인 후 삭제됩니다.')) return;
        const cancelNote = window.prompt(
            "취소 요청 사유가 있으면 입력해 주세요. (선택)",
            ""
        );
        if (cancelNote === null) return;
        requestCancel(order, actor, cancelNote);
        appendOrderChangeHistory(order, "cancel_requested", actor, {
            reason: order.cancelRequest?.requestReason || "",
        });
        persistAndRerender();
        alert('취소 요청을 보냈습니다. 상대방 승인을 기다립니다.');
    } else if (action === 'approve-cancel') {
        if (!order || !order.cancelRequest || order.cancelRequest.status !== 'pending') return;
        const actor = getActorForOrder(order);
        const reqBy = order.cancelRequest.requestedBy;
        if ((reqBy === 'consumer' && actor !== 'supplier') || (reqBy === 'supplier' && actor !== 'consumer')) return;
        if (!hasSeenPendingCancelReview(orderId, actor)) return;
        clearSeenCancelReviewForOrder(order);
        decideCancelOrder(order, true);
        appendOrderChangeHistory(order, "cancel_approved", getActorForOrder(order), {});
        persistAndRerender();
        closeCancelApprovalModal();
        alert('취소 요청을 승인했습니다. 주문이 취소 상태로 표시됩니다.');
    } else if (action === 'reject-cancel') {
        if (!order || !order.cancelRequest || order.cancelRequest.status !== 'pending') return;
        const actor = getActorForOrder(order);
        const reqBy = order.cancelRequest.requestedBy;
        if ((reqBy === 'consumer' && actor !== 'supplier') || (reqBy === 'supplier' && actor !== 'consumer')) return;
        if (!hasSeenPendingCancelReview(orderId, actor)) return;
        const reason = window.prompt("취소 요청 반려 사유를 입력해 주세요.", "");
        if (reason === null) return;
        order.cancelRequest.reason = String(reason || "").trim();
        clearSeenCancelReviewForOrder(order);
        decideCancelOrder(order, false);
        appendOrderChangeHistory(order, "cancel_rejected", getActorForOrder(order), { reason: order.cancelRequest.reason });
        persistAndRerender();
        closeCancelApprovalModal();
        alert('취소 요청을 반려했습니다. 사유가 요청자에게 전달됩니다.');
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
    inv.waitingCustomers = Math.max(0, parseInt(e.target.value, 10) || 0);
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

let consumerSearchDebounce = null;
document.getElementById('consumerOrderSearch')?.addEventListener('input', () => {
    clearTimeout(consumerSearchDebounce);
    consumerSearchDebounce = setTimeout(() => renderConsumerView(), 200);
});

let supplierSearchDebounce = null;
document.getElementById('supplierOrderSearch')?.addEventListener('input', () => {
    clearTimeout(supplierSearchDebounce);
    supplierSearchDebounce = setTimeout(() => renderSupplierView(), 200);
});

// 주문 현황 - 일별 필터 이벤트(조회 버튼 클릭 시 적용)
document.getElementById('ordersDateApplyBtn')?.addEventListener('click', () => {
    renderConsumerView();
});

// 판매 대시보드 기간 필터
document.getElementById('supplierDateApplyBtn')?.addEventListener('click', () => {
    renderSupplierView();
});

// 초기화
const initialRole = (currentUser.type === 'supplier' || currentUser.type === 'consumer') ? currentUser.type : 'consumer';
const bizEl = document.getElementById('bizName');
if (bizEl) bizEl.textContent = currentUser.name;
const roleSelectEl = document.getElementById('roleSelect');
if (roleSelectEl && auth) {
    const allowed = auth.roles;
    const consumerOpt = roleSelectEl.querySelector('option[value="consumer"]');
    const supplierOpt = roleSelectEl.querySelector('option[value="supplier"]');
    if (consumerOpt) consumerOpt.disabled = !allowed.includes('consumer');
    if (supplierOpt) supplierOpt.disabled = !allowed.includes('supplier');
    roleSelectEl.value = allowed.includes(initialRole) ? initialRole : (allowed[0] || 'consumer');
    currentUser.type = roleSelectEl.value;
    roleSelectEl.disabled = false;
    if (allowed.length === 1) {
        roleSelectEl.title = allowed.includes('supplier')
            ? '사업자분류에 따라 판매 대시보드만 이용할 수 있습니다.'
            : '사업자분류에 따라 구매 대시보드만 이용할 수 있습니다.';
    } else {
        roleSelectEl.title = '구매·판매 대시보드를 전환할 수 있습니다.';
    }
}

syncFleetNavVisibility();

initTheme();
initFormDefaults();
initOrdersDateFilterDefault();
initSupplierDateFilterDefault();
initTimeInputs();
initDateTimeToggles();
initDateTimeWheelAdjust();
initSupplyConditionToggles();
toggleOrderAddressBySupplyCondition();
renderAddressHistoryOptions();
setSupplierName(currentUser.name);
showView(currentUser.type);
tickDashboardClock();
setInterval(tickDashboardClock, 1000);

const scrollTopBtn = document.getElementById('scrollTopBtn');
if (scrollTopBtn) {
    scrollTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    window.addEventListener(
        'scroll',
        () => {
            scrollTopBtn.classList.toggle('is-visible', window.scrollY > 360);
        },
        { passive: true }
    );
}

async function bootstrapOrderViews() {
    const proceed = await initializeSupabaseOrders();
    if (proceed === false) return;
    const r = currentUser.type;
    if (r === 'consumer') renderConsumerView();
    if (r === 'supplier') renderSupplierView();
}
bootstrapOrderViews();
renderOrdersRemoteLoadBanner();

function wireOrderNotificationAck(buttonId, role) {
    document.getElementById(buttonId)?.addEventListener("click", () => {
        setOrderNotifSeenNow(role);
        renderOrderNotificationPanels();
    });
}
wireOrderNotificationAck("consumerOrderNotificationsAck", "consumer");
wireOrderNotificationAck("supplierOrderNotificationsAck", "supplier");

(function wireOrderNotificationItemClicks() {
    const bind = (cardId) => {
        const card = document.getElementById(cardId);
        if (!card || card.dataset.notifItemClickBound === "1") return;
        card.dataset.notifItemClickBound = "1";
        const role = cardId === "consumerOrderNotificationsCard" ? "consumer" : "supplier";
        card.addEventListener("click", (e) => {
            if (e.target.closest(".dashboard-order-notifications-strip-header button")) return;
            const item = e.target.closest(".dashboard-order-notif-item");
            if (!item) return;
            e.preventDefault();
            const orderId = item.getAttribute("data-order-id");
            const atIso = item.getAttribute("data-notif-at");
            if (!orderId || !atIso) return;
            ackOrderNotifItem(role, orderId, atIso);
            renderOrderNotificationPanels();
            focusDashboardOrderFromNotif(role, orderId);
        });
        card.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            const item = e.target.closest(".dashboard-order-notif-item");
            if (!item || e.target !== item) return;
            e.preventDefault();
            item.click();
        });
    };
    bind("consumerOrderNotificationsCard");
    bind("supplierOrderNotificationsCard");
})();

// 다른 탭/창에서 주문이 갱신되면 현재 화면도 즉시 반영 + 결정 알림(거절/승인)
window.addEventListener('storage', (e) => {
    if (!e) return;
    if (e.key !== ORDERS_STORAGE_KEY) return;
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
    teardownOrdersRealtime();
    if (supabaseClient) {
        supabaseClient.auth.signOut().catch(() => {});
    }
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
    try {
        saveOrdersToStorage();
    } catch (_) {}
}

