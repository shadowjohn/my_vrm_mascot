import argparse
import json
import sqlite3
import tempfile
import time
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

from pose_json_to_vrma import convert_pose_json_to_vrma
from vrma_pose_converter import convert_vrma_to_pose_json


SOURCE_KINDS = {"youtube", "local_mp4", "image", "vrma", "pose_json"}
ITEM_FIELDS = {
    "kinds_id",
    "title",
    "source_kind",
    "source_url",
    "purpose",
    "status",
    "progress",
    "progress_log",
    "process_start_datetime",
    "process_end_datetime",
    "process_ms",
    "frames",
    "duration_ms",
    "fps",
    "source_start_ms",
    "source_end_ms",
    "pose_json",
    "pose_json_path",
    "skeleton_json_path",
    "hand_pose_json_path",
    "thumb_path",
    "preview_path",
    "status_vrma",
    "vrma_path",
    "vrma_start_datetime",
    "vrma_end_datetime",
    "vrma_process_ms",
    "error_message",
    "metadata_json",
    "del",
}


def _now():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _row_dict(row):
    return dict(row) if row else None


@contextmanager
def _connect(db_path):
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db(db_path):
    with _connect(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS kinds (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              character TEXT NOT NULL DEFAULT 'alicia',
              del INTEGER NOT NULL DEFAULT 0,
              create_datetime TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS data (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              kinds_id INTEGER,
              title TEXT NOT NULL,
              source_kind TEXT NOT NULL,
              source_url TEXT NOT NULL DEFAULT '',
              purpose TEXT NOT NULL DEFAULT '',

              status INTEGER NOT NULL DEFAULT 0,
              progress REAL NOT NULL DEFAULT 0,
              progress_log TEXT NOT NULL DEFAULT '',

              create_datetime TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              process_start_datetime TEXT,
              process_end_datetime TEXT,
              process_ms INTEGER,

              frames INTEGER NOT NULL DEFAULT 0,
              duration_ms INTEGER,
              fps REAL,
              source_start_ms INTEGER,
              source_end_ms INTEGER,

              pose_json TEXT,
              pose_json_path TEXT,
              skeleton_json_path TEXT,
              hand_pose_json_path TEXT,
              thumb_path TEXT,
              preview_path TEXT,

              status_vrma INTEGER NOT NULL DEFAULT 0,
              vrma_path TEXT,
              vrma_start_datetime TEXT,
              vrma_end_datetime TEXT,
              vrma_process_ms INTEGER,

              error_message TEXT,
              metadata_json TEXT,
              del INTEGER NOT NULL DEFAULT 0,

              FOREIGN KEY(kinds_id) REFERENCES kinds(id)
            );

            CREATE INDEX IF NOT EXISTS idx_data_kind ON data(kinds_id, del);
            CREATE INDEX IF NOT EXISTS idx_data_status ON data(status, del);
            CREATE INDEX IF NOT EXISTS idx_data_source ON data(source_kind, del);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_data_source_unique
              ON data(source_kind, source_url)
              WHERE del = 0;
            """
        )


def list_kinds(db_path):
    init_db(db_path)
    with _connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT kinds.*,
                   COUNT(data.id) AS item_count
            FROM kinds
            LEFT JOIN data ON data.kinds_id = kinds.id AND data.del = 0
            WHERE kinds.del = 0
            GROUP BY kinds.id
            ORDER BY kinds.character, kinds.name, kinds.id
            """
        ).fetchall()
        return [dict(row) for row in rows]


def create_kind(db_path, name, character="alicia"):
    name = str(name or "").strip()
    character = str(character or "alicia").strip() or "alicia"
    if not name:
        raise ValueError("name is required")
    init_db(db_path)
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM kinds WHERE del = 0 AND name = ? AND character = ?",
            (name, character),
        ).fetchone()
        if row:
            return dict(row)
        cursor = conn.execute(
            "INSERT INTO kinds (name, character) VALUES (?, ?)",
            (name, character),
        )
        kind_id = cursor.lastrowid
    return get_kind(db_path, kind_id)


def get_kind(db_path, kind_id):
    with _connect(db_path) as conn:
        return _row_dict(
            conn.execute(
                "SELECT * FROM kinds WHERE id = ? AND del = 0",
                (int(kind_id),),
            ).fetchone()
        )


