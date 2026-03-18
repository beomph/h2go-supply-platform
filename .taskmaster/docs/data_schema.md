## H2GO AI 데이터 스키마 (MVP / 샘플 데이터 기준)

이 문서는 `data/sample/*`에 포함된 샘플/시뮬레이션 데이터의 **표준 스키마**를 정의합니다.  
초기 단계에서는 DB 대신 JSON/CSV 파일로 시작하고, 이후 PostgreSQL/SQLite로 마이그레이션합니다.

### 공통 규칙

- **시간**: 기본은 ISO 8601 (`YYYY-MM-DDTHH:mm:ssZ`) 또는 로컬 시간(`YYYY-MM-DD HH:mm`)을 사용합니다.
- **단위**
  - 수소량: `kg`
  - 압력: `bar`
  - 거리: `km`
  - 시간(이동/소요): `minutes`
- **식별자**
  - `station_id`, `site_id`, `trailer_id`, `driver_id`는 문자열이며 시스템 내부에서 유일해야 합니다.
  - 주문번호(`order_id`)는 현재 프론트 규칙(예: `YYMMDD-SEQ-CCC-SSS`)을 따르되, 백엔드 도입 시 UUID 병행을 허용합니다.

---

## 1) 충전소(수요처) — `stations.json`

**목적**: 수요 예측(고정 특성)과 배차(위치/운영시간/서비스 레벨)의 기준 엔티티

### 필드

- `station_id` (string, required): 충전소 ID (예: `ST-SEOUL-GANGNAM-01`)
- `name` (string, required): 표시명
- `region` (string, required): 권역/지역 (예: `서울-강남`)
- `address` (string, required)
- `lat` (number, required)
- `lng` (number, required)
- `business_hours` (object, required)
  - `open` (string, required): `HH:mm`
  - `close` (string, required): `HH:mm`
- `closed_weekdays` (number[], optional): 0(일)~6(토). 없으면 연중무휴로 간주.
- `dispensers` (number, optional): 충전기 수
- `storage_capacity_kg` (number, optional): 저장 탱크 용량(kg)
- `safety_stock_kg` (number, optional): 안전재고(kg)

---

## 2) 출하센터/생산지 — `sites.json`

**목적**: 배차 최적화에서 허브(출발/충전) 지점

### 필드

- `site_id` (string, required): 예: `SITE-INCHEON-01`
- `name` (string, required)
- `address` (string, required)
- `lat` (number, required)
- `lng` (number, required)
- `max_daily_output_kg` (number, optional): 일 최대 출하량
- `storage_limit_kg` (number, optional): 저장 한도

---

## 3) 수요(판매) 시계열 — `demand_timeseries.csv`

**목적**: 수요 예측 모델 학습/평가용 시계열

### 컬럼

- `timestamp` (string, required): `YYYY-MM-DD HH:mm` (로컬) 또는 ISO 8601
- `station_id` (string, required)
- `demand_kg` (number, required): 해당 시점(또는 구간) 수요(kg)
- `temperature_c` (number, optional)
- `precipitation_mm` (number, optional)
- `pm25` (number, optional)
- `is_holiday` (0/1, optional)

> 집계 단위는 MVP에서 `1 hour`를 기본으로 합니다.

---

## 4) T/T(튜브트레일러) 자원 — `trailers.json`

**목적**: 배차 및 이상 탐지(압력/상태) 입력

### 필드

- `trailer_id` (string, required): 예: `TT-001`
- `capacity_kg` (number, required)
- `max_pressure_bar` (number, required)
- `current_pressure_bar` (number, required)
- `status` (string, required): `available | in_transit | maintenance`
- `current_lat` (number, optional)
- `current_lng` (number, optional)
- `last_maintenance_at` (string, optional): ISO 8601

---

## 5) 운송기사 — `drivers.json`

**목적**: 배차 최적화 제약(근무시간/휴게)

### 필드

- `driver_id` (string, required): 예: `DRV-001`
- `name` (string, required)
- `home_region` (string, optional)
- `max_shift_minutes` (number, required): 예: 480 (8시간)
- `status` (string, required): `available | off | on_trip`

---

## 6) 이동 시간/거리 매트릭스 — `travel_matrix.json`

**목적**: 배차 최적화에서 ETA/비용 계산

### 필드

- `version` (string, required)
- `generated_at` (string, required): ISO 8601
- `nodes` (array, required): `{ "id": "<station_id|site_id>", "type": "station|site", "lat": number, "lng": number }`
- `edges` (array, required): `{ "from": "ID", "to": "ID", "distance_km": number, "eta_minutes": number }`

> MVP에서는 단순 계산(직선거리 기반) 또는 키워드 맵(지역별 고정 시간)을 허용합니다.

---

## 7) 센서/운영 시계열(이상 탐지) — `sensor_timeseries.csv`

**목적**: 이상 탐지 모델 학습/평가 (압력/온도/유량)

### 컬럼

- `timestamp` (string, required)
- `asset_type` (string, required): `trailer | station | site`
- `asset_id` (string, required)
- `pressure_bar` (number, optional)
- `temperature_c` (number, optional)
- `flow_rate_kg_per_min` (number, optional)
- `error_code` (string, optional)

