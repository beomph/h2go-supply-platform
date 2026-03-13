# AGENTS.md

## Cursor Cloud specific instructions

### Overview

H2GO는 수소 거래/공급망 플랫폼으로, 단일 Python HTTP 서버(`openai_test_server.py`)가 정적 파일 서빙과 OpenAI 프록시를 모두 담당합니다. Node.js, Docker, 빌드 스텝 없이 Python 표준 라이브러리 기반으로 동작합니다.

### Running the server

```bash
python3 openai_test_server.py
```

- 기본 포트: `3000` (환경변수 `PORT`로 변경 가능)
- 서버 시작 후 `http://127.0.0.1:3000/`으로 접속
- Health check: `GET /api/health`

### Key caveats

- **린트/테스트 프레임워크 없음**: 이 프로젝트에는 별도의 linter, formatter, 자동화된 테스트가 설정되어 있지 않습니다. 코드 검증은 서버 실행 및 브라우저 수동 테스트로 수행합니다.
- **데이터 저장**: 모든 사용자 데이터(계정, 주문, 재고)는 브라우저 `localStorage`에 저장됩니다. 서버 측 DB가 없으므로 브라우저를 바꾸면 데이터가 초기화됩니다.
- **AI 챗봇**: `OPENAI_API_KEY` 환경변수가 설정되어야 챗봇이 동작합니다. 미설정 시 챗봇 외 모든 기능(로그인, 대시보드, 주문, 재고 관리)은 정상 동작합니다.
- **빌드 없음**: 프론트엔드는 순수 HTML/CSS/JS로 빌드 스텝이 필요 없습니다. 파일 수정 후 브라우저 새로고침만 하면 됩니다.
- **pip 설치 위치**: Cloud VM에서 `pip install`이 `--user` 모드로 설치될 수 있습니다. `python3 -c "import openai"` 로 설치 확인 가능합니다.
