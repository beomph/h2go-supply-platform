# H2GO 수소거래 플랫폼 — Claude 작업 가이드

## 프로젝트 개요
수소 공급망 B2B 플랫폼. 수요자(구매)·공급자(판매) 대시보드. 운송자 대시보드는 미구현.
- **배포**: Render (`render.yaml`) / GitHub: `beomph/h2go-supply-platform`
- **DB**: Supabase (`h2go_orders`, `member_profiles`, `h2go_tube_trailers`, `h2go_transport_drivers`)

## 핵심 파일 맵

### 진입점
| 파일 | 역할 |
|------|------|
| `index.html` + `script.js` | 로그인·회원가입 |
| `dashboard.html` + `dashboard.js` | 구매·판매 대시보드 (메인) |
| `transport-assets.html` + `transport-assets.js` | T/T·운송기사 관리 |
| `물량확인증_양식.html` | 인쇄용 물량확인증 |
| `openai_test_server.py` | AI 챗봇 + 정적파일 서버 (port 3000) |

### 공유 유틸
| 파일 | 역할 |
|------|------|
| `js/h2go-utils.js` | AUTH_KEY·THEME_KEY·safeJsonParse·getSupabaseUrl/AnonKey/Client·applyThemeClass·initTheme·redirectToLogin |
| `js/supabase-client.js` | Supabase 클라이언트 ES모듈 |

### 스타일
| 파일 | 역할 |
|------|------|
| `styles.css` | 전역·인증 페이지 스타일 |
| `dashboard.css` | 대시보드 전용 스타일 |
| `transport-assets.css` | 운송자산 페이지 스타일 |
| `figma-tokens.css` | 디자인 토큰 (Figma 동기화) |

## dashboard.js 주요 함수 위치 (5,500줄)

| 함수/섹션 | 위치 | 설명 |
|-----------|------|------|
| `getAuth()` | ~line 195 | 로그인 세션 읽기 |
| `getSupabaseClient()` | `js/h2go-utils.js` | Supabase 클라이언트 |
| `fetchApprovedSupplierDirectoryUsernames()` | ~line 103 | 공급자 목록 조회 |
| `readRegisteredSuppliers()` | ~line 91 | 등록 공급자 읽기 |
| `formatHistoryNotification()` | ~line 3917 | 알림 메시지 포맷 (title·orderId·text 반환) |
| `renderOneOrderNotifPanel()` | ~line 4000 | 알림 패널 HTML 렌더링 |
| `renderConsumerView()` | 대시보드 구매화면 렌더 |
| `renderSupplierView()` | 대시보드 판매화면 렌더 |
| `applyThemeClass()` / `initTheme()` | `js/h2go-utils.js` | 테마 토글 |
| `appendOrderChangeHistory()` | 주문 이력 추가 |
| `saveOrdersToStorage()` | localStorage + Supabase 동기화 |

## 모달 목록 (dashboard.html)
| ID | 용도 |
|----|------|
| `newOrderModal` | 새 주문 생성 |
| `qtyConfirmModal` | 물량확인증 (iframe) |
| `exFactoryChargeModal` | 충전 완료 시각 입력 |
| `transportStartModal` | 운송 시작 (T/T·기사) |
| `orderMapModal` | 배송 경로 지도 (Leaflet) |
| `changeRequestModal` | 납품 변경 요청 |
| `changeApprovalModal` | 변경 요청 승인·반려 |
| `cancelApprovalModal` | 취소 요청 승인·반려 |
| `supplierSelectModal` | 공급자 선택 |
| `deliverySettlementModal` | 도착도 물량 정산 |
| `exFactoryFlowKgModal` | 출하도 유량계 입력 |
| `transportAssetPickModal` | 운송자원 선택 |

## 주문 상태 흐름
```
pending → accepted → in_transit → completed
                 ↘ empty_in_transit → empty_arrived → in_transit (출하도)
cancelled / cancel_requested → cancel_approved
```

## 환경변수 (.env — gitignore됨)
```
GMAIL_USER=drphb1104@gmail.com
GMAIL_APP_PASSWORD=          ← 앱 비밀번호 미입력 상태
```

## npm 스크립트
```
npm run gmail          # Gmail 테스트 발송 (gmail-send.js)
npm run supabase:ping  # Supabase 연결 확인
```

## 작업 규칙
- `.env`는 gitignore — 절대 커밋 안 됨
- `figma-tokens.css`, `scripts/figma-mcp-socket.ps1` — 미추적 파일, 커밋 불필요
- 푸시 전 `git status`로 `.env` 포함 여부 반드시 확인
- remote: `origin` → `https://github.com/beomph/h2go-supply-platform.git`