def update_kind(db_path, kind_id, fields):
    allowed = {"name", "character", "del"}
    values = {key: fields[key] for key in allowed if key in fields}
    if not values:
        return get_kind(db_path, kind_id)
    assignments = ", ".join(f"{key} = ?" for key in values)
    params = list(values.values()) + [int(kind_id)]
    with _connect(db_path) as conn:
        conn.execute(f"UPDATE kinds SET {assignments} WHERE id = ?", params)
    return get_kind(db_path, kind_id)


def delete_kind(db_path, kind_id):
    init_db(db_path)
    with _connect(db_path) as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM data WHERE del = 0 AND kinds_id = ?",
            (int(kind_id),),
        ).fetchone()[0]
        if count:
            raise ValueError("kind still has items")
        conn.execute("UPDATE kinds SET del = 1 WHERE id = ?", (int(kind_id),))
    return get_kind(db_path, kind_id)


def _normalize_item_fields(fields, partial=False):
    item = {key: fields[key] for key in ITEM_FIELDS if key in fields}
    if not partial:
        item["title"] = str(item.get("title") or "").strip()
        item["source_kind"] = str(item.get("source_kind") or "").strip()
        item["source_url"] = str(item.get("source_url") or "").strip()
        if not item["title"]:
            raise ValueError("title is required")
        if item["source_kind"] not in SOURCE_KINDS:
            raise ValueError("unsupported source_kind")
    return item


def create_item(db_path, fields):
    item = _normalize_item_fields(fields)
    init_db(db_path)
    with _connect(db_path) as conn:
        existing = conn.execute(
            "SELECT * FROM data WHERE del = 0 AND source_kind = ? AND source_url = ?",
            (item["source_kind"], item["source_url"]),
        ).fetchone()
        if existing:
            return dict(existing)
        keys = list(item.keys())
        placeholders = ", ".join("?" for _ in keys)
        cursor = conn.execute(
            f"INSERT INTO data ({', '.join(keys)}) VALUES ({placeholders})",
            [item[key] for key in keys],
        )
        item_id = cursor.lastrowid
    return get_item(db_path, item_id)


def get_item(db_path, item_id):
    init_db(db_path)
    with _connect(db_path) as conn:
        return _row_dict(
            conn.execute(
                """
                SELECT data.*, kinds.name AS kind_name, kinds.character AS kind_character
                FROM data
                LEFT JOIN kinds ON kinds.id = data.kinds_id
                WHERE data.id = ? AND data.del = 0
                """,
                (int(item_id),),
            ).fetchone()
        )


def list_items(db_path, filters=None):
    init_db(db_path)
    filters = filters or {}
    where = ["data.del = 0"]
    params = []
    if filters.get("kinds_id"):
        where.append("data.kinds_id = ?")
        params.append(int(filters["kinds_id"]))
    if filters.get("status") not in (None, ""):
        where.append("data.status = ?")
        params.append(int(filters["status"]))
    if filters.get("source_kind"):
        where.append("data.source_kind = ?")
        params.append(str(filters["source_kind"]))
    if filters.get("q"):
        where.append("(data.title LIKE ? OR data.source_url LIKE ? OR data.purpose LIKE ?)")
        like = f"%{filters['q']}%"
        params.extend([like, like, like])

    with _connect(db_path) as conn:
        rows = conn.execute(
            f"""
            SELECT data.*, kinds.name AS kind_name, kinds.character AS kind_character
            FROM data
            LEFT JOIN kinds ON kinds.id = data.kinds_id
            WHERE {' AND '.join(where)}
            ORDER BY data.id DESC
            LIMIT 500
            """,
            params,
        ).fetchall()
        return [dict(row) for row in rows]


def update_item(db_path, item_id, fields):
    item = _normalize_item_fields(fields, partial=True)
    if not item:
        return get_item(db_path, item_id)
    assignments = ", ".join(f"{key} = ?" for key in item)
    params = list(item.values()) + [int(item_id)]
    with _connect(db_path) as conn:
        conn.execute(f"UPDATE data SET {assignments} WHERE id = ?", params)
    return get_item(db_path, item_id)


def soft_delete_item(db_path, item_id):
    return update_item(db_path, item_id, {"del": 1})


