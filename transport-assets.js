// H2GO — 튜브트레일러(T/T) · 운반기사 등록 (Supabase)
// 공통 상수·유틸: js/h2go-utils.js 참고

function getAuth() {
    const a = safeJsonParse(localStorage.getItem(AUTH_KEY) || "null", null);
    if (!a || typeof a !== "object") return null;
    const id = String(a.id || "").trim().toLowerCase();
    const name = String(a.name || "").trim();
    if (!id || !name) return null;
    return { ...a, id, name, supabaseUserId: a.supabaseUserId || null };
}

let supabaseClient = null;

function setFleetStatus(message, kind) {
    const el = document.getElementById("fleetStatus");
    if (!el) return;
    if (!message) {
        el.classList.add("is-hidden");
        el.textContent = "";
        el.classList.remove("transport-status-banner--error", "transport-status-banner--ok");
        return;
    }
    el.classList.remove("is-hidden");
    el.textContent = message;
    el.classList.remove("transport-status-banner--error", "transport-status-banner--ok");
    el.classList.add(kind === "ok" ? "transport-status-banner--ok" : "transport-status-banner--error");
}

function formatDateDisplay(iso) {
    if (!iso) return "—";
    const d = new Date(String(iso) + "T12:00:00");
    if (!Number.isFinite(d.getTime())) return String(iso);
    return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function escapeHtml(s) {
    return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

async function requireSession() {
    supabaseClient = getSupabaseClient();
    if (!supabaseClient) {
        setFleetStatus("Supabase 연결 정보가 없습니다. /h2go-config.js에 H2GO_SUPABASE_ANON_KEY를 설정하거나 브라우저에 anon 키를 저장해 주세요.", "err");
        return null;
    }
    const { data, error } = await supabaseClient.auth.getSession();
    if (error || !data?.session) {
        redirectToLogin();
        return null;
    }
    return data.session;
}

function resetTtForm() {
    document.getElementById("ttEditId").value = "";
    document.getElementById("ttVehicleNumber").value = "";
    document.getElementById("ttOwnerName").value = "";
    document.getElementById("ttVehicleInspection").value = "";
    document.getElementById("ttPressureInspection").value = "";
    document.getElementById("ttNotes").value = "";
    document.getElementById("ttSubmitBtn").textContent = "저장";
}

function resetDrvForm() {
    document.getElementById("drvEditId").value = "";
    document.getElementById("drvName").value = "";
    document.getElementById("drvTractorPlate").value = "";
    document.getElementById("drvModelYear").value = "";
    document.getElementById("drvModelName").value = "";
    document.getElementById("drvVehicleInspection").value = "";
    document.getElementById("drvNotes").value = "";
    document.getElementById("drvSubmitBtn").textContent = "저장";
}

async function loadTubeTrailers() {
    const mount = document.getElementById("ttListMount");
    if (!mount || !supabaseClient) return;
    const { data, error } = await supabaseClient
        .from("h2go_tube_trailers")
        .select("*")
        .order("vehicle_number", { ascending: true });
    if (error) {
        mount.innerHTML = `<p class="transport-empty">목록을 불러오지 못했습니다: ${escapeHtml(error.message)}</p>`;
        return;
    }
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
        mount.innerHTML = '<p class="transport-empty">등록된 T/T가 없습니다.</p>';
        return;
    }
    mount.innerHTML = `
        <table class="transport-table">
            <thead>
                <tr>
                    <th>차량번호</th>
                    <th>소유자</th>
                    <th>차량검사</th>
                    <th>압력용기검사</th>
                    <th>기타</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${rows
                    .map(
                        (r) => `
                    <tr data-id="${escapeHtml(r.id)}">
                        <td><strong>${escapeHtml(r.vehicle_number)}</strong></td>
                        <td>${escapeHtml(r.owner_name)}</td>
                        <td>${escapeHtml(formatDateDisplay(r.vehicle_inspection_date))}</td>
                        <td>${escapeHtml(formatDateDisplay(r.pressure_vessel_inspection_date))}</td>
                        <td>${escapeHtml((r.notes || "").slice(0, 80))}${(r.notes || "").length > 80 ? "…" : ""}</td>
                        <td class="transport-table-actions">
                            <button type="button" class="btn btn-tiny btn-secondary" data-edit-tt="${escapeHtml(r.id)}">수정</button>
                            <button type="button" class="btn btn-tiny btn-secondary" data-del-tt="${escapeHtml(r.id)}">삭제</button>
                        </td>
                    </tr>`
                    )
                    .join("")}
            </tbody>
        </table>`;
    mount.querySelectorAll("[data-edit-tt]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-edit-tt");
            const row = rows.find((x) => x.id === id);
            if (!row) return;
            document.getElementById("ttEditId").value = row.id;
            document.getElementById("ttVehicleNumber").value = row.vehicle_number || "";
            document.getElementById("ttOwnerName").value = row.owner_name || "";
            document.getElementById("ttVehicleInspection").value = row.vehicle_inspection_date || "";
            document.getElementById("ttPressureInspection").value = row.pressure_vessel_inspection_date || "";
            document.getElementById("ttNotes").value = row.notes || "";
            document.getElementById("ttSubmitBtn").textContent = "수정 저장";
            document.getElementById("ttVehicleNumber").focus();
        });
    });
    mount.querySelectorAll("[data-del-tt]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-del-tt");
            if (!id || !confirm("이 T/T를 삭제할까요?")) return;
            const { error: delErr } = await supabaseClient.from("h2go_tube_trailers").delete().eq("id", id);
            if (delErr) {
                alert(delErr.message || "삭제에 실패했습니다.");
                return;
            }
            setFleetStatus("삭제되었습니다.", "ok");
            await loadTubeTrailers();
        });
    });
}

