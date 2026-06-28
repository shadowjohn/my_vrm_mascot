import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from gvhmr_quality_report import build_report


def q(angle_deg):
    import math

    half = math.radians(angle_deg) / 2
    return [math.sin(half), 0, 0, math.cos(half)]


def write_sample(folder):
    bake = {
        "duration_ms": 66,
        "frame_count": 2,
        "bones": {
            "leftLowerLeg": [{"time_ms": 0, "rot": q(150)}, {"time_ms": 33, "rot": q(20)}],
            "rightLowerLeg": [{"time_ms": 0, "rot": q(10)}, {"time_ms": 33, "rot": q(10)}],
            "spine": [{"time_ms": 0, "rot": q(50)}, {"time_ms": 33, "rot": q(5)}],
            "chest": [],
        },
        "hips_position": [{"time_ms": 0, "pos": [0, 0, 0]}, {"time_ms": 33, "pos": [1, 0, 0]}],
    }
    landmarks = {
        "frames": [
            {
                "timeMs": 0,
                "footContact": {"left": True, "right": False},
                "landmarks": {
                    "leftFoot": {"x": 0, "y": 0.2, "z": 0},
                    "leftToe": {"x": 0, "y": 0.2, "z": 0},
                    "rightFoot": {"x": 0, "y": 0, "z": 0},
                    "rightToe": {"x": 0, "y": 0, "z": 0},
                },
            }
        ]
    }
    (folder / "alicia_blender_bake_motion.json").write_text(json.dumps(bake), encoding="utf-8")
    (folder / "alicia_intermediate_landmarks.json").write_text(json.dumps(landmarks), encoding="utf-8")


def test_report_finds_expected_issue_types():
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        write_sample(folder)
        report = build_report(folder / "alicia_blender_bake_motion.json")
        types = {item["type"] for item in report["issues"]}
        assert {"knee_bend", "spine_lean", "root_drift", "foot_contact"}.issubset(types), report


def test_bad_file_exits_nonzero():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "alicia_blender_bake_motion.json"
        path.write_text(json.dumps({"bones": []}), encoding="utf-8")
        proc = subprocess.run(
            [sys.executable, "scripts/gvhmr_quality_report.py", str(path)],
            cwd=Path(__file__).resolve().parents[1],
            text=True,
            capture_output=True,
        )
        assert proc.returncode != 0


if __name__ == "__main__":
    test_report_finds_expected_issue_types()
    test_bad_file_exits_nonzero()
    print("test_gvhmr_quality_report: ok")