def queue_item(db_path, item_id):
    return update_item(
        db_path,
        item_id,
        {
            "status": 0,
            "progress": 0,
            "progress_log": "",
            "error_message": "",
            "process_start_datetime": None,
            "process_end_datetime": None,
            "process_ms": None,
        },
    )


def queue_vrma(db_path, item_id):
    return update_item(db_path, item_id, {"status_vrma": 1})


def claim_next_job(db_path):
    init_db(db_path)
    with _connect(db_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT * FROM data WHERE del = 0 AND status = 0 ORDER BY id LIMIT 1"
        ).fetchone()
        if not row:
            conn.commit()
            return None
        started_at = _now()
        conn.execute(
            """
            UPDATE data
            SET status = 1, progress = 1, process_start_datetime = ?, error_message = ''
            WHERE id = ?
            """,
            (started_at, row["id"]),
        )
        conn.commit()
        return get_item(db_path, row["id"])


def append_progress(db_path, item_id, message, progress=None):
    item = get_item(db_path, item_id)
    if not item:
        return None
    line = f"[{_now()}] {message}"
    log = "\n".join(part for part in [item.get("progress_log") or "", line] if part)
    fields = {"progress_log": log}
    if progress is not None:
        fields["progress"] = float(progress)
    return update_item(db_path, item_id, fields)


def finish_job(db_path, item_id, ok=True, error_message="", **fields):
    item = get_item(db_path, item_id)
    ended_at = _now()
    process_ms = None
    if item and item.get("process_start_datetime"):
        process_ms = int((time.time() - time.mktime(datetime.fromisoformat(item["process_start_datetime"]).timetuple())) * 1000)
    payload = {
        "status": 2 if ok else 3,
        "progress": 100 if ok else fields.pop("progress", 0),
        "process_end_datetime": ended_at,
        "process_ms": process_ms,
        "error_message": error_message,
    }
    payload.update(fields)
    return update_item(db_path, item_id, payload)


def _rel_path(base_dir, path):
    base = Path(base_dir).resolve()
    target = Path(path).resolve()
    try:
        return target.relative_to(base).as_posix()
    except ValueError:
        return target.as_posix()


def _safe_file_stem(value):
    stem = Path(str(value or "vrma")).stem
    safe = "".join(char if char.isalnum() or char in "-_" else "_" for char in stem)
    return (safe[:80] or "vrma").strip("._") or "vrma"


def _resolve_local_asset(base_dir, path_value):
    if not path_value:
        raise ValueError("source file path is required")
    base = Path(base_dir).resolve()
    path = Path(str(path_value))
    if not path.is_absolute():
        path = base / path
    resolved = path.resolve()
    try:
        resolved.relative_to(base)
    except ValueError as exc:
        raise ValueError("source file must be inside workspace") from exc
    if not resolved.is_file():
        raise ValueError(f"source file not found: {path_value}")
    return resolved


def _safe_json_metadata(path):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return {}, 0
    frames = data.get("frameCount")
    if not isinstance(frames, int):
        frames_data = data.get("frames")
        frames = len(frames_data) if isinstance(frames_data, list) else 0
    return data, frames


def convert_vrma_item_to_pose_json(db_path, base_dir, item_id):
    item = get_item(db_path, item_id)
    if not item:
        return None
    if item.get("source_kind") != "vrma":
        raise ValueError("item is not a VRMA row")

    update_item(
        db_path,
        item_id,
        {
            "status": 1,
            "progress": 1,
            "progress_log": "",
            "process_start_datetime": _now(),
            "process_end_datetime": None,
            "process_ms": None,
            "error_message": "",
        },
    )
    try:
        vrma_path = _resolve_local_asset(base_dir, item.get("vrma_path") or item.get("source_url"))
        append_progress(db_path, item_id, "VRMA -> pose_json started", 15)
        output_dir = Path(base_dir) / "local_assets" / "pose_db" / "vrma_converted"
        output_path = output_dir / f"{int(item_id)}_{_safe_file_stem(vrma_path)}_pose.json"
        pose = convert_vrma_to_pose_json(vrma_path, output_path)
        rel_output = _rel_path(base_dir, output_path)
        append_progress(db_path, item_id, f"pose_json written: {rel_output}", 95)
        return finish_job(
            db_path,
            item_id,
            ok=True,
            frames=int(pose.get("frame_count") or 0),
            duration_ms=int(pose.get("duration_ms") or 0),
            fps=float(pose.get("fps") or 0),
            pose_json_path=rel_output,
            pose_json="",
            metadata_json=json.dumps(
                {
                    "source": pose.get("source"),
                    "retarget_mode": pose.get("retarget_mode"),
                    "source_vrma": pose.get("metadata", {}).get("source_vrma"),
                },
                ensure_ascii=False,
            ),
        )
    except Exception as exc:
        finish_job(db_path, item_id, ok=False, error_message=str(exc))
        raise


