-- =============================================================================
-- H2GO 수소 거래/공급망 플랫폼 — 관계형 스키마 (PostgreSQL 14+)
-- 근거: .taskmaster/docs/data_schema.md, data/sample/*, dashboard.js 주문 모델
-- 실행: psql -f h2go_schema.sql   또는   pgAdmin에서 스크립트 실행
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- 거래 주체 (수요자/공급자) — 현재 대시보드의 consumerName / supplierName 정규화
-- ---------------------------------------------------------------------------
CREATE TABLE business_party (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_type      VARCHAR(16) NOT NULL CHECK (party_type IN ('consumer', 'supplier')),
    name            VARCHAR(200) NOT NULL,
    legal_name      VARCHAR(300),
    business_reg_no VARCHAR(50),
    default_address TEXT,
    contact_email   VARCHAR(320),
    contact_phone   VARCHAR(50),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (party_type, name)
);

CREATE INDEX idx_business_party_type ON business_party (party_type);

-- 수요자가 거래 가능한 공급자 화이트리스트 (대시보드 등록 공급자)
CREATE TABLE consumer_supplier_link (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_id     UUID NOT NULL REFERENCES business_party (id) ON DELETE CASCADE,
    supplier_id     UUID NOT NULL REFERENCES business_party (id) ON DELETE CASCADE,
    supplier_ship_address TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (consumer_id, supplier_id)
);

-- ---------------------------------------------------------------------------
-- 충전소(수요처) / 출하센터(생산·허브)
-- ---------------------------------------------------------------------------
CREATE TABLE station (
    station_id           VARCHAR(64) PRIMARY KEY,
    name                 VARCHAR(200) NOT NULL,
    region               VARCHAR(120) NOT NULL,
    address              TEXT NOT NULL,
    lat                  DOUBLE PRECISION NOT NULL,
    lng                  DOUBLE PRECISION NOT NULL,
    business_open        TIME NOT NULL,
    business_close       TIME NOT NULL,
    closed_weekdays      SMALLINT[] DEFAULT '{}',
    dispensers           INTEGER,
    storage_capacity_kg  NUMERIC(14, 3),
    safety_stock_kg       NUMERIC(14, 3),
    linked_consumer_id   UUID REFERENCES business_party (id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE site (
    site_id             VARCHAR(64) PRIMARY KEY,
    name                VARCHAR(200) NOT NULL,
    address             TEXT NOT NULL,
    lat                 DOUBLE PRECISION NOT NULL,
    lng                 DOUBLE PRECISION NOT NULL,
    max_daily_output_kg NUMERIC(14, 3),
    storage_limit_kg    NUMERIC(14, 3),
    linked_supplier_id  UUID REFERENCES business_party (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- T/T(튜브트레일러) · 운송기사
-- ---------------------------------------------------------------------------
CREATE TABLE trailer (
    trailer_id           VARCHAR(64) PRIMARY KEY,
    capacity_kg          NUMERIC(14, 3) NOT NULL,
    max_pressure_bar     NUMERIC(10, 2) NOT NULL,
    current_pressure_bar NUMERIC(10, 2) NOT NULL,
    status               VARCHAR(20) NOT NULL
        CHECK (status IN ('available', 'in_transit', 'maintenance')),
    current_lat          DOUBLE PRECISION,
    current_lng          DOUBLE PRECISION,
    last_maintenance_at  TIMESTAMPTZ,
    owner_party_id       UUID REFERENCES business_party (id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE driver (
    driver_id           VARCHAR(64) PRIMARY KEY,
    name                VARCHAR(120) NOT NULL,
    home_region         VARCHAR(120),
    max_shift_minutes   INTEGER NOT NULL,
    status              VARCHAR(20) NOT NULL
        CHECK (status IN ('available', 'off', 'on_trip')),
    employer_party_id   UUID REFERENCES business_party (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 이동 시간/거리 매트릭스 (배차·ETA)
-- ---------------------------------------------------------------------------
CREATE TABLE travel_matrix_version (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_label VARCHAR(64) NOT NULL,
    generated_at  TIMESTAMPTZ NOT NULL,
    UNIQUE (version_label)
);

CREATE TABLE travel_node (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matrix_id   UUID NOT NULL REFERENCES travel_matrix_version (id) ON DELETE CASCADE,
    node_ref_id VARCHAR(64) NOT NULL,
    node_kind   VARCHAR(16) NOT NULL CHECK (node_kind IN ('station', 'site')),
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    UNIQUE (matrix_id, node_ref_id)
);

CREATE TABLE travel_edge (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matrix_id     UUID NOT NULL REFERENCES travel_matrix_version (id) ON DELETE CASCADE,
    from_node_id  VARCHAR(64) NOT NULL,
    to_node_id    VARCHAR(64) NOT NULL,
    distance_km   NUMERIC(12, 3) NOT NULL,
    eta_minutes   INTEGER NOT NULL,
    UNIQUE (matrix_id, from_node_id, to_node_id)
);

CREATE INDEX idx_travel_edge_from ON travel_edge (matrix_id, from_node_id);

-- ---------------------------------------------------------------------------
-- 주문 (대시보드 order 객체 / ORDER 예약어 회피)
-- ---------------------------------------------------------------------------
CREATE TABLE purchase_order (
    order_id         VARCHAR(80) PRIMARY KEY,
    consumer_id      UUID NOT NULL REFERENCES business_party (id),
    supplier_id      UUID NOT NULL REFERENCES business_party (id),
    supply_condition VARCHAR(20) NOT NULL
        CHECK (supply_condition IN ('delivery', 'ex_factory')),
    delivery_address TEXT NOT NULL,
    delivery_date    DATE NOT NULL,
    delivery_time    TIME NOT NULL,
    tube_trailers    INTEGER NOT NULL DEFAULT 1 CHECK (tube_trailers > 0),
    note             TEXT,
    status           VARCHAR(32) NOT NULL DEFAULT 'requested'
        CHECK (status IN (
            'requested', 'accepted', 'change_requested', 'change_accepted',
            'in_transit', 'arrived', 'collecting', 'completed',
            'cancel_requested', 'cancelled',
            'pending', 'received', 'reviewing', 'confirmed', 'on_hold',
            'change_requested_consumer', 'change_requested_supplier',
            'cancel_requested_consumer', 'cancel_requested_supplier'
        )),
    transport_info   JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT po_delivery_at_sanity CHECK (delivery_date IS NOT NULL)
);

CREATE INDEX idx_po_consumer_created ON purchase_order (consumer_id, created_at DESC);
CREATE INDEX idx_po_supplier_created ON purchase_order (supplier_id, created_at DESC);
CREATE INDEX idx_po_status ON purchase_order (status);
CREATE INDEX idx_po_delivery_date ON purchase_order (delivery_date);

-- 납품 희망 시각 단일 컬럼 (조회·정렬·AI 피처용, 애플리케이션에서 유지)
-- GENERATED STORED 는 PG 버전에 따라 문법 확인 — 여기서는 뷰로 제공
CREATE OR REPLACE VIEW v_purchase_order_delivery_timestamptz AS
SELECT
    o.*,
    (o.delivery_date + o.delivery_time) AT TIME ZONE 'Asia/Seoul' AS delivery_at_kst
FROM purchase_order o;

-- 변경 요청
CREATE TABLE order_change_request (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id         VARCHAR(80) NOT NULL REFERENCES purchase_order (order_id) ON DELETE CASCADE,
    requested_by     VARCHAR(16) NOT NULL CHECK (requested_by IN ('consumer', 'supplier')),
    status           VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected')),
    proposed_json    JSONB NOT NULL,
    original_status  VARCHAR(32),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at      TIMESTAMPTZ
);

CREATE INDEX idx_ocr_order ON order_change_request (order_id);

-- 취소 요청
CREATE TABLE order_cancel_request (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id         VARCHAR(80) NOT NULL REFERENCES purchase_order (order_id) ON DELETE CASCADE,
    requested_by     VARCHAR(16) NOT NULL CHECK (requested_by IN ('consumer', 'supplier')),
    status           VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected')),
    reason           TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at      TIMESTAMPTZ
);

CREATE INDEX idx_ocancel_order ON order_cancel_request (order_id);

-- 운송 시작 시 T/T 번호 문자열 — 정규화(선택)
CREATE TABLE order_assigned_trailer (
    order_id     VARCHAR(80) NOT NULL REFERENCES purchase_order (order_id) ON DELETE CASCADE,
    trailer_code VARCHAR(64) NOT NULL,
    sort_order   SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (order_id, trailer_code)
);

-- 감사/이력
CREATE TABLE order_status_history (
    id          BIGSERIAL PRIMARY KEY,
    order_id    VARCHAR(80) NOT NULL REFERENCES purchase_order (order_id) ON DELETE CASCADE,
    old_status  VARCHAR(32),
    new_status  VARCHAR(32) NOT NULL,
    actor_type  VARCHAR(16),
    actor_id    UUID,
    note        TEXT,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_osh_order ON order_status_history (order_id, changed_at DESC);

-- ---------------------------------------------------------------------------
-- 수요 시계열 (수요 예측 학습/서빙)
-- ---------------------------------------------------------------------------
CREATE TABLE demand_timeseries (
    id               BIGSERIAL PRIMARY KEY,
    bucket_start     TIMESTAMPTZ NOT NULL,
    station_id       VARCHAR(64) NOT NULL REFERENCES station (station_id),
    demand_kg        NUMERIC(14, 3) NOT NULL,
    temperature_c    NUMERIC(6, 2),
    precipitation_mm NUMERIC(8, 2),
    pm25             NUMERIC(8, 2),
    is_holiday       BOOLEAN DEFAULT FALSE,
    UNIQUE (bucket_start, station_id)
);

CREATE INDEX idx_demand_station_time ON demand_timeseries (station_id, bucket_start DESC);

-- ---------------------------------------------------------------------------
-- 센서/운영 시계열 (이상 탐지)
-- ---------------------------------------------------------------------------
CREATE TABLE sensor_reading (
    id              BIGSERIAL PRIMARY KEY,
    observed_at     TIMESTAMPTZ NOT NULL,
    asset_type      VARCHAR(16) NOT NULL
        CHECK (asset_type IN ('trailer', 'station', 'site')),
    asset_id        VARCHAR(64) NOT NULL,
    pressure_bar    NUMERIC(10, 2),
    temperature_c   NUMERIC(6, 2),
    flow_kg_per_min NUMERIC(14, 4),
    error_code      VARCHAR(64)
);

CREATE INDEX idx_sensor_asset_time ON sensor_reading (asset_type, asset_id, observed_at DESC);

-- ---------------------------------------------------------------------------
-- AI 출력 보관 (MVP: 예측·이상 단순 테이블, 이후 파티셔닝 권장)
-- ---------------------------------------------------------------------------
CREATE TABLE demand_forecast (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name    VARCHAR(120) NOT NULL,
    model_version VARCHAR(64) NOT NULL,
    station_id    VARCHAR(64) NOT NULL REFERENCES station (station_id),
    horizon_start TIMESTAMPTZ NOT NULL,
    horizon_end   TIMESTAMPTZ NOT NULL,
    predicted_kg  NUMERIC(14, 3) NOT NULL,
    p10_kg        NUMERIC(14, 3),
    p90_kg        NUMERIC(14, 3),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_forecast_station_horizon ON demand_forecast (station_id, horizon_start);

CREATE TABLE anomaly_event (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    detected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    asset_type   VARCHAR(16) NOT NULL,
    asset_id     VARCHAR(64) NOT NULL,
    severity     VARCHAR(16) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    anomaly_type VARCHAR(64) NOT NULL,
    score        NUMERIC(10, 6),
    detail_json  JSONB,
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_anomaly_time ON anomaly_event (detected_at DESC);

-- ---------------------------------------------------------------------------
-- 배차 계획 스냅샷 (VRP/휴리스틱 결과 저장용 확장 포인트)
-- ---------------------------------------------------------------------------
CREATE TABLE dispatch_plan (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_date    DATE NOT NULL,
    label        VARCHAR(120),
    payload_json JSONB NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dispatch_plan_date ON dispatch_plan (plan_date DESC);

-- ---------------------------------------------------------------------------
-- updated_at 자동 갱신 트리거 (선택)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_business_party_updated
    BEFORE UPDATE ON business_party FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER tr_station_updated
    BEFORE UPDATE ON station FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER tr_site_updated
    BEFORE UPDATE ON site FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER tr_trailer_updated
    BEFORE UPDATE ON trailer FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER tr_driver_updated
    BEFORE UPDATE ON driver FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER tr_purchase_order_updated
    BEFORE UPDATE ON purchase_order FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

COMMENT ON TABLE business_party IS '수요자/공급자 거래 주체';
COMMENT ON TABLE purchase_order IS '수소 납품 주문 (dashboard.js h2go_orders 대응)';
COMMENT ON TABLE demand_timeseries IS '충전소별 수요 시계열 — PRD 수요 예측 입력';
COMMENT ON TABLE sensor_reading IS 'T/T·충전소·출하센터 센서 시계열 — 이상 탐지 입력';
