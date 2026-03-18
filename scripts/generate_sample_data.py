from __future__ import annotations

import argparse
import csv
import json
import math
import random
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class Station:
    station_id: str
    name: str
    region: str
    address: str
    lat: float
    lng: float
    business_hours: dict
    closed_weekdays: list[int]
    dispensers: int
    storage_capacity_kg: int
    safety_stock_kg: int


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _write_json(path: Path, data: object) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _hourly_range(start: datetime, hours: int) -> Iterable[datetime]:
    for i in range(hours):
        yield start + timedelta(hours=i)


def _seasonal_temp(day_of_year: int) -> float:
    # very rough seasonal curve: -2C..28C
    return 13.0 + 15.0 * math.sin((2.0 * math.pi) * (day_of_year / 365.0) - 1.2)


def _demand_profile(hour: int) -> float:
    # commuter peaks: morning + evening, small lunch bump
    morning = math.exp(-((hour - 8) ** 2) / (2 * 2.2**2))
    lunch = 0.4 * math.exp(-((hour - 12) ** 2) / (2 * 2.5**2))
    evening = 0.8 * math.exp(-((hour - 18) ** 2) / (2 * 2.4**2))
    base = 0.15
    return base + morning + lunch + evening


def _region_multiplier(region: str) -> float:
    r = region.lower()
    if "강남" in r:
        return 1.35
    if "인천" in r:
        return 1.10
    if "수원" in r:
        return 0.90
    if "안산" in r:
        return 0.85
    return 1.0


