// H2GO AI 챗봇 (대시보드에서 사용)
// OpenAI는 서버(openai_test_server.py)가 보관한 키로 호출

const chatbotFab = document.getElementById("chatbotFab");
const chatbotPanel = document.getElementById("chatbotPanel");
const chatbotClose = document.getElementById("chatbotClose");
const chatbotMessages = document.getElementById("chatbotMessages");
const chatbotForm = document.getElementById("chatbotForm");
const chatbotInput = document.getElementById("chatbotInput");
const chatbotSend = document.getElementById("chatbotSend");
const chatbotStatus = document.getElementById("chatbotStatus");

// 대시보드에 챗봇 UI가 없으면 아무 것도 하지 않음
if (!chatbotFab || !chatbotPanel || !chatbotForm || !chatbotInput) {
    // noop
} else {
    const ACCESS_CODE_SESSION_KEY = "h2go_chat_access_code";

    function getAccessCode() {
        try {
            return (sessionStorage.getItem(ACCESS_CODE_SESSION_KEY) || "").trim();
        } catch (_) {
            return "";
        }
    }

    function setAccessCode(code) {
        try {
            sessionStorage.setItem(ACCESS_CODE_SESSION_KEY, String(code || "").trim());
        } catch (_) {}
    }

    function clearAccessCode() {
        try {
            sessionStorage.removeItem(ACCESS_CODE_SESSION_KEY);
        } catch (_) {}
    }

    async function promptForAccessCode() {
        const entered = window.prompt(
            "챗봇 접속 코드를 입력하세요.\n\n- 코드는 이 브라우저 탭(session)에만 임시 저장됩니다.\n- (OpenAI API Key가 아닙니다)"
        );
        const code = String(entered || "").trim();
        if (!code) return "";
        setAccessCode(code);
        return code;
    }

    let apiConfig = {
        base: "",
        mode: "chat", // "chat" | "respond"
    };

    function getPreferredBase() {
        try {
            if (window.H2GO_CHAT_API_BASE) return String(window.H2GO_CHAT_API_BASE);
        } catch (_) {}

        const isFile = window.location?.protocol === "file:";
        const isLikelyNotBackend = window.location?.port && window.location.port !== "3000";
        if (isFile || isLikelyNotBackend) return "http://127.0.0.1:3000";
        return "";
    }

    const chatState = {
        messages: [],
        busy: false,
        openedOnce: false,
    };

    async function checkChatHealth(base) {
        const url = `${base}/api/health`;
        try {
            const res = await fetch(url, { method: "GET" });
            if (!res.ok) throw new Error(`헬스체크 실패 (HTTP ${res.status})`);
            const data = await res.json().catch(() => ({}));
            return data || true;
        } catch (_) {
            return false;
        }
    }

    async function detectApi() {
        const preferred = getPreferredBase();

        // 1) 같은 오리진(상대경로) 시도
        if (await checkChatHealth("")) {
            apiConfig = { base: "", mode: "chat" };
            return apiConfig;
        }

        // 2) 파이썬 테스트 서버(기본 3000) 시도
        if (await checkChatHealth(preferred)) {
            apiConfig = { base: preferred, mode: "chat" };
            return apiConfig;
        }

        apiConfig = { base: preferred || "http://127.0.0.1:3000", mode: "chat" };
        return apiConfig;
    }

    function setChatOpen(open) {
        chatbotPanel.classList.toggle("open", !!open);
        chatbotPanel.setAttribute("aria-hidden", open ? "false" : "true");
        if (open) {
            chatbotInput?.focus();
            if (!chatState.openedOnce) {
                chatState.openedOnce = true;
                addBubble("assistant", "안녕하세요! H2GO AI입니다. 무엇을 도와드릴까요?");
                detectApi().then((cfg) => {
                    checkChatHealth(cfg.base).then((health) => {
                        if (!health) {
                            addBubble(
                                "assistant",
                                "현재 챗봇 서버 연결이 안 돼요.\n" +
                                    "- PowerShell에서 `python openai_test_server.py` 실행 (포트 3000)\n" +
                                    "- 브라우저에서 `http://127.0.0.1:3000/` 로 접속해 주세요."
                            );
                            return;
                        }
                        if (health?.access_required && !getAccessCode()) {
                            addBubble("assistant", "이 서버는 접속 코드가 필요합니다. 채팅창에 `/access` 를 입력해 설정해 주세요.");
                        }
                    });
                });
                addBubble("assistant", "이 챗봇은 서버에 저장된 OpenAI 키로 동작합니다. (키 입력은 필요하지 않아요)");
            }
        }
    }

    function setChatBusy(on, statusText = "") {
        chatState.busy = !!on;
        if (chatbotSend) chatbotSend.disabled = !!on;
        chatbotInput.disabled = !!on;
        if (chatbotStatus) chatbotStatus.textContent = statusText || "";
    }

    function addBubble(role, text) {
        const div = document.createElement("div");
        div.className = `chatbot-bubble ${role}`;
        div.textContent = text;
        chatbotMessages?.appendChild(div);
        if (chatbotMessages) chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
    }

    function normalizeText(s) {
        return String(s || "").replace(/\r\n/g, "\n").trim();
    }

    async function fetchJsonWithTimeout(url, init, timeoutMs = 45000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { ...init, signal: controller.signal });
            const data = await res.json().catch(() => ({}));
            return { res, data };
        } finally {
            clearTimeout(timer);
        }
    }

    async function sendChat(text) {
        const content = normalizeText(text);
        if (!content || chatState.busy) return;

        if (content === "/access") {
            const next = await promptForAccessCode();
            if (next) addBubble("assistant", "접속 코드가 설정되었습니다.");
            else addBubble("assistant", "접속 코드가 입력되지 않았습니다.");
            return;
        }
        if (content === "/clear") {
            clearAccessCode();
            addBubble("assistant", "접속 코드를 이 탭에서 삭제했습니다. 필요하면 `/access` 로 다시 설정하세요.");
            return;
        }

        addBubble("user", content);
        chatState.messages.push({ role: "user", content });

        setChatBusy(true, "답변 생성 중...");
        addBubble("assistant", "...");
        const typingEl = chatbotMessages?.lastElementChild;

        try {
            const cfg = await detectApi();
            const url = cfg.mode === "respond" ? `${cfg.base}/api/respond` : `${cfg.base}/api/chat`;
            const body =
                cfg.mode === "respond"
                    ? { input: content, model: "gpt-4.1-mini", temperature: 0.7 }
                    : { messages: chatState.messages, model: "gpt-4.1-mini", temperature: 0.7 };

            let accessCode = getAccessCode();
            let lastError = null;
            let data = {};

            for (let attempt = 0; attempt < 2; attempt++) {
                const r = await fetchJsonWithTimeout(
                    url,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            ...(accessCode ? { "X-H2GO-Access-Code": accessCode } : {}),
                        },
                        body: JSON.stringify(body),
                    },
                    45000
                );

                const res = r.res;
                data = r.data;

                if (res.ok) {
                    lastError = null;
                    break;
                }

                if (res.status === 401 && String(data?.error || "").includes("access_code_required")) {
                    if (attempt === 1) {
                        lastError = new Error("접속 코드가 올바르지 않거나 설정되지 않았습니다. `/access`로 다시 설정해 주세요.");
                        break;
                    }
                    const next = await promptForAccessCode();
                    if (!next) {
                        lastError = new Error("접속 코드가 필요합니다. 채팅창에 `/access`를 입력해 설정해 주세요.");
                        break;
                    }
                    accessCode = next;
                    continue;
                }

                lastError = new Error(data?.detail || data?.error || `요청 실패 (HTTP ${res.status})`);
                break;
            }

            if (lastError) throw lastError;

            const reply = normalizeText(data?.text || "");
            const finalText = reply || "답변을 생성하지 못했습니다. 다시 시도해 주세요.";

            if (typingEl) typingEl.textContent = finalText;
            else addBubble("assistant", finalText);

            chatState.messages.push({ role: "assistant", content: finalText });
            setChatBusy(false, "");
        } catch (e) {
            const msg = (e?.message || "").trim();
            let friendly = msg || "오류가 발생했습니다.";
            if (e?.name === "AbortError") {
                friendly = "응답이 너무 오래 걸려 요청을 중단했습니다(45초). 잠시 후 다시 시도해 주세요.";
            }
            if (/failed to fetch|networkerror|fetch/i.test(msg)) {
                friendly =
                    "서버 연결에 실패했습니다.\n" +
                    "- PowerShell에서 `python openai_test_server.py` 실행 (포트 3000)\n" +
                    "- 브라우저에서 `http://127.0.0.1:3000/` 로 접속해 주세요.";
            }
            if (typingEl) typingEl.textContent = friendly;
            setChatBusy(false, friendly);
        }
    }

    chatbotFab.addEventListener("click", () => setChatOpen(!chatbotPanel.classList.contains("open")));
    chatbotClose?.addEventListener("click", () => setChatOpen(false));
    chatbotPanel.addEventListener("click", (e) => {
        if (e.target === chatbotPanel) setChatOpen(false);
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") setChatOpen(false);
    });

    chatbotInput.addEventListener("input", () => {
        chatbotInput.style.height = "auto";
        chatbotInput.style.height = `${Math.min(chatbotInput.scrollHeight, 120)}px`;
    });

    chatbotInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            chatbotForm?.requestSubmit?.();
        }
    });

    chatbotForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = chatbotInput.value ?? "";
        chatbotInput.value = "";
        chatbotInput.style.height = "auto";
        await sendChat(text);
    });
}

