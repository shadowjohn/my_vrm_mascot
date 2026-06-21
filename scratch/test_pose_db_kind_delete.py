import tempfile
import unittest
from pathlib import Path

import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import pose_db


class PoseDbKindDeleteTests(unittest.TestCase):
    def test_kind_counts_and_delete_only_when_empty(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "db.sqlite"
            used = pose_db.create_kind(db_path, "used")
            empty = pose_db.create_kind(db_path, "empty")
            pose_db.create_item(db_path, {
                "kinds_id": used["id"],
                "title": "pose",
                "source_kind": "pose_json",
                "source_url": "pose.json",
            })

            counts = {row["id"]: row["item_count"] for row in pose_db.list_kinds(db_path)}

            self.assertEqual(counts[used["id"]], 1)
            self.assertEqual(counts[empty["id"]], 0)
            with self.assertRaises(ValueError):
                pose_db.delete_kind(db_path, used["id"])
            self.assertIsNone(pose_db.delete_kind(db_path, empty["id"]))


if __name__ == "__main__":
    unittest.main()