def generate(out_dir: Path, days: int, seed: int) -> None:
    random.seed(seed)

    sample_dir = out_dir / "sample"
    _ensure_dir(sample_dir)

    stations: list[Station] = [
        Station(
            station_id="ST-SEOUL-GANGNAM-01",
            name="강남 수소충전소",
            region="서울-강남",
            address="서울특별시 강남구 테헤란로 123",
            lat=37.5012,
            lng=127.0396,
            business_hours={"open": "06:00", "close": "22:00"},
            closed_weekdays=[],
            dispensers=4,
            storage_capacity_kg=1200,
            safety_stock_kg=250,
        ),
        Station(
            station_id="ST-INCHEON-NAMDONG-01",
            name="인천 남동 수소충전소",
            region="인천-남동",
            address="인천광역시 남동구 논현고잔로 45",
            lat=37.4489,
            lng=126.7317,
            business_hours={"open": "06:00", "close": "23:00"},
            closed_weekdays=[],
            dispensers=3,
            storage_capacity_kg=1000,
            safety_stock_kg=220,
        ),
        Station(
            station_id="ST-SUWON-01",
            name="수원 수소충전소",
            region="경기-수원",
            address="경기도 수원시 영통구 광교로 88",
            lat=37.2839,
            lng=127.0446,
            business_hours={"open": "07:00", "close": "21:00"},
            closed_weekdays=[0],
            dispensers=2,
            storage_capacity_kg=900,
            safety_stock_kg=200,
        ),
        Station(
            station_id="ST-ANSAN-01",
            name="안산 수소충전소",
            region="경기-안산",
            address="경기도 안산시 단원구 중앙대로 11",
            lat=37.3219,
            lng=126.8309,
            business_hours={"open": "07:00", "close": "22:00"},
            closed_weekdays=[],
            dispensers=2,
            storage_capacity_kg=950,
            safety_stock_kg=210,
        ),
    ]

    _write_json(sample_dir / "stations.json", [asdict(s) for s in stations])

    sites = [
        {
            "site_id": "SITE-INCHEON-01",
            "name": "인천 수소생산공장",
            "address": "인천광역시 남동구 논현고잔로 123",
            "lat": 37.4489,
            "lng": 126.7317,
            "max_daily_output_kg": 25000,
            "storage_limit_kg": 12000,
        }
    ]
    _write_json(sample_dir / "sites.json", sites)

    trailers = [
        {
            "trailer_id": "TT-001",
            "capacity_kg": 180,
            "max_pressure_bar": 200,
            "current_pressure_bar": 200,
            "status": "available",
            "current_lat": 37.4489,
            "current_lng": 126.7317,
            "last_maintenance_at": "2026-02-20T00:00:00Z",
        },
        {
            "trailer_id": "TT-002",
            "capacity_kg": 180,
            "max_pressure_bar": 200,
            "current_pressure_bar": 140,
            "status": "available",
            "current_lat": 37.4489,
            "current_lng": 126.7317,
            "last_maintenance_at": "2026-02-25T00:00:00Z",
        },
        {
            "trailer_id": "TT-003",
            "capacity_kg": 180,
            "max_pressure_bar": 200,
            "current_pressure_bar": 55,
            "status": "maintenance",
            "current_lat": 37.4602,
            "current_lng": 126.4407,
            "last_maintenance_at": "2026-03-10T00:00:00Z",
        },
    ]
    _write_json(sample_dir / "trailers.json", trailers)

    drivers = [
        {"driver_id": "DRV-001", "name": "기사 1", "home_region": "인천", "max_shift_minutes": 480, "status": "available"},
        {"driver_id": "DRV-002", "name": "기사 2", "home_region": "경기", "max_shift_minutes": 480, "status": "available"},
        {"driver_id": "DRV-003", "name": "기사 3", "home_region": "서울", "max_shift_minutes": 480, "status": "off"},
    ]
    _write_json(sample_dir / "drivers.json", drivers)

    # demand_timeseries.csv
    start = datetime(2026, 3, 1, 0, 0, 0)
    hours = max(1, days * 24)
    demand_path = sample_dir / "demand_timeseries.csv"
    with demand_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["timestamp", "station_id", "demand_kg", "temperature_c", "precipitation_mm", "pm25", "is_holiday"])
        for ts in _hourly_range(start, hours):
            day = ts.timetuple().tm_yday
            base_temp = _seasonal_temp(day)
            hour_profile = _demand_profile(ts.hour)

            # simple holiday/weekend signal
            is_holiday = 1 if ts.weekday() >= 5 else 0
            holiday_mult = 0.85 if is_holiday else 1.0

            # weather noise
            temperature = base_temp + random.uniform(-3.0, 3.0)
            precipitation = 0.0 if random.random() > 0.08 else round(random.uniform(0.2, 7.0), 1)
            pm25 = int(max(8, min(80, 30 + random.gauss(0, 7))))

            for s in stations:
                mult = _region_multiplier(s.region)
                # precipitation reduces demand slightly
                rain_mult = 0.92 if precipitation > 0 else 1.0
                noise = random.uniform(0.85, 1.15)

                # scale to realistic hourly kg
                kg = 8.0 * hour_profile * mult * holiday_mult * rain_mult * noise
                w.writerow(
                    [
                        ts.strftime("%Y-%m-%d %H:%M"),
                        s.station_id,
                        round(kg, 1),
                        round(temperature, 1),
                        precipitation,
                        pm25,
                        is_holiday,
                    ]
                )

    # sensor_timeseries.csv (very small sample with one anomaly)
    sensor_path = sample_dir / "sensor_timeseries.csv"
    with sensor_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["timestamp", "asset_type", "asset_id", "pressure_bar", "temperature_c", "flow_rate_kg_per_min", "error_code"])
        base = datetime(2026, 3, 10, 8, 0, 0)
        for i in range(5):
            ts = base + timedelta(hours=i)
            w.writerow([ts.strftime("%Y-%m-%d %H:%M"), "trailer", "TT-001", 200 - i * 2, 18.0 + i * 0.2, 0.0, ""])
        for i in range(5):
            ts = base + timedelta(hours=i)
            if i >= 3:
                w.writerow([ts.strftime("%Y-%m-%d %H:%M"), "trailer", "TT-003", 20 - (i - 3) * 2, 25.0 + (i - 3) * 1.0, 0.0, "OVERHEAT"])
            else:
                w.writerow([ts.strftime("%Y-%m-%d %H:%M"), "trailer", "TT-003", 55 - i, 18.0 + i * 0.2, 0.0, ""])

    print(f"[ok] wrote sample dataset to: {sample_dir}")
    print(f"- {demand_path.name}")
    print(f"- {sensor_path.name}")


def main() -> int:
    p = argparse.ArgumentParser(description="Generate H2GO sample/simulated datasets (JSON/CSV).")
    p.add_argument("--out-dir", default="data", help="Output directory (default: data)")
    p.add_argument("--days", type=int, default=14, help="How many days of hourly demand to generate (default: 14)")
    p.add_argument("--seed", type=int, default=42, help="Random seed (default: 42)")
    args = p.parse_args()

    out_dir = Path(args.out_dir).resolve()
    generate(out_dir=out_dir, days=max(1, args.days), seed=args.seed)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

