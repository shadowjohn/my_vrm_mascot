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

EXPECTED_BODY_MODEL_FILES = [
    "inputs/checkpoints/body_models/smpl/SMPL_NEUTRAL.pkl",
    "inputs/checkpoints/body_models/smplx/SMPLX_NEUTRAL.npz",
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


DEFAULT_REQUIRED_IMPORTS = ["torch", "cv2", "pytorch3d", "hmr4d"]


def import_check(env_python, skip_imports, required_imports):
    if skip_imports:
        return {"ok": True, "skipped": True, "imports": []}
    modules = required_imports or DEFAULT_REQUIRED_IMPORTS
    code = """
import importlib
import json
import sys

missing = []
for name in sys.argv[1:]:
    try:
        importlib.import_module(name)
    except Exception as exc:
        missing.append({"name": name, "error": f"{type(exc).__name__}: {exc}"})
print(json.dumps(missing))
sys.exit(1 if missing else 0)
"""
    result = subprocess.run(
        [str(env_python), "-c", code, *modules],
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    missing = []
    try:
        missing = json.loads(result.stdout.strip() or "[]")
    except json.JSONDecodeError:
        missing = [{"name": "unknown", "error": result.stdout.strip()}]
    return {
        "ok": result.returncode == 0,
        "skipped": False,
        "imports": modules,
        "missingImports": [item["name"] for item in missing],
        "missingImportErrors": missing,
        "returnCode": result.returncode,
        "stderrTail": result.stderr[-2000:],
    }


def readiness_reason(checks, missing_checkpoints, missing_model_dirs, missing_body_model_files):
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
    if missing_checkpoints or missing_model_dirs or missing_body_model_files:
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
        "imports": import_check(env_python, args.skip_imports, args.required_import),
    }
    missing_checkpoints = [
        checkpoint for checkpoint in EXPECTED_CHECKPOINTS
        if not (gvhmr_root / checkpoint).is_file()
    ]
    missing_model_dirs = [
        model_dir for model_dir in EXPECTED_MODEL_DIRS
        if not (gvhmr_root / model_dir).is_dir()
    ]
    missing_body_model_files = [
        model_file for model_file in EXPECTED_BODY_MODEL_FILES
        if not (gvhmr_root / model_file).is_file()
    ]
    reason = readiness_reason(checks, missing_checkpoints, missing_model_dirs, missing_body_model_files)
    return {
        "ok": True,
        "ready": reason == "ready",
        "reason": reason,
        "checks": checks,
        "missingCheckpoints": missing_checkpoints,
        "missingModelDirs": missing_model_dirs,
        "missingBodyModelFiles": missing_body_model_files,
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
    parser.add_argument("--required-import", action="append", default=[])
    args = parser.parse_args()
    print(json.dumps(build_report(args), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
