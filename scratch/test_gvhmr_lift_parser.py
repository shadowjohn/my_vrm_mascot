import importlib.util
import math
from pathlib import Path
from tempfile import TemporaryDirectory

import torch


REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = REPO_ROOT / "scripts" / "gvhmr_lift.py"


def load_module():
    spec = importlib.util.spec_from_file_location("gvhmr_lift_under_test", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    module = load_module()
    toe_frames = module.smpl_joints_to_landmark_frames(
        torch.tensor([[
            [0.0, 0.0, 0.0],
            [0.0, 0.0, 0.0],
            [0.0, 0.0, 0.0],
            [0.0, 0.0, 0.0],
            [0.0, 0.5, 0.0],
            [2.0, 0.5, 0.0],
            [0.0, 0.0, 0.0],
            [0.0, 0.0, 0.0],
            [2.0, 0.0, 0.0],
            [0.0, 0.0, 0.0],
            [0.0, 0.0, 1.0],
            [2.0, 0.0, 1.0],
        ]], dtype=torch.float32),
        torch.tensor([[
            [0.0, 0.0, 1.35],
            [0.0, 0.0, 0.8],
            [2.0, 0.0, 1.25],
            [2.0, 0.0, 0.7],
        ]], dtype=torch.float32),
    )
    assert toe_frames[0]["leftToe"] == {"x": 0.0, "y": 0.0, "z": 1.35}
    assert toe_frames[0]["rightToe"] == {"x": 2.0, "y": 0.0, "z": 1.25}

    original_extractor = getattr(module, "extract_smpl_landmark_frames", None)
    module.extract_smpl_landmark_frames = lambda pred, gvhmr_root=None: [
        {
            "hips": {"x": 0.0, "y": 1.0, "z": 0.0},
            "chest": {"x": 0.0, "y": 1.4, "z": 0.0},
            "head": {"x": 0.0, "y": 1.72, "z": -0.05},
            "leftShoulder": {"x": -0.18, "y": 1.48, "z": 0.02},
            "rightShoulder": {"x": 0.18, "y": 1.48, "z": -0.02},
            "leftElbow": {"x": -0.32, "y": 1.22, "z": 0.04},
            "rightElbow": {"x": 0.32, "y": 1.22, "z": -0.04},
            "leftWrist": {"x": -0.42, "y": 1.02, "z": 0.06},
            "rightWrist": {"x": 0.42, "y": 1.02, "z": -0.06},
            "leftKnee": {"x": -0.08, "y": 0.52, "z": 0.03},
            "rightKnee": {"x": 0.08, "y": 0.52, "z": -0.03},
            "leftAnkle": {"x": -0.1, "y": 0.02, "z": 0.08},
            "rightAnkle": {"x": 0.1, "y": 0.0, "z": -0.08},
        },
        {
            "hips": {"x": 1.0, "y": 1.1, "z": 2.0},
            "chest": {"x": 1.0, "y": 1.5, "z": 2.0},
            "head": {"x": 1.0, "y": 1.82, "z": 1.95},
            "leftShoulder": {"x": 0.82, "y": 1.58, "z": 2.02},
            "rightShoulder": {"x": 1.18, "y": 1.58, "z": 1.98},
            "leftElbow": {"x": 0.68, "y": 1.32, "z": 2.04},
            "rightElbow": {"x": 1.32, "y": 1.32, "z": 1.96},
            "leftWrist": {"x": 0.58, "y": 1.12, "z": 2.06},
            "rightWrist": {"x": 1.42, "y": 1.12, "z": 1.94},
            "leftKnee": {"x": 0.92, "y": 0.62, "z": 2.03},
            "rightKnee": {"x": 1.08, "y": 0.62, "z": 1.97},
            "leftAnkle": {"x": 0.9, "y": 0.12, "z": 2.08},
            "rightAnkle": {"x": 1.1, "y": 0.1, "z": 1.92},
        },
    ]
    with TemporaryDirectory() as tmp_dir:
        result_path = Path(tmp_dir) / "hmr4d_results.pt"
        torch.save({
            "smpl_params_global": {
                "transl": torch.tensor([
                    [0.0, 0.0, 0.0],
                    [1.0, 0.1, 2.0],
                ], dtype=torch.float32),
                "global_orient": torch.tensor([
                    [0.0, 0.0, 0.0],
                    [0.0, math.pi / 2, 0.0],
                ], dtype=torch.float32),
            },
            "net_outputs": {
                "static_conf_logits": torch.tensor([[[0.0, 2.0], [1.0, 0.0]]], dtype=torch.float32),
            },
        }, result_path)

        payload = module.parse_hmr4d_results(result_path, fps=30, static_camera=True, gvhmr_root=Path(tmp_dir))
    if original_extractor is not None:
        module.extract_smpl_landmark_frames = original_extractor

    assert payload["ok"] is True
    assert payload["source"] == "gvhmr"
    assert payload["metadata"]["parser"] == "hmr4d_results_minimal"
    assert payload["metadata"]["staticCamera"] is True
    assert len(payload["frames"]) == 2
    assert abs(payload["frames"][1]["t"] - (1 / 30)) < 0.0001
    assert payload["frames"][1]["rootTranslation"] == {"x": 1.0, "y": 0.1, "z": 2.0}
    assert abs(payload["frames"][1]["bodyYawDegrees"] - 90.0) < 0.01
    assert payload["frames"][0]["footContact"] == {"left": False, "right": False}
    assert 0.0 <= payload["frames"][1]["confidence"] <= 1.0
    assert payload["frames"][0]["landmarks"]["leftAnkle"]["z"] == 0.08
    assert payload["frames"][1]["landmarks"]["rightWrist"]["x"] == 1.42
    assert payload["metadata"]["jointSource"] == "smpl_joints"
    print("PASS test_gvhmr_lift_parser")


if __name__ == "__main__":
    main()
