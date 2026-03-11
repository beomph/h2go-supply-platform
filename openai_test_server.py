from __future__ import annotations

import json
import mimetypes
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional
from urllib.parse import unquote, urlparse


BASE_DIR = Path(__file__).resolve().parent

# === 운영/보안 설정 ===
# - OpenAI 키는 반드시 서버 환경변수(또는 .env)로만 보관하세요. 절대 브라우저/레포에 넣지 않습니다.
# - 공개 배포 시 비용 폭탄 방지를 위해 최소 레이트리밋을 켜는 것을 강력 권장합니다.
RATE_LIMIT_WINDOW_SEC = int(os.getenv("H2GO_RATE_WINDOW_SEC", "60"))  # 기본 60초
RATE_LIMIT_MAX_REQUESTS = int(os.getenv("H2GO_RATE_MAX", "12"))       # 기본 60초에 12회

# 선택: 접속 코드(패스워드). 설정하면 이 코드를 아는 사용자만 챗봇 사용 가능
ACCESS_CODE_ENV = "H2GO_CHAT_ACCESS_CODE"

# 메모리 기반 레이트리밋 (프로세스 재시작 시 초기화)
_rate_logs: dict[str, list[float]] = {}


SYSTEM_PROMPT_H2GO = """\
당신은 H2GO(수소 거래/공급망 연결 플랫폼) 전용 AI 챗봇입니다.

역할:
- H2GO 서비스 소개, 이용 방법, 기능(거래/주문/매칭/운송 추적/대시보드), 가입/로그인 흐름, 역할(공급자/수요자/운송자)에 대한 질문에 한국어로 명확하게 답합니다.
- 사용자가 제공한 정보가 부족하면, 1~2개의 짧은 확인 질문을 먼저 합니다.
- H2GO와 무관한 질문에는 정중히 범위를 안내하고, 가능하면 H2GO 맥락으로 유도합니다.

제약:
- API 키, 비밀번호 등 민감정보를 요청/노출하지 마세요.
- 법률/투자 자문처럼 확정적 조언은 피하고, 필요한 경우 전문가 상담을 권하세요.
"""


def _add_cors(handler: BaseHTTPRequestHandler) -> None:
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type, X-H2GO-Access-Code")


def _client_ip(handler: BaseHTTPRequestHandler) -> str:
    # 배포 환경(리버스 프록시)에서는 X-Forwarded-For가 들어올 수 있음
    xff = (handler.headers.get("X-Forwarded-For") or "").strip()
    if xff:
        # "client, proxy1, proxy2" 형태일 수 있어 첫 번째를 사용
        return xff.split(",")[0].strip() or "unknown"
    try:
        return str(handler.client_address[0])
    except Exception:
        return "unknown"


def _rate_limit_ok(ip: str) -> bool:
    now = time.time()
    window_start = now - float(RATE_LIMIT_WINDOW_SEC)
    entries = _rate_logs.get(ip) or []
    entries = [t for t in entries if t >= window_start]
    if len(entries) >= RATE_LIMIT_MAX_REQUESTS:
        _rate_logs[ip] = entries
        return False
    entries.append(now)
    _rate_logs[ip] = entries
    return True


def _load_dotenv(base_dir: Path) -> None:
    """
    외부 패키지 없이 .env(옵션)를 읽어 환경변수를 주입합니다.
    형식: KEY=VALUE (따옴표는 선택)
    """
    env_path = base_dir / ".env"
    if not env_path.exists():
        return

    try:
        raw = env_path.read_text(encoding="utf-8")
    except Exception:
        return

    for line in raw.splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        key = k.strip()
        val = v.strip().strip("'").strip('"')
        # 로컬 개발에서는 .env가 PowerShell에 설정된 환경변수보다 우선하도록 덮어씁니다.
        if key:
            os.environ[key] = val