def convert_pose_json_item_to_vrma(db_path, base_dir, item_id):
    item = get_item(db_path, item_id)
    if not item:
        return None
    pose_path_value = item.get("pose_json_path") or (item.get("source_url") if item.get("source_kind") == "pose_json" else "")
    if not pose_path_value:
        raise ValueError("item has no pose_json_path")

    started_at = _now()
    update_item(
        db_path,
        item_id,
        {
            "status_vrma": 2,
            "vrma_start_datetime": started_at,
            "vrma_end_datetime": None,
            "vrma_process_ms": None,
            "error_message": "",
        },
    )
    try:
        pose_path = _resolve_local_asset(base_dir, pose_path_value)
        output_dir = Path(base_dir) / "local_assets" / "pose_db" / "vrma_exported"
        output_path = output_dir / f"{int(item_id)}_{_safe_file_stem(pose_path)}.vrma"
        result = convert_pose_json_to_vrma(pose_path, output_path)
        ended_at = _now()
        process_ms = int((time.time() - time.mktime(datetime.fromisoformat(started_at).timetuple())) * 1000)
        return update_item(
            db_path,
            item_id,
            {
                "status_vrma": 3,
                "vrma_path": _rel_path(base_dir, output_path),
                "vrma_end_datetime": ended_at,
                "vrma_process_ms": process_ms,
                "metadata_json": json.dumps(
                    {
                        "pose_json_to_vrma": result,
                        "source_pose_json": _rel_path(base_dir, pose_path),
                    },
                    ensure_ascii=False,
                ),
            },
        )
    except Exception as exc:
        update_item(db_path, item_id, {"status_vrma": 0, "error_message": str(exc)})
        raise


def import_gvhmr_demo_outputs(db_path, base_dir, gvhmr_demo_root):
    kind = create_kind(db_path, "GVHMR Demo", "alicia")
    imported = 0
    root = Path(gvhmr_demo_root)
    if not root.is_dir():
        return {"imported": 0, "root": str(root)}
    for motion_path in sorted(root.glob("*/alicia_blender_bake_motion.json")):
        metadata, frames = _safe_json_metadata(motion_path)
        rel = _rel_path(base_dir, motion_path)
        skeleton_path = motion_path.parent / "alicia_intermediate_landmarks.json"
        video_path = motion_path.parent / "0_input_video.mp4"
        hand_path = motion_path.parent / "mediapipe_hand_poses.json"
        item_fields = {
            "kinds_id": kind["id"],
            "title": motion_path.parent.name,
            "source_kind": "pose_json",
            "source_url": rel,
            "purpose": "GVHMR baked motion",
            "status": 2,
            "progress": 100,
            "frames": frames,
            "pose_json_path": rel,
            "skeleton_json_path": _rel_path(base_dir, skeleton_path) if skeleton_path.is_file() else "",
            "hand_pose_json_path": _rel_path(base_dir, hand_path) if hand_path.is_file() else "",
            "preview_path": _rel_path(base_dir, video_path) if video_path.is_file() else "",
            "metadata_json": json.dumps(
                {
                    "source": metadata.get("source"),
                    "retargetMode": metadata.get("retargetMode"),
                    "video": metadata.get("video"),
                },
                ensure_ascii=False,
            ),
        }
        item = create_item(db_path, item_fields)
        if item:
            update_item(
                db_path,
                item["id"],
                {
                    key: value
                    for key, value in item_fields.items()
                    if key not in {"source_kind", "source_url"}
                },
            )
        imported += 1 if item else 0
    return {"imported": imported, "root": str(root)}


def _load_vrma_motion_profiles(base_dir):
    path = Path(base_dir) / "examples" / "m6_7_vrma_samples" / "review" / "motion_profiles.json"
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("profiles", {})


