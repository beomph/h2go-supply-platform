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
   - `H2GO_CHAT_ACCESS_CODE` — (선택) 챗봇 접속 코드. 설정하면 사용자가 채팅창에 `/access` 입력 후 이 코드를 넣어야 챗봇 사용 가능.

5. **배포 후**
   - Render가 `pip install -r requirements.txt`로 `openai` 패키지를 설치하고, `python openai_test_server.py`로 서버를 실행합니다.
   - 발급된 URL(예: `https://h2go-supply-platform.onrender.com`)로 접속하면 랜딩·대시보드·AI 챗봇이 같은 도메인에서 동작합니다.