def _json(handler: BaseHTTPRequestHandler, status: int, data: dict[str, Any]) -> None:
    body = (json.dumps(data, ensure_ascii=False) + "\n").encode("utf-8")
    handler.send_response(status)
    _add_cors(handler)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _safe_resolve_under_base(base_dir: Path, request_path: str) -> Optional[Path]:
    p = unquote(request_path.split("?", 1)[0])
    if p.startswith("/"):
        p = p[1:]
    if not p:
        p = "index.html"

    candidate = (base_dir / p).resolve()
    base_resolved = base_dir.resolve()

    if candidate == base_resolved or base_resolved in candidate.parents:
        return candidate
    return None


def _guess_content_type(path: Path) -> str:
    ctype, _ = mimetypes.guess_type(str(path))
    if ctype:
        if ctype.startswith("text/"):
            return f"{ctype}; charset=utf-8"
        if ctype == "application/javascript":
            return "application/javascript; charset=utf-8"
        return ctype

    if path.suffix.lower() == ".js":
        return "application/javascript; charset=utf-8"
    if path.suffix.lower() == ".css":
        return "text/css; charset=utf-8"
    if path.suffix.lower() in (".html", ".htm"):
        return "text/html; charset=utf-8"
    return "application/octet-stream"


def _send_file(handler: BaseHTTPRequestHandler, path: Path, content_type: str) -> None:
    try:
        data = path.read_bytes()
    except FileNotFoundError:
        handler.send_error(404)
        return

    handler.send_response(200)
    _add_cors(handler)
    handler.send_header("Content-Type", content_type)
    # 로컬 개발 중에는 캐시로 인해 이전 화면이 계속 보일 수 있어 no-store로 고정
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:
        # 콘솔 로그를 너무 시끄럽지 않게 유지
        sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), fmt % args))

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        _add_cors(self)
        self.end_headers()

    def do_HEAD(self) -> None:
        """
        Render는 포트 감지를 위해 HEAD 요청을 보낼 수 있습니다.
        BaseHTTPRequestHandler 기본 구현은 501을 반환하므로, 최소한의 HEAD 처리를 제공합니다.
        """
        parsed = urlparse(self.path)

        if parsed.path == "/api/health":
            self.send_response(200)
            _add_cors(self)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        # 루트/인덱스는 항상 index.html
        if parsed.path in ("/", "/index.html"):
            target = (BASE_DIR / "index.html").resolve()
            if not target.exists() or not target.is_file():
                self.send_error(404)
                return
            ctype = "text/html; charset=utf-8"
            try:
                size = target.stat().st_size
            except Exception:
                size = 0
            self.send_response(200)
            _add_cors(self)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(size))
            self.end_headers()
            return

        target = _safe_resolve_under_base(BASE_DIR, parsed.path)
        if not target or not target.exists() or not target.is_file():
            self.send_error(404)
            return

        try:
            size = target.stat().st_size
        except Exception:
            size = 0
        self.send_response(200)
        _add_cors(self)
        self.send_header("Content-Type", _guess_content_type(target))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(size))
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/api/health":
            access_required = bool((os.getenv(ACCESS_CODE_ENV) or "").strip())
            return _json(
                self,
                200,
                {
                    "ok": True,
                    "service": "openai_test_server",
                    "mode": "chat",
                    "access_required": access_required,
                    "rate_limit": {"window_sec": RATE_LIMIT_WINDOW_SEC, "max_requests": RATE_LIMIT_MAX_REQUESTS},
                },
            )

        if parsed.path == "/whoami":
            body = (
                "OK: H2GO openai_test_server.py\n"
                f"BASE_DIR={str(BASE_DIR)}\n"
                f"ts={int(time.time())}\n"
            ).encode("utf-8")
            self.send_response(200)
            _add_cors(self)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            sys.stderr.write("[serve] GET /whoami\n")
            return

        # 루트는 항상 index.html (랜딩페이지)
        if parsed.path in ("/", "/index.html"):
            target = (BASE_DIR / "index.html").resolve()
            sys.stderr.write(f"[serve] GET {parsed.path} -> {str(target)}\n")
            if not target.exists() or not target.is_file():
                self.send_error(404)
                return
            return _send_file(self, target, "text/html; charset=utf-8")

        # 이전 테스트 페이지로 접근해도 랜딩페이지(/)로 보내기
        if parsed.path == "/openai_test.html":
            self.send_response(302)
            _add_cors(self)
            self.send_header("Location", "/")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return

        target = _safe_resolve_under_base(BASE_DIR, parsed.path)
        if not target:
            self.send_error(400)
            return
        if not target.exists() or not target.is_file():
            self.send_error(404)
            return

        sys.stderr.write(f"[serve] GET {parsed.path} -> {str(target)}\n")
        return _send_file(self, target, _guess_content_type(target))

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path not in ("/api/respond", "/api/chat"):
            self.send_error(404)
            return

        # 레이트리밋 (비용/남용 방지)
        ip = _client_ip(self)
        if not _rate_limit_ok(ip):
            return _json(
                self,
                429,
                {
                    "error": "rate_limited",
                    "detail": f"요청이 너무 많습니다. 잠시 후 다시 시도해 주세요. (IP={ip})",
                },
            )

        # 선택: 접속 코드(패스워드)
        access_required = (os.getenv(ACCESS_CODE_ENV) or "").strip()
        if access_required:
            provided = (self.headers.get("X-H2GO-Access-Code") or "").strip()
            if not provided or provided != access_required:
                return _json(
                    self,
                    401,
                    {
                        "error": "access_code_required",
                        "detail": "챗봇 접속 코드가 필요합니다.",
                    },
                )

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return _json(self, 400, {"error": "잘못된 Content-Length 입니다."})

        raw = self.rfile.read(length) if length > 0 else b""
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            return _json(self, 400, {"error": "JSON 파싱 실패. application/json으로 보내주세요."})

        model = str(payload.get("model", "gpt-4.1-mini")).strip() or "gpt-4.1-mini"
        temperature = payload.get("temperature", 0.7)
        try:
            temperature_f = float(temperature)
        except Exception:
            temperature_f = 0.7

        input_text = ""
        messages: list[dict[str, Any]] = []

        if parsed.path == "/api/respond":
            input_text = str(payload.get("input", "")).strip()
            if not input_text:
                return _json(self, 400, {"error": "input이 비었습니다."})
        else:
            raw_messages = payload.get("messages", [])
            if not isinstance(raw_messages, list) or not raw_messages:
                return _json(self, 400, {"error": "messages는 비어있지 않은 배열이어야 합니다."})

            for m in raw_messages:
                if not isinstance(m, dict):
                    continue
                role = str(m.get("role", "")).strip()
                content = str(m.get("content", "")).strip()
                if role not in ("user", "assistant"):
                    continue
                if not content:
                    continue
                messages.append({"role": role, "content": content})

            if not messages:
                return _json(self, 400, {"error": "유효한 messages가 없습니다."})

        # OpenAI 키는 서버에서만 보관 (브라우저에서 받지 않음)
        _load_dotenv(BASE_DIR)
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            return _json(
                self,
                500,
                {
                    "error": (
                        "OpenAI API 키가 없습니다.\n"
                        "- 서버(배포 환경)에서 OPENAI_API_KEY 환경변수를 설정해 주세요.\n"
                        "- (보안상 브라우저에서 키를 입력받는 방식은 사용하지 않습니다)"
                    ),
                },
            )

        try:
            from openai import OpenAI
        except Exception as e:
            return _json(
                self,
                500,
                {
                    "error": "openai 패키지가 설치되어 있지 않습니다. 설치: pip install openai",
                    "detail": repr(e),
                },
            )

        # OpenAI 호출이 무한 대기 상태가 되지 않도록, 지원되는 버전에서는 timeout을 설정합니다.
        try:
            client = OpenAI(api_key=api_key, timeout=30.0, max_retries=2)
        except TypeError:
            client = OpenAI(api_key=api_key)
        try:
            # 문제점: 이전에 Node 서버를 쓰려 했지만 PC에 Node가 설치되어 있지 않아(=서버 미실행) localhost 접속이 실패했음
            # 해결: 파이썬 표준 라이브러리 기반 로컬 서버로 대체하여, Node 설치 없이도 키 테스트가 가능하게 구성
            if parsed.path == "/api/respond":
                r = client.responses.create(
                    model=model,
                    instructions=SYSTEM_PROMPT_H2GO,
                    input=input_text,
                    temperature=temperature_f,
                )
            else:
                r = client.responses.create(
                    model=model,
                    instructions=SYSTEM_PROMPT_H2GO,
                    input=messages,
                    temperature=temperature_f,
                )
        except Exception as e:
            detail = repr(e)
            dlow = detail.lower()

            # OpenAI가 내려주는 대표 오류들을 HTTP 상태로 최대한 매핑
            if "invalid_api_key" in dlow or "incorrect api key" in dlow:
                return _json(
                    self,
                    401,
                    {
                        "error": "API 키가 올바르지 않습니다. (invalid_api_key)",
                        "detail": detail,
                        "hint": "OpenAI 콘솔에서 새 키를 발급받아 .env의 OPENAI_API_KEY를 교체한 뒤 서버를 재시작하세요.",
                    },
                )

            if "insufficient_quota" in dlow or "exceeded your current quota" in dlow:
                return _json(
                    self,
                    429,
                    {
                        "error": "사용 가능한 크레딧/한도가 부족합니다. (insufficient_quota)",
                        "detail": detail,
                        "hint": (
                            "OpenAI 콘솔에서 결제/크레딧(또는 프로젝트 예산/한도)을 설정해야 합니다. "
                            "설정 후 몇 분 뒤 다시 시도해 주세요."
                        ),
                    },
                )

            return _json(self, 500, {"error": "OpenAI API 호출 실패", "detail": detail})

        return _json(self, 200, {"text": r.output_text})


