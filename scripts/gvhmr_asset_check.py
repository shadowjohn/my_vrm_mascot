import argparse
import json
import os
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent

EXPECTED_CHECKPOINTS = [
    "inputs/checkpoints/gvhmr/gvhmr_siga24_release.ckpt",
    "inputs/checkpoints/hmr2/epoch=10-step=25000.ckpt",
    "inputs/checkpoints/vitpose/vitpose-h-multi-coco.pth",
    "inputs/checkpoints/yolo/yolov8x.pt",
]

EXPECTED_MODEL_DIRS = [
    "inputs/checkpoints/body_models/smpl",
    "inputs/checkpoints/body_models/smplx",
]


def default_gvhmr_root():
    configured = os.environ.get("GVHMR_ROOT_DIR")
    if configured:
        return configured
    return str(REPO_ROOT / "conda_vm" / "gvhmr" / "GVHMR")


def build_report(gvhmr_root):
    root = Path(gvhmr_root)
    missing = [
        checkpoint for checkpoint in EXPECTED_CHECKPOINTS
        if not (root / checkpoint).is_file()
    ]
    missing.extend(
        model_dir for model_dir in EXPECTED_MODEL_DIRS
        if not (root / model_dir).is_dir()
    )
    return {
        "ok": not missing,
        "missing": missing,
    }


def main():
    parser = argparse.ArgumentParser(description="Check required GVHMR model assets.")
    parser.add_argument("--gvhmr-root", default=default_gvhmr_root())
    args = parser.parse_args()
    print(json.dumps(build_report(args.gvhmr_root), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