async function loadDrivers() {
    const mount = document.getElementById("drvListMount");
    if (!mount || !supabaseClient) return;
    const { data, error } = await supabaseClient
        .from("h2go_transport_drivers")
        .select("*")
        .order("driver_name", { ascending: true });
    if (error) {
        mount.innerHTML = `<p class="transport-empty">목록을 불러오지 못했습니다: ${escapeHtml(error.message)}</p>`;
        return;
    }
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
        mount.innerHTML = '<p class="transport-empty">등록된 운반기사가 없습니다.</p>';
        return;
    }
    mount.innerHTML = `
        <table class="transport-table">
            <thead>
                <tr>
                    <th>기사명</th>
                    <th>트랙터 번호</th>
                    <th>연식</th>
                    <th>모델명</th>
                    <th>차량검사</th>
                    <th>기타</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${rows
                    .map(
                        (r) => `
                    <tr data-id="${escapeHtml(r.id)}">
                        <td><strong>${escapeHtml(r.driver_name)}</strong></td>
                        <td>${escapeHtml(r.tractor_plate_number)}</td>
                        <td>${escapeHtml(r.vehicle_model_year)}</td>
                        <td>${escapeHtml(r.vehicle_model_name)}</td>
                        <td>${escapeHtml(formatDateDisplay(r.vehicle_inspection_date))}</td>
                        <td>${escapeHtml((r.notes || "").slice(0, 60))}${(r.notes || "").length > 60 ? "…" : ""}</td>
                        <td class="transport-table-actions">
                            <button type="button" class="btn btn-tiny btn-secondary" data-edit-drv="${escapeHtml(r.id)}">수정</button>
                            <button type="button" class="btn btn-tiny btn-secondary" data-del-drv="${escapeHtml(r.id)}">삭제</button>
                        </td>
                    </tr>`
                    )
                    .join("")}
            </tbody>
        </table>`;
    mount.querySelectorAll("[data-edit-drv]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-edit-drv");
            const row = rows.find((x) => x.id === id);
            if (!row) return;
            document.getElementById("drvEditId").value = row.id;
            document.getElementById("drvName").value = row.driver_name || "";
            document.getElementById("drvTractorPlate").value = row.tractor_plate_number || "";
            document.getElementById("drvModelYear").value = row.vehicle_model_year || "";
            document.getElementById("drvModelName").value = row.vehicle_model_name || "";
            document.getElementById("drvVehicleInspection").value = row.vehicle_inspection_date || "";
            document.getElementById("drvNotes").value = row.notes || "";
            document.getElementById("drvSubmitBtn").textContent = "수정 저장";
            document.getElementById("drvName").focus();
        });
    });
    mount.querySelectorAll("[data-del-drv]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-del-drv");
            if (!id || !confirm("이 운반기사를 삭제할까요?")) return;
            const { error: delErr } = await supabaseClient.from("h2go_transport_drivers").delete().eq("id", id);
            if (delErr) {
                alert(delErr.message || "삭제에 실패했습니다.");
                return;
            }
            setFleetStatus("삭제되었습니다.", "ok");
            await loadDrivers();
        });
    });
}

