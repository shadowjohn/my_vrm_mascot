import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
PRETRAINED_DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1eebJ13FUEXrKBawHpJroW0sNSxLjh9xD?usp=drive_link"

EXPECTED_DOWNLOADABLE_FILES = [
    "inputs/checkpoints/gvhmr/gvhmr_siga24_release.ckpt",
    "inputs/checkpoints/hmr2/epoch=10-step=25000.ckpt",
    "inputs/checkpoints/vitpose/vitpose-h-multi-coco.pth",
    "inputs/checkpoints/yolo/yolov8x.pt",
]

DOWNLOADABLE_FILE_IDS = {
    "inputs/checkpoints/gvhmr/gvhmr_siga24_release.ckpt": "1c9iCeKFN4Kr6cMPJ9Ss6Jdc3SZFnO5NP",
    "inputs/checkpoints/hmr2/epoch=10-step=25000.ckpt": "1X5hvVqvqI9tvjUCb2oAlZxtgIKD9kvsc",
    "inputs/checkpoints/vitpose/vitpose-h-multi-coco.pth": "1sR8xZD9wrZczdDVo6zKscNLwvarIRhP5",
    "inputs/checkpoints/yolo/yolov8x.pt": "1_HGm-lqIH83-M1ML4bAXaqhm_eT2FKo5",
}

EXPECTED_BODY_MODEL_FILES = [
    "inputs/checkpoints/body_models/smpl/SMPL_NEUTRAL.pkl",
    "inputs/checkpoints/body_models/smplx/SMPLX_NEUTRAL.npz",
]

PREPARE_DIRS = [
    "inputs/checkpoints/gvhmr",
    "inputs/checkpoints/hmr2",
    "inputs/checkpoints/vitpose",
    "inputs/checkpoints/yolo",
    "inputs/checkpoints/body_models/smpl",
    "inputs/checkpoints/body_models/smplx",
]


def default_gvhmr_root():
    configured = os.environ.get("GVHMR_ROOT_DIR")
    if configured:
        return configured
    return str(REPO_ROOT / "conda_vm" / "gvhmr" / "GVHMR")


def relpath(path, root):
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return str(path)


def missing_files(root, files):
    return [item for item in files if not (root / item).is_file()]


def manual_download_urls(files):
    return {
        item: f"https://drive.google.com/uc?id={DOWNLOADABLE_FILE_IDS[item]}"
        for item in files
        if item in DOWNLOADABLE_FILE_IDS
    }


def ensure_asset_dirs(root):
    for item in PREPARE_DIRS:
        (root / item).mkdir(parents=True, exist_ok=True)


def write_manual_checklist(root):
    body_root = root / "inputs" / "checkpoints" / "body_models"
    body_root.mkdir(parents=True, exist_ok=True)
    checklist = body_root / "README_MANUAL_DOWNLOAD.txt"
    checklist.write_text(
        "\n".join([
            "GVHMR body model files require license-gated manual downloads.",
            "",
            "1. SMPL",
            "   Source: https://smpl.is.tue.mpg.de/",
            "   Put file here:",
            "   inputs/checkpoints/body_models/smpl/SMPL_NEUTRAL.pkl",
            "",
            "2. SMPL-X",
            "   Source: https://smpl-x.is.tue.mpg.de/",
            "   Put file here:",
            "   inputs/checkpoints/body_models/smplx/SMPLX_NEUTRAL.npz",
            "",
            "Optional but useful later:",
            "   inputs/checkpoints/body_models/smpl/SMPL_MALE.pkl",
            "   inputs/checkpoints/body_models/smpl/SMPL_FEMALE.pkl",
            "   inputs/checkpoints/body_models/smplx/SMPLX_MALE.npz",
            "   inputs/checkpoints/body_models/smplx/SMPLX_FEMALE.npz",
            "",
        ]),
        encoding="utf-8",
    )
    return checklist


def ensure_gdown(install_gdown):
    try:
        import gdown  # noqa: F401
        return {"ok": True, "installed": False}
    except Exception as exc:
        if not install_gdown:
            return {"ok": False, "installed": False, "error": f"{type(exc).__name__}: {exc}"}

    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "gdown"],
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    return {
        "ok": result.returncode == 0,
        "installed": result.returncode == 0,
        "returnCode": result.returncode,
        "stdoutTail": result.stdout[-2000:],
        "stderrTail": result.stderr[-2000:],
    }


