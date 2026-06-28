import json
import subprocess
import sys
import tempfile
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from gvhmr_keyframe_picker import load_global_params, pick_keyframes


def test_pick_keyframes_from_pt():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "hmr4d_results.pt"
        body = torch.zeros(6, 23, 3)
        body[3, 15, 0] = 2.0
        orient = torch.zeros(6, 3)
        orient[4, 1] = 1.0
        transl = torch.zeros(6, 3)
        transl[2, 2] = 3.0
        torch.save({"smpl_params_global": {"body_pose": body, "global_orient": orient, "transl": transl}}, path)
        frames = []
        for i in range(6):
            frames.append({
                "frameIndex": i,
                "timeMs": i * 33,
                "footContact": {"left": i == 1, "right": i == 4},
                "landmarks": {
                    "leftFoot": {"y": 0.0 if i == 1 else 0.2},
                    "leftToe": {"y": 0.0 if i == 1 else 0.2},
                    "rightFoot": {"y": 0.0 if i == 4 else 0.25},
                    "rightToe": {"y": 0.0 if i == 4 else 0.25},
                },
            })
        path.with_name("alicia_intermediate_landmarks.json").write_text(json.dumps({"frames": frames}), encoding="utf-8")

        result = pick_keyframes(load_global_params(path), path, fps=30)
        frames = {item["frame"] for item in result["recommendedFrames"]}
        reasons = ",".join(item["reason"] for item in result["recommendedFrames"])
        assert result["frameCount"] == 6, result
        assert 0 in frames and 5 in frames, result
        assert "max_arm_motion" in reasons, result
        assert "max_root_travel_delta" in reasons, result
        assert "left_foot_contact" in reasons, result
        assert "right_foot_contact" in reasons, result


def test_bad_pt_exits_nonzero():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "hmr4d_results.pt"
        torch.save({"smpl_params_global": {"body_pose": torch.zeros(1, 23, 3)}}, path)
        proc = subprocess.run(
            [sys.executable, "scripts/gvhmr_keyframe_picker.py", str(path)],
            cwd=Path(__file__).resolve().parents[1],
            text=True,
            capture_output=True,
        )
        assert proc.returncode != 0


if __name__ == "__main__":
    test_pick_keyframes_from_pt()
    test_bad_pt_exits_nonzero()
    print("test_gvhmr_keyframe_picker: ok")