def main() -> int:
    # 배포(Render 등)에서는 반드시 0.0.0.0에 바인딩해야 외부에서 포트 감지가 됩니다.
    host = "0.0.0.0"
    # 배포 플랫폼(Render)은 PORT 환경변수를 제공합니다.
    port = int(os.getenv("PORT") or "3000")

    _load_dotenv(BASE_DIR)
    if os.getenv("OPENAI_API_KEY", "").strip():
        print("OPENAI_API_KEY: 설정됨")
    else:
        print("OPENAI_API_KEY: 미설정 (요청 시 500 오류가 납니다)")

    access_required = (os.getenv(ACCESS_CODE_ENV) or "").strip()
    if access_required:
        print(f"{ACCESS_CODE_ENV}: 설정됨 (접속 코드 필요)")
    else:
        print(f"{ACCESS_CODE_ENV}: 미설정 (누구나 접근 가능)")

    print(f"레이트리밋: {RATE_LIMIT_WINDOW_SEC}초 동안 {RATE_LIMIT_MAX_REQUESTS}회/IP")

    index_path = (BASE_DIR / "index.html").resolve()
    openai_test_path = (BASE_DIR / "openai_test.html").resolve()
    print(f"BASE_DIR: {str(BASE_DIR)}")
    print(f"index.html: {'존재' if index_path.exists() else '없음'} ({str(index_path)})")
    print(f"openai_test.html: {'존재' if openai_test_path.exists() else '없음'} ({str(openai_test_path)})")

    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"서버 실행: http://{host}:{port}")
    print("브라우저에서 / 로 접속하세요. (index.html)")
    print("종료: Ctrl+C")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        return 0
    finally:
        httpd.server_close()


if __name__ == "__main__":
    raise SystemExit(main())

