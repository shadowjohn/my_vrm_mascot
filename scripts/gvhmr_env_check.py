import argparse
import json
import subprocess
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


def relpath(path):
    try:
        return path.resolve().relative_to(REPO_ROOT.resolve()).as_posix()
    except ValueError:
        return str(path)


def path_check(path, kind):
    exists = path.is_dir() if kind == "dir" else path.is_file()
    return {
        "ok": exists,
        "path": relpath(path),
        "kind": kind,
    }


def python_version_check(env_python):
    check = path_check(env_python, "file")
    if not check["ok"]:
        return check
    result = subprocess.run(
        [str(env_python), "--version"],
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    output = (result.stdout or result.stderr).strip()
    check.update({
        "ok": result.returncode == 0,
        "version": output,
        "returnCode": result.returncode,
    })
    return check


def import_check(env_python, skip_imports):
    if skip_imports:
        return {"ok": True, "skipped": True, "imports": []}
    modules = ["torch", "cv2"]
    code = "import importlib; " + "; ".join(f"importlib.import_module('{name}')" for name in modules)
    result = subprocess.run(
        [str(env_python), "-c", code],
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    return {
        "ok": result.returncode == 0,
        "skipped": False,
        "imports": modules,
        "returnCode": result.returncode,
        "stderrTail": result.stderr[-2000:],
    }


def readiness_reason(checks, missing_checkpoints, missing_model_dirs):
    if not checks["envPython"]["ok"]:
        return "missing_env_python"
    if not checks["gvhmrRoot"]["ok"]:
        return "missing_gvhmr_root"
    if not checks["demoScript"]["ok"]:
        return "missing_demo_script"
    if not checks["requirements"]["ok"]:
        return "missing_requirements"
    if not checks["imports"]["ok"]:
        return "missing_imports"
    if missing_checkpoints or missing_model_dirs:
        return "missing_checkpoints"
    return "ready"


def build_report(args):
    env_python = Path(args.env_python)
    gvhmr_root = Path(args.gvhmr_root)
    checks = {
        "envPython": python_version_check(env_python),
        "gvhmrRoot": path_check(gvhmr_root, "dir"),
        "demoScript": path_check(gvhmr_root / "tools" / "demo" / "demo.py", "file"),
        "requirements": path_check(gvhmr_root / "requirements.txt", "file"),
        "imports": import_check(env_python, args.skip_imports),
    }
    missing_checkpoints = [
        checkpoint for checkpoint in EXPECTED_CHECKPOINTS
        if not (gvhmr_root / checkpoint).is_file()
    ]
    missing_model_dirs = [
        model_dir for model_dir in EXPECTED_MODEL_DIRS
        if not (gvhmr_root / model_dir).is_dir()
    ]
    reason = readiness_reason(checks, missing_checkpoints, missing_model_dirs)
    return {
        "ok": True,
        "ready": reason == "ready",
        "reason": reason,
        "checks": checks,
        "missingCheckpoints": missing_checkpoints,
        "missingModelDirs": missing_model_dirs,
    }


def main():
    parser = argparse.ArgumentParser(description="Check local GVHMR environment readiness.")
    parser.add_argument(
        "--env-python",
        default=str(REPO_ROOT / "conda_vm" / "gvhmr" / "env" / "python.exe"),
    )
    parser.add_argument(
        "--gvhmr-root",
        default=str(REPO_ROOT / "conda_vm" / "gvhmr" / "GVHMR"),
    )
    parser.add_argument("--skip-imports", action="store_true")
    args = parser.parse_args()
    print(json.dumps(build_report(args), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
