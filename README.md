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

