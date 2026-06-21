import json
import tempfile
import unittest
from pathlib import Path

import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pose_json_to_vrma import convert_pose_json_to_vrma
from vrma_pose_converter import convert_vrma_to_pose_json
import pose_db


class PoseJsonToVrmaTests(unittest.TestCase):
    def test_pose_json_exports_readable_vrma(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            tmp = Path(temp_dir)
            output = tmp / "sample.vrma"
            pose = {
                "name": "sample",
                "duration_ms": 1000,
                "frame_count": 2,
                "bones": {
                    "leftUpperArm": [
                        {"time_ms": 0, "rot": [0, 0, 0, 1]},
                        {"time_ms": 1000, "rot": [0, 0.707107, 0, 0.707107]},
                    ],
                },
                "hips_position": [
                    {"time_ms": 0, "pos": [0, 0, 0]},
                    {"time_ms": 1000, "pos": [0.1, 0.2, 0.3]},
                ],
            }

            result = convert_pose_json_to_vrma(pose, output)
            roundtrip = convert_vrma_to_pose_json(output)

            self.assertEqual(result["channels"], 2)
            self.assertTrue(output.read_bytes().startswith(b"glTF"))
            self.assertEqual(roundtrip["frame_count"], 2)
            self.assertIn("leftUpperArm", roundtrip["bones"])
            self.assertEqual(roundtrip["duration_ms"], 1000)

    def test_pose_db_pose_json_row_exports_vrma(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir)
            source = base / "pose.json"
            source.write_text(json.dumps({
                "name": "db pose",
                "duration_ms": 1000,
                "bones": {
                    "hips": [
                        {"time_ms": 0, "rot": [0, 0, 0, 1]},
                        {"time_ms": 1000, "rot": [0, 0, 0, 1]},
                    ],
                },
            }), encoding="utf-8")
            db_path = base / "db.sqlite"
            item = pose_db.create_item(db_path, {
                "title": "db pose",
                "source_kind": "pose_json",
                "source_url": "pose.json",
                "pose_json_path": "pose.json",
            })

            exported = pose_db.convert_pose_json_item_to_vrma(db_path, base, item["id"])

            self.assertEqual(exported["status_vrma"], 3)
            self.assertTrue(exported["vrma_path"].endswith(".vrma"))
            self.assertTrue((base / exported["vrma_path"]).exists())


if __name__ == "__main__":
    unittest.main()
