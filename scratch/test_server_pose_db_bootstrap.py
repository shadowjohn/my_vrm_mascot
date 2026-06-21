import sqlite3
import tempfile
from pathlib import Path

import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import server


with tempfile.TemporaryDirectory() as tmp:
    old_path = server.POSE_DB_PATH
    db_path = Path(tmp) / "db.sqlite"
    server.POSE_DB_PATH = db_path
    try:
        server._bootstrap_pose_db()
        assert db_path.is_file()
        conn = sqlite3.connect(db_path)
        try:
            tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        finally:
            conn.close()
        assert {"kinds", "data"}.issubset(tables)
    finally:
        server.POSE_DB_PATH = old_path

print("server pose db bootstrap ok")