def run_gdown(root, install_gdown):
    gdown_status = ensure_gdown(install_gdown)
    if not gdown_status.get("ok"):
        return {
            "attempted": True,
            "ok": False,
            "tool": "gdown",
            "gdown": gdown_status,
        }

    checkpoints_dir = root / "inputs" / "checkpoints"
    checkpoints_dir.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        "-m",
        "gdown",
        "--folder",
        PRETRAINED_DRIVE_FOLDER_URL,
        "-O",
        str(checkpoints_dir),
        "--remaining-ok",
    ]
    result = subprocess.run(
        command,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    retry_without_remaining_ok = (
        result.returncode != 0
        and "unrecognized arguments: --remaining-ok" in (result.stderr or "")
    )
    if retry_without_remaining_ok:
        command = [item for item in command if item != "--remaining-ok"]
        result = subprocess.run(
            command,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    folder_ok = result.returncode == 0
    individual_downloads = []
    for item in missing_files(root, EXPECTED_DOWNLOADABLE_FILES):
        file_id = DOWNLOADABLE_FILE_IDS.get(item)
        target = root / item
        if not file_id:
            individual_downloads.append({
                "ok": False,
                "path": item,
                "reason": "missing_file_id",
            })
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        item_command = [
            sys.executable,
            "-m",
            "gdown",
            "--continue",
            file_id,
            "-O",
            str(target),
        ]
        item_result = subprocess.run(
            item_command,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        individual_downloads.append({
            "ok": item_result.returncode == 0 and target.is_file(),
            "path": item,
            "fileId": file_id,
            "url": f"https://drive.google.com/uc?id={file_id}",
            "command": item_command,
            "returnCode": item_result.returncode,
            "stdoutTail": item_result.stdout[-2000:],
            "stderrTail": item_result.stderr[-2000:],
        })

    remaining = missing_files(root, EXPECTED_DOWNLOADABLE_FILES)
    return {
        "attempted": True,
        "ok": not remaining,
        "tool": "gdown",
        "folderOk": folder_ok,
        "command": command,
        "retryWithoutRemainingOk": retry_without_remaining_ok,
        "returnCode": result.returncode,
        "stdoutTail": result.stdout[-4000:],
        "stderrTail": result.stderr[-4000:],
        "individualDownloads": individual_downloads,
        "remaining": remaining,
        "manualDownloadUrls": manual_download_urls(remaining),
        "gdown": gdown_status,
    }


def build_report(args):
    root = Path(args.gvhmr_root)
    ensure_asset_dirs(root)
    checklist = write_manual_checklist(root)

    missing_downloadable = missing_files(root, EXPECTED_DOWNLOADABLE_FILES)
    download_result = {"attempted": False, "ok": False}
    if missing_downloadable and not args.skip_download:
        download_result = run_gdown(root, args.install_gdown)
        missing_downloadable = missing_files(root, EXPECTED_DOWNLOADABLE_FILES)

    missing_body_model_files = missing_files(root, EXPECTED_BODY_MODEL_FILES)
    downloadable_ready = not missing_downloadable
    manual_ready = not missing_body_model_files

    return {
        "ok": downloadable_ready and manual_ready,
        "gvhmrRoot": str(root.resolve()),
        "driveFolderUrl": PRETRAINED_DRIVE_FOLDER_URL,
        "downloadAttempted": bool(download_result.get("attempted")),
        "downloadResult": download_result,
        "downloadableReady": downloadable_ready,
        "manualReady": manual_ready,
        "missingDownloadable": missing_downloadable,
        "manualDownloadUrls": manual_download_urls(missing_downloadable),
        "missingBodyModelFiles": missing_body_model_files,
        "manualChecklistPath": str(checklist.resolve()),
    }


def report_json(report):
    return json.dumps(report, ensure_ascii=True, indent=2)


def main():
    parser = argparse.ArgumentParser(description="Prepare GVHMR model assets.")
    parser.add_argument("--gvhmr-root", default=default_gvhmr_root())
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Only create folders and the SMPL/SMPL-X manual checklist.",
    )
    parser.add_argument(
        "--no-install-gdown",
        dest="install_gdown",
        action="store_false",
        help="Do not auto-install gdown before downloading public checkpoints.",
    )
    parser.set_defaults(install_gdown=True)
    args = parser.parse_args()
    print(report_json(build_report(args)))


if __name__ == "__main__":
    main()
