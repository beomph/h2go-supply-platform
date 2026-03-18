from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _safe_json_loads(raw: str) -> Any:
    # LLM이 ```json ... ```로 감싸는 경우를 대비
    s = raw.strip()
    if s.startswith("```"):
        s = s.split("```", 2)[1] if s.count("```") >= 2 else s
        s = s.replace("json", "", 1).strip()
    return json.loads(s)


def _validate_tasks_json(doc: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(doc, dict):
        raise ValueError("tasks.json root must be an object")

    # Accept either:
    # 1) {"tasks":[...]}  (Task Master docs)
    # 2) {"<tag>": {"tasks":[...], "metadata": {...}}} (what MCP currently emits)
    if "tasks" in doc:
        tasks = doc.get("tasks")
        if not isinstance(tasks, list) or not tasks:
            raise ValueError("tasks must be a non-empty array")
        return {"master": {"tasks": tasks, "metadata": {"version": "1.0.0", "lastModified": _utc_now_iso(), "taskCount": len(tasks), "tags": ["master"]}}}

    # tag-shaped
    if "master" in doc and isinstance(doc["master"], dict) and isinstance(doc["master"].get("tasks"), list):
        if not doc["master"]["tasks"]:
            raise ValueError("master.tasks must be a non-empty array")
        # normalize metadata
        meta = doc["master"].get("metadata") if isinstance(doc["master"].get("metadata"), dict) else {}
        meta = {
            "version": str(meta.get("version") or "1.0.0"),
            "lastModified": _utc_now_iso(),
            "taskCount": int(meta.get("taskCount") or len(doc["master"]["tasks"])),
            "completedCount": int(meta.get("completedCount") or 0),
            "tags": meta.get("tags") if isinstance(meta.get("tags"), list) else ["master"],
        }
        doc["master"]["metadata"] = meta
        return doc

    raise ValueError("Unsupported tasks.json structure")


def parse_prd_with_openai(prd_text: str, num_tasks: int, model: str) -> dict[str, Any]:
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")

    from openai import OpenAI

    client = OpenAI(api_key=api_key)

    schema_hint = {
        "master": {
            "tasks": [
                {
                    "id": "1",
                    "title": "짧은 제목",
                    "description": "한 문단 요약",
                    "status": "pending",
                    "dependencies": [],
                    "priority": "high",
                    "details": "구현 지침(구체적으로)",
                    "testStrategy": "검증 방법",
                    "subtasks": [],
                }
            ],
            "metadata": {
                "version": "1.0.0",
                "lastModified": _utc_now_iso(),
                "taskCount": 1,
                "completedCount": 0,
                "tags": ["master"],
            },
        }
    }

    instructions = (
        "You are a senior technical product manager. "
        "Convert the PRD into an actionable Task Master tasks.json. "
        "Return ONLY valid JSON (no markdown, no backticks). "
        "Use Korean for titles/descriptions/details/testStrategy. "
        "Task IDs must be strings of integers starting at 1. "
        "status must be one of: pending, in-progress, done, deferred, cancelled, blocked, review. "
        "priority must be: high, medium, low. "
        "Dependencies must reference existing IDs. "
        f"Generate exactly {num_tasks} top-level tasks. "
        "Prefer concrete deliverables and verify strategies."
    )

    prompt = (
        "PRD:\n"
        "-----\n"
        f"{prd_text}\n\n"
        "Desired tasks.json shape example (do not include comments, just follow structure):\n"
        f"{json.dumps(schema_hint, ensure_ascii=False)}\n"
    )

    r = client.responses.create(
        model=model,
        instructions=instructions,
        input=prompt,
        temperature=0.2,
    )
    raw = (getattr(r, "output_text", None) or "").strip()
    if not raw:
        raise RuntimeError("Empty response from OpenAI")

    parsed = _safe_json_loads(raw)
    if not isinstance(parsed, dict):
        raise RuntimeError("OpenAI output is not a JSON object")

    return _validate_tasks_json(parsed)


def _preserve_status_from_existing(new_doc: dict[str, Any], existing_path: Path) -> dict[str, Any]:
    """기존 tasks.json의 status, updatedAt을 새 결과에 병합하여 작업 히스토리가 초기화되지 않게 함."""
    if not existing_path.exists():
        return new_doc

    try:
        existing = json.loads(existing_path.read_text(encoding="utf-8"))
    except Exception:
        return new_doc

    old_tasks = []
    if isinstance(existing, dict):
        if "master" in existing and isinstance(existing["master"], dict):
            old_tasks = existing["master"].get("tasks") or []
        elif "tasks" in existing:
            old_tasks = existing.get("tasks") or []

    if not isinstance(old_tasks, list) or not old_tasks:
        return new_doc

    old_by_id: dict[str, dict[str, Any]] = {}
    for t in old_tasks:
        if isinstance(t, dict) and t.get("id"):
            old_by_id[str(t["id"])] = t

    new_tasks = new_doc.get("master", {}).get("tasks") or new_doc.get("tasks") or []
    preserved = 0
    for t in new_tasks:
        if not isinstance(t, dict) or not t.get("id"):
            continue
        tid = str(t["id"])
        old = old_by_id.get(tid)
        if not old:
            continue
        # 같은 id의 기존 태스크에서 status, updatedAt 유지
        if old.get("status") in ("done", "in-progress", "deferred", "blocked", "review", "cancelled"):
            t["status"] = old["status"]
            preserved += 1
        if old.get("updatedAt"):
            t["updatedAt"] = old["updatedAt"]

    # metadata.completedCount 갱신
    if "master" in new_doc and isinstance(new_doc["master"], dict):
        tasks = new_doc["master"].get("tasks") or []
        done_count = sum(1 for x in tasks if isinstance(x, dict) and x.get("status") == "done")
        meta = new_doc["master"].get("metadata") or {}
        meta["completedCount"] = done_count
        new_doc["master"]["metadata"] = meta

    if preserved > 0:
        print(f"[preserve] {preserved} task(s) status kept from existing file")
    return new_doc


def main() -> int:
    p = argparse.ArgumentParser(description="Parse PRD into Task Master tasks.json using OpenAI.")
    p.add_argument("--prd", default=".taskmaster/docs/prd.txt", help="PRD path (default: .taskmaster/docs/prd.txt)")
    p.add_argument("--out", default=".taskmaster/tasks/tasks.json", help="Output tasks.json path")
    p.add_argument("--num-tasks", type=int, default=12, help="Number of top-level tasks to generate (default: 12)")
    p.add_argument("--model", default="gpt-4.1-mini", help="OpenAI model (default: gpt-4.1-mini)")
    p.add_argument("--backup", action="store_true", help="Create a timestamped backup of existing out file")
    p.add_argument("--no-preserve-status", action="store_true", help="Do NOT preserve done/in-progress status from existing tasks (fresh start)")
    args = p.parse_args()

    prd_path = Path(args.prd).resolve()
    out_path = Path(args.out).resolve()

    prd_text = _read_text(prd_path)

    if args.backup and out_path.exists():
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = out_path.with_suffix(out_path.suffix + f".bak_{ts}")
        _write_text(backup_path, _read_text(out_path))

    doc = parse_prd_with_openai(prd_text=prd_text, num_tasks=max(2, args.num_tasks), model=args.model)

    if not args.no_preserve_status and out_path.exists():
        doc = _preserve_status_from_existing(doc, out_path)

    _write_text(out_path, json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
    print(f"[ok] wrote: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

