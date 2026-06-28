import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from gvhmr_motion_analyzer import analyze_frames


def frame(t, x, z, hip_y=1.0, hand_y=1.1, contact_left=True, contact_right=False):
    return {
        "t": t,
        "rootTranslation": {"x": x, "y": hip_y, "z": z},
        "footContact": {"left": contact_left, "right": contact_right},
        "confidence": 0.9,
        "landmarks": {
            "hips": {"x": x, "y": hip_y, "z": z},
            "head": {"x": x, "y": hip_y + 0.7, "z": z},
            "leftShoulder": {"x": x - 0.2, "y": hip_y + 0.45, "z": z},
            "rightShoulder": {"x": x + 0.2, "y": hip_y + 0.45, "z": z},
            "leftWrist": {"x": x - 0.3, "y": hand_y, "z": z},
            "rightWrist": {"x": x + 0.3, "y": hand_y, "z": z},
            "leftFoot": {"x": x - 0.1, "y": 0.0, "z": z},
            "rightFoot": {"x": x + 0.1, "y": 0.0, "z": z},
            "leftToe": {"x": x - 0.1, "y": 0.0, "z": z + 0.08},
            "rightToe": {"x": x + 0.1, "y": 0.0, "z": z + 0.08},
        },
    }


def test_walk_like():
    frames = [frame(i / 10, i * 0.07, 0, contact_left=i % 2 == 0, contact_right=i % 2 == 1) for i in range(20)]
    result = analyze_frames(frames, "walk.json")
    assert result["primary"] == "walk", result


def test_jump_like():
    frames = [frame(i / 10, 0, 0, hip_y=1.0 + (0.5 if 3 <= i <= 6 else 0), contact_left=False, contact_right=False) for i in range(10)]
    result = analyze_frames(frames, "jump.json")
    assert result["primary"] == "jump", result


def test_bad_file_exits_nonzero():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "alicia_intermediate_landmarks.json"
        path.write_text(json.dumps({"frames": []}), encoding="utf-8")
        proc = subprocess.run(
            [sys.executable, "scripts/gvhmr_motion_analyzer.py", str(path)],
            cwd=Path(__file__).resolve().parents[1],
            text=True,
            capture_output=True,
        )
        assert proc.returncode != 0


if __name__ == "__main__":
    test_walk_like()
    test_jump_like()
    test_bad_file_exits_nonzero()
    print("test_gvhmr_motion_analyzer: ok")
