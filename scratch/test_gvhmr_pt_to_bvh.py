import importlib.util
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = REPO_ROOT / "scripts" / "gvhmr_pt_to_bvh.py"


def load_module():
    spec = importlib.util.spec_from_file_location("gvhmr_pt_to_bvh_under_test", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    module = load_module()
    payload = {
        "ok": True,
        "frames": [
            {
                "landmarks": {
                    "hips": {"x": 0, "y": 1, "z": 0},
                    "chest": {"x": 0, "y": 1.4, "z": 0},
                    "neck": {"x": 0, "y": 1.55, "z": 0},
                    "head": {"x": 0, "y": 1.75, "z": 0},
                    "leftShoulder": {"x": -0.2, "y": 1.45, "z": 0},
                    "leftElbow": {"x": -0.45, "y": 1.25, "z": 0},
                    "leftWrist": {"x": -0.55, "y": 1.05, "z": 0},
                    "rightShoulder": {"x": 0.2, "y": 1.45, "z": 0},
                    "rightElbow": {"x": 0.45, "y": 1.25, "z": 0},
                    "rightWrist": {"x": 0.55, "y": 1.05, "z": 0},
                    "leftKnee": {"x": -0.12, "y": 0.55, "z": 0.05},
                    "leftAnkle": {"x": -0.12, "y": 0.05, "z": 0.08},
                    "leftFoot": {"x": -0.12, "y": 0.0, "z": 0.25},
                    "rightKnee": {"x": 0.12, "y": 0.55, "z": -0.05},
                    "rightAnkle": {"x": 0.12, "y": 0.05, "z": -0.08},
                    "rightFoot": {"x": 0.12, "y": 0.0, "z": -0.25},
                }
            },
            {
                "landmarks": {
                    "hips": {"x": 0.1, "y": 1, "z": 0},
                    "chest": {"x": 0.1, "y": 1.4, "z": 0},
                    "neck": {"x": 0.1, "y": 1.55, "z": 0},
                    "head": {"x": 0.1, "y": 1.75, "z": 0},
                }
            },
        ],
    }
    bvh = module.world_motion_to_bvh(payload, fps=30)
    assert bvh.startswith("HIERARCHY\nROOT hips\n")
    assert "JOINT leftKnee" in bvh
    assert "JOINT rightWrist" in bvh
    assert "MOTION\nFrames: 2\nFrame Time: 0.03333333\n" in bvh
    assert "CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation" in bvh
    assert len(bvh.splitlines()) > 30
    print("PASS test_gvhmr_pt_to_bvh")


if __name__ == "__main__":
    main()