def _vrma_profile_fields(profile):
    usage = str(profile.get("usageDescription") or "").strip()
    details = [str(value).strip() for value in profile.get("agentUsage") or [] if str(value).strip()]
    parts = []
    if usage:
        parts.append(usage)
    parts.extend(value for value in details if value not in parts)
    return {
        "purpose": "｜".join(parts) if parts else str(profile.get("description") or "").strip(),
        "metadata_json": json.dumps(
            {
                "profileSource": profile.get("source"),
                "description": profile.get("description"),
                "motionCategory": profile.get("motionCategory"),
                "motionScore": profile.get("motionScore"),
                "note": profile.get("note"),
            },
            ensure_ascii=False,
        ),
    }


def apply_vrma_motion_profiles(db_path, base_dir):
    profiles = _load_vrma_motion_profiles(base_dir)
    if not profiles:
        return {"updated": 0, "profiles": 0}
    init_db(db_path)
    updated = 0
    with _connect(db_path) as conn:
        rows = conn.execute(
            "SELECT id, source_url, vrma_path FROM data WHERE del = 0 AND source_kind = 'vrma'"
        ).fetchall()
        for row in rows:
            source_name = Path(row["vrma_path"] or row["source_url"] or "").name
            profile = profiles.get(source_name)
            if not profile:
                continue
            fields = _vrma_profile_fields(profile)
            conn.execute(
                "UPDATE data SET purpose = ?, metadata_json = ? WHERE id = ?",
                (fields["purpose"], fields["metadata_json"], row["id"]),
            )
            updated += 1
    return {"updated": updated, "profiles": len(profiles)}


def import_vrma_samples(db_path, base_dir, roots):
    kind = create_kind(db_path, "VRMA", "alicia")
    profiles = _load_vrma_motion_profiles(base_dir)
    imported = 0
    for root_value in roots:
        root = Path(root_value)
        if not root.is_dir():
            continue
        for vrma_path in sorted(root.rglob("*.vrma")):
            rel = _rel_path(base_dir, vrma_path)
            profile_fields = _vrma_profile_fields(profiles[vrma_path.name]) if vrma_path.name in profiles else {}
            item = create_item(
                db_path,
                {
                    "kinds_id": kind["id"],
                    "title": vrma_path.stem,
                    "source_kind": "vrma",
                    "source_url": rel,
                    "purpose": profile_fields.get("purpose") or "VRMA sample",
                    "status": 2,
                    "progress": 100,
                    "status_vrma": 3,
                    "vrma_path": rel,
                    "metadata_json": profile_fields.get("metadata_json", ""),
                },
            )
            if item and profile_fields:
                update_item(db_path, item["id"], profile_fields)
            imported += 1 if item else 0
    return {"imported": imported}


def _self_test():
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        db_path = base / "db.sqlite"
        init_db(db_path)
        kind = create_kind(db_path, "自然站姿")
        assert kind["name"] == "自然站姿"
        item = create_item(
            db_path,
            {
                "kinds_id": kind["id"],
                "title": "測試姿勢",
                "source_kind": "pose_json",
                "source_url": "sample.json",
            },
        )
        assert item["status"] == 0
        claimed = claim_next_job(db_path)
        assert claimed["id"] == item["id"]
        append_progress(db_path, item["id"], "開始處理", 50)
        done = finish_job(db_path, item["id"], ok=True, pose_json="{}")
        assert done["status"] == 2
        assert done["progress"] == 100

        demo_dir = base / "outputs" / "demo" / "sample"
        demo_dir.mkdir(parents=True)
        (demo_dir / "alicia_blender_bake_motion.json").write_text(
            json.dumps({"frameCount": 3, "source": "test"}, ensure_ascii=False),
            encoding="utf-8",
        )
        (demo_dir / "alicia_intermediate_landmarks.json").write_text(
            json.dumps({"frames": []}, ensure_ascii=False),
            encoding="utf-8",
        )
        (demo_dir / "0_input_video.mp4").write_bytes(b"fake")
        import_result = import_gvhmr_demo_outputs(db_path, base, base / "outputs" / "demo")
        assert import_result["imported"] == 1
        imported = list_items(db_path, {"q": "sample"})[0]
        assert imported["skeleton_json_path"].endswith("alicia_intermediate_landmarks.json")
        assert imported["preview_path"].endswith("0_input_video.mp4")
    print("pose_db self-test ok")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        _self_test()
