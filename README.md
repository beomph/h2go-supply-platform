## H2GO 랜딩페이지 + AI 챗봇

이 프로젝트는 정적 랜딩페이지(`index.html`)와 데모 대시보드(`dashboard.html`)를 포함하며,
AI 챗봇은 **서버(`openai_test_server.py`)가 보관한 OpenAI API Key로만** 동작합니다.

### 보안 원칙 (중요)

- **OpenAI API Key는 절대 GitHub/브라우저에 넣지 않습니다.**
- 키는 배포 서버의 **환경변수 `OPENAI_API_KEY`** 로만 설정합니다.
- 공개 배포 시 비용/남용 방지를 위해 **레이트리밋**이 기본으로 적용됩니다.
- 필요하면 **접속 코드(패스워드)** 를 `H2GO_CHAT_ACCESS_CODE`로 설정해 접근을 제한하세요.

### 로컬 실행 (Windows / PowerShell)

프로젝트 폴더로 이동:

```powershell
cd "C:\Users\Administrator\Downloads\랜딩페이지 연습1"
```

패키지 설치:

```powershell
python -m pip install -r requirements.txt
```

환경변수 설정(예시):

```powershell
$env:OPENAI_API_KEY="여기에_본인_키"
```

(선택) 접속 코드 설정:

```powershell
$env:H2GO_CHAT_ACCESS_CODE="원하는_접속코드"
```

서버 실행:

```powershell
python openai_test_server.py
```

브라우저 접속:
- `http://127.0.0.1:3000/`

### (개발) PRD → 태스크 자동 생성 (OpenAI API Key 사용)

Taskmaster MCP의 `parse_prd`가 특정 공급자(예: Perplexity) 설정에 묶여 동작하지 않는 환경에서는,
아래 스크립트로 **OpenAI API 키를 사용해** `.taskmaster/docs/prd.txt`를 `.taskmaster/tasks/tasks.json`으로 자동 변환할 수 있습니다.

```powershell
$env:OPENAI_API_KEY="여기에_본인_키"
python scripts/parse_prd_openai.py --backup --num-tasks 12
```

- `--backup`: 기존 `tasks.json`을 `*.bak_YYYYMMDD_HHMMSS`로 백업합니다.
- **기본 동작**: 재파싱 시 **같은 id의 기존 태스크**에서 `done`/`in-progress` 등 상태를 유지합니다(작업 히스토리 보존).
- `--no-preserve-status`: 상태를 초기화하고 새로 시작하려면 이 옵션을 사용합니다.

### GitHub에 올릴 때

- `.env` 파일은 **절대 커밋하지 마세요** (`.gitignore`로 제외됨)
- 배포 플랫폼(Render/Fly.io/Railway 등)에서 `OPENAI_API_KEY`를 **환경변수로 설정**하면,
  사용자들은 키를 볼 수 없고 챗봇만 사용하게 됩니다.

### Render로 배포하기

1. **GitHub에 코드 푸시**  
   이 저장소를 GitHub에 올린 뒤, Render가 접근할 수 있도록 합니다.

2. **Render 대시보드에서 서비스 생성**
   - [Render](https://render.com) 로그인 후 **New → Web Service**
   - 연결할 GitHub 저장소 선택 (예: `beomph/h2go-supply-platform`)
   - 루트에 `render.yaml`이 있으면 **Blueprint**로 자동 인식되거나, 수동으로 다음처럼 설정합니다.

3. **수동 설정 시**
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python openai_test_server.py`
   - **Environment Variables** 에서 다음 변수를 추가합니다.

4. **필수 환경 변수**
   - `OPENAI_API_KEY` — OpenAI 플랫폼에서 발급한 API 키 (Secret로 저장)
   - `H2GO_SUPABASE_ANON_KEY` — Supabase **anon** 또는 **publishable** 키 (`sb_publishable_...` 포함). 설정 시 `/h2go-config.js`로 브라우저에 주입되어 **회원가입·로그인·주문 동기화**가 동작합니다. (service_role 금지)
   - `H2GO_CHAT_ACCESS_CODE` — (선택) 챗봇 접속 코드. 설정하면 사용자가 채팅창에 `/access` 입력 후 이 코드를 넣어야 챗봇 사용 가능.

5. **배포 후**
   - Render가 `pip install -r requirements.txt`로 `openai` 패키지를 설치하고, `python openai_test_server.py`로 서버를 실행합니다.
   - 발급된 URL(예: `https://h2go-supply-platform.onrender.com`)로 접속하면 랜딩·대시보드·AI 챗봇이 같은 도메인에서 동작합니다.

### Supabase 회원가입 DB 연동

회원가입은 Supabase Auth + `member_profiles` 테이블로 분리 저장됩니다.

1. Supabase SQL Editor에서 `scripts/supabase_member_profiles.sql` 실행
2. Supabase 프로젝트의 **anon key** 준비
3. 브라우저 콘솔에서 1회 설정

```js
localStorage.setItem("h2go_supabase_anon_key", "여기에_supabase_anon_key");
```

4. 로그인 페이지 새로고침 후 회원가입/로그인

주의:
- 비밀번호는 `auth.users`에만 저장됩니다. `member_profiles`에는 사업자명·사업자번호·**대표자명**·**사업자분류**(공급자/운송자/수요자)·사용자명·**회원권한**(관리자/담당자/모니터링)·로그인 아이디(`login_id`)가 저장됩니다.
- 대시보드는 사업자분류와 수요/공급 화면 전환에 맞춰 `consumer`/`supplier` 모드를 씁니다(운송자는 기본 수요자 화면).

### Supabase 주문 DB 연동

구매자/공급자 주문 데이터는 `h2go_orders` 테이블에 저장됩니다.

1. Supabase SQL Editor에서 `scripts/supabase_orders.sql` 실행
2. 로그인 페이지에서 설정한 anon key를 그대로 사용
3. 로그인 후 대시보드에서 주문 생성/변경/상태 변경

`h2go_orders`에는 다음이 포함됩니다.
- 수요자/공급자 사업자명 및 주소
- 주문요청시각, 납품예정시각, 납품조건, 주문상태, 수요자 요청사항
- 주문 변경 이력(`change_history`)
- 공급자 운송 시작 시 T/T 번호/기사명(`inbound_tt_numbers`, `inbound_driver_name`)
- 완료 시 직전 주문의 출고(회수) 정보 및 납품량/양측 확인자(`outbound_*`, `supplier_signer_name`, `consumer_signer_name`)