async function refreshAllLists() {
    setFleetStatus("", "");
    await Promise.all([loadTubeTrailers(), loadDrivers()]);
}

function initTabs() {
    const tabs = document.querySelectorAll(".transport-tab");
    const panelTrailers = document.getElementById("panelTrailers");
    const panelDrivers = document.getElementById("panelDrivers");
    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            const panel = tab.dataset.panel;
            tabs.forEach((t) => {
                const on = t.dataset.panel === panel;
                t.classList.toggle("is-active", on);
                t.setAttribute("aria-selected", on ? "true" : "false");
            });
            const showTt = panel === "trailers";
            panelTrailers.classList.toggle("is-active", showTt);
            panelDrivers.classList.toggle("is-active", !showTt);
        });
    });
}

// ---------- boot ----------
const auth = getAuth();
if (!auth) {
    redirectToLogin();
} else {
initTheme();

const bizEl = document.getElementById("bizName");
if (bizEl) bizEl.textContent = auth.name;

document.getElementById("logoutBtn")?.addEventListener("click", () => {
    if (!confirm("로그아웃하시겠습니까?")) return;
    const client = getSupabaseClient();
    if (client) client.auth.signOut().catch(() => {});
    try {
        localStorage.removeItem(AUTH_KEY);
    } catch (_) {}
    redirectToLogin();
});

initTabs();

document.getElementById("ttResetBtn")?.addEventListener("click", () => {
    resetTtForm();
});

document.getElementById("drvResetBtn")?.addEventListener("click", () => {
    resetDrvForm();
});

document.getElementById("ttForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const session = await requireSession();
    if (!session) return;
    const editId = document.getElementById("ttEditId").value.trim();
    const vehicle_number = String(document.getElementById("ttVehicleNumber").value || "").trim();
    if (!vehicle_number) {
        alert("차량번호를 입력해 주세요.");
        return;
    }
    const payload = {
        vehicle_number,
        owner_name: String(document.getElementById("ttOwnerName").value || "").trim(),
        vehicle_inspection_date: document.getElementById("ttVehicleInspection").value || null,
        pressure_vessel_inspection_date: document.getElementById("ttPressureInspection").value || null,
        notes: String(document.getElementById("ttNotes").value || "").trim(),
        owner_member_id: session.user.id,
    };
    let error;
    if (editId) {
        const { owner_member_id, ...updatePayload } = payload;
        const res = await supabaseClient.from("h2go_tube_trailers").update(updatePayload).eq("id", editId);
        error = res.error;
    } else {
        const res = await supabaseClient.from("h2go_tube_trailers").insert(payload);
        error = res.error;
    }
    if (error) {
        alert(error.message || "저장에 실패했습니다.");
        return;
    }
    setFleetStatus("저장되었습니다.", "ok");
    resetTtForm();
    await loadTubeTrailers();
});

document.getElementById("drvForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const session = await requireSession();
    if (!session) return;
    const editId = document.getElementById("drvEditId").value.trim();
    const driver_name = String(document.getElementById("drvName").value || "").trim();
    if (!driver_name) {
        alert("기사명을 입력해 주세요.");
        return;
    }
    const payload = {
        driver_name,
        tractor_plate_number: String(document.getElementById("drvTractorPlate").value || "").trim(),
        vehicle_model_year: String(document.getElementById("drvModelYear").value || "").trim(),
        vehicle_model_name: String(document.getElementById("drvModelName").value || "").trim(),
        vehicle_inspection_date: document.getElementById("drvVehicleInspection").value || null,
        notes: String(document.getElementById("drvNotes").value || "").trim(),
        owner_member_id: session.user.id,
    };
    let error;
    if (editId) {
        const { owner_member_id, ...updatePayload } = payload;
        const res = await supabaseClient.from("h2go_transport_drivers").update(updatePayload).eq("id", editId);
        error = res.error;
    } else {
        const res = await supabaseClient.from("h2go_transport_drivers").insert(payload);
        error = res.error;
    }
    if (error) {
        alert(error.message || "저장에 실패했습니다.");
        return;
    }
    setFleetStatus("저장되었습니다.", "ok");
    resetDrvForm();
    await loadDrivers();
});

(async function boot() {
    const session = await requireSession();
    if (!session) return;
    await refreshAllLists();
})();

}
