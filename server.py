import os
import json
import mimetypes
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, urlunparse
from flask import Flask, request, jsonify, send_from_directory

mimetypes.add_type('text/html', '.php')

app = Flask(__name__, static_folder='.', static_url_path='')

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_MOTION_PROFILE_STORE_PATH = BASE_DIR / "examples" / "m6_7_vrma_samples" / "review" / "motion_profiles.json"
DEFAULT_MOTION_MINING_LOG_STORE_PATH = BASE_DIR / "examples" / "m6_7_vrma_samples" / "review" / "mining_log.json"
VRMA_SAMPLE_DIR = BASE_DIR / "examples" / "m6_7_vrma_samples"
LOCAL_VRMA_SAMPLE_DIR = BASE_DIR / "local_assets" / "vrma"
YOUTUBE_CAPTURE_MAX_FILE_SIZE_MB = 500
YOUTUBE_CAPTURE_TIMEOUT_SEC = 180
VIDEO_SKELETON_DEFAULT_FPS = 8
VIDEO_SKELETON_MAX_FRAMES = 240
MOTIONBERT_TIMEOUT_SEC = 240
MOTIONBERT_DEFAULT_CONFIG = "configs/pose3d/MB_ft_h36m_global_lite.yaml"
MOTIONBERT_DEFAULT_CHECKPOINT = "checkpoint/pose3d/FT_MB_lite_MB_ft_h36m_global_lite/best_epoch.bin"
MOTION_PROFILE_CATEGORIES = {
    "present",
    "point",
    "think",
    "warning",
    "success",
    "candidate_future",
    "reject",
}


def _now_iso():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _youtube_capture_dir():
    return BASE_DIR / "local_assets" / "capture" / "youtube"


def _path_is_inside(path, base_dir):
    try:
        path.resolve().relative_to(base_dir.resolve())
        return True
    except ValueError:
        return False


def _normalize_youtube_url(raw_url):
    url = str(raw_url or "").strip()
    if not url:
        raise ValueError("請輸入 YouTube URL")

    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("請輸入完整的 YouTube URL")

    host = (parsed.hostname or "").lower()
    is_youtube_host = (
        host == "youtu.be"
        or host == "youtube.com"
        or host.endswith(".youtube.com")
        or host == "youtube-nocookie.com"
        or host.endswith(".youtube-nocookie.com")
    )
    if not is_youtube_host:
        raise ValueError("只支援 YouTube URL")

    return urlunparse(parsed._replace(fragment=""))


def _download_youtube_capture(url):
    normalized_url = _normalize_youtube_url(url)
    capture_dir = _youtube_capture_dir()
    capture_dir.mkdir(parents=True, exist_ok=True)
    output_template = str(capture_dir / "%(id)s.%(ext)s")
    started_at = time.time()

    command = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--no-playlist",
        "--restrict-filenames",
        "--windows-filenames",
        "--socket-timeout",
        "20",
        "--retries",
        "2",
        "--fragment-retries",
        "2",
        "--max-filesize",
        f"{YOUTUBE_CAPTURE_MAX_FILE_SIZE_MB}M",
        "--format",
        "bestvideo[height<=720][ext=mp4]/best[height<=720][ext=mp4]/best[height<=720]/best",
        "--print",
        "after_move:%(filepath)s",
        "-o",
        output_template,
        normalized_url,
    ]

    try:
        result = subprocess.run(
            command,
            cwd=str(BASE_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=YOUTUBE_CAPTURE_TIMEOUT_SEC,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"YouTube 下載逾時，請稍後重試或改用較短影片。({YOUTUBE_CAPTURE_TIMEOUT_SEC}s)") from exc

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        if "No module named yt_dlp" in stderr or "yt_dlp" in stderr and "No module named" in stderr:
            raise RuntimeError("找不到 yt-dlp，請先執行 pip install -r requirements.txt")
        raise RuntimeError(stderr[-800:] or "YouTube 下載失敗")

    resolved_capture_dir = capture_dir.resolve()
    candidate_paths = []
    for line in (result.stdout or "").splitlines():
        text = line.strip().strip('"')
        if not text:
            continue
        path = Path(text)
        if not path.is_absolute():
            path = capture_dir / text
        try:
            resolved_path = path.resolve()
        except OSError:
            continue
        if resolved_path.is_file() and _path_is_inside(resolved_path, resolved_capture_dir):
            candidate_paths.append(resolved_path)

    if not candidate_paths:
        video_suffixes = {".mp4", ".webm", ".mkv", ".mov", ".m4v"}
        candidate_paths = [
            path.resolve()
            for path in capture_dir.iterdir()
            if path.is_file()
            and path.suffix.lower() in video_suffixes
            and path.stat().st_mtime >= started_at - 2
        ]

    if not candidate_paths:
        raise RuntimeError("YouTube 下載完成但找不到輸出影片檔")

    video_path = max(candidate_paths, key=lambda path: path.stat().st_mtime)
    return {
        "title": video_path.stem,
        "filename": video_path.name,
        "path": video_path,
        "size": video_path.stat().st_size,
    }


def _build_youtube_capture_source(source_url, download_result):
    filename = os.path.basename(str(download_result.get("filename", "")))
    if not filename:
        raise ValueError("YouTube 下載結果缺少檔名")

    content_type = mimetypes.guess_type(filename)[0] or "video/mp4"
    return {
        "type": "youtube",
        "sourceUrl": _normalize_youtube_url(source_url),
        "title": str(download_result.get("title") or Path(filename).stem),
        "filename": filename,
        "url": f"capture/youtube/{filename}",
        "contentType": content_type,
        "size": int(download_result.get("size") or 0),
        "downloadedAt": _now_iso(),
    }


def _resolve_local_video_url(video_url):
    raw_url = str(video_url or "").strip()
    if not raw_url:
        raise ValueError("videoUrl 為必填欄位")

    parsed = urlparse(raw_url)
    if parsed.scheme or parsed.netloc:
        raise ValueError("videoUrl 必須是本機 local video URL")

    normalized = raw_url.replace("\\", "/").lstrip("/")
    if not normalized.startswith("capture/youtube/"):
        raise ValueError("目前只支援 local video URL，例如 capture/youtube/demo.mp4")

    filename = os.path.basename(normalized)
    if not filename or normalized != f"capture/youtube/{filename}":
        raise ValueError("不合法的 local video URL")

    video_path = _youtube_capture_dir() / filename
    if not video_path.is_file() or not _path_is_inside(video_path, _youtube_capture_dir()):
        raise FileNotFoundError("找不到本機影片檔，請先載入 YouTube 影片")

    return video_path


def _clamped_int(value, fallback, lower, upper):
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = fallback
    return max(lower, min(upper, number))


def _normalize_video_capture_range(data):
    try:
        start_ms = float(data.get("startMs", 0) or 0)
    except (TypeError, ValueError):
        raise ValueError("startMs 必須是數值")
    if start_ms < 0:
        raise ValueError("startMs 不可小於 0")

    raw_end_ms = data.get("endMs")
    if raw_end_ms in (None, ""):
        return round(start_ms, 3), None

    try:
        end_ms = float(raw_end_ms)
    except (TypeError, ValueError):
        raise ValueError("endMs 必須是數值")
    if end_ms <= start_ms:
        raise ValueError("endMs 必須大於 startMs")

    return round(start_ms, 3), round(end_ms, 3)


def _average_pose_landmark(landmarks, indexes):
    points = [landmarks[index] for index in indexes]
    count = len(points)
    return {
        "x": sum(point.x for point in points) / count,
        "y": sum(point.y for point in points) / count,
        "z": sum(point.z for point in points) / count,
        "visibility": sum(float(getattr(point, "visibility", 1.0) or 0.0) for point in points) / count,
    }


def _pose_landmark_to_dict(point):
    return {
        "x": float(point.x),
        "y": float(point.y),
        "z": float(point.z),
        "visibility": float(getattr(point, "visibility", 1.0) or 0.0),
    }


def _convert_mediapipe_landmarks_to_canonical(raw_landmarks):
    landmarks = raw_landmarks.landmark
    left_hip = landmarks[23]
    right_hip = landmarks[24]
    left_ankle = landmarks[27]
    right_ankle = landmarks[28]
    nose = landmarks[0]

    hip_center = _average_pose_landmark(landmarks, [23, 24])
    shoulder_center = _average_pose_landmark(landmarks, [11, 12])
    floor_y = max(left_ankle.y, right_ankle.y)
    body_height = max(0.15, floor_y - min(nose.y, shoulder_center["y"]))
    scale = 1.7 / body_height
    hip_z = (left_hip.z + right_hip.z) / 2

    def convert(point):
        source = point if isinstance(point, dict) else _pose_landmark_to_dict(point)
        return {
            "x": round((source["x"] - hip_center["x"]) * scale, 4),
            "y": round((floor_y - source["y"]) * scale + 0.05, 4),
            "z": round((source["z"] - hip_z) * scale, 4),
            "visibility": round(source["visibility"], 4),
        }

    return {
        "hips": convert(hip_center),
        "chest": convert(shoulder_center),
        "head": convert(nose),
        "leftShoulder": convert(landmarks[11]),
        "rightShoulder": convert(landmarks[12]),
        "leftElbow": convert(landmarks[13]),
        "rightElbow": convert(landmarks[14]),
        "leftWrist": convert(landmarks[15]),
        "rightWrist": convert(landmarks[16]),
        "leftKnee": convert(landmarks[25]),
        "rightKnee": convert(landmarks[26]),
        "leftAnkle": convert(left_ankle),
        "rightAnkle": convert(right_ankle),
    }


def _landmark_z_values(frames, names):
    values = []
    for frame in frames:
        landmarks = frame.get("landmarks", {}) if isinstance(frame, dict) else {}
        for name in names:
            try:
                values.append(float(landmarks.get(name, {}).get("z")))
            except (TypeError, ValueError):
                pass
    return values


def _motionbert_depth_metadata(frames):
    left_values = _landmark_z_values(frames, ["leftKnee", "leftAnkle"])
    right_values = _landmark_z_values(frames, ["rightKnee", "rightAnkle"])
    if not left_values or not right_values:
        return {
            "viewpoint": "front",
            "frontBackConfidence": 0.0,
            "leadFoot": "unknown",
        }

    left_depth = sum(left_values) / len(left_values)
    right_depth = sum(right_values) / len(right_values)
    delta = right_depth - left_depth
    confidence = max(0.0, min(1.0, abs(delta) / 0.6))
    return {
        "viewpoint": "front",
        "frontBackConfidence": round(confidence, 3),
        "leadFoot": "left" if delta >= 0 else "right",
    }


def _motionbert_workspace_dir():
    configured = os.environ.get("MOTIONBERT_WORKSPACE_DIR")
    return Path(configured) if configured else BASE_DIR / "conda_vm" / "motionBERT"


def _motionbert_repo_dir():
    configured = os.environ.get("MOTIONBERT_REPO_DIR")
    return Path(configured) if configured else _motionbert_workspace_dir() / "MotionBERT"


def _motionbert_env_dir():
    configured = os.environ.get("MOTIONBERT_ENV_DIR")
    return Path(configured) if configured else _motionbert_workspace_dir() / "env"


def _motionbert_python_path():
    configured = os.environ.get("MOTIONBERT_PYTHON")
    if configured:
        return Path(configured)
    env_dir = _motionbert_env_dir()
    if os.name == "nt":
        return env_dir / "python.exe"
    return env_dir / "bin" / "python"


def _motionbert_checkpoint_path():
    configured = os.environ.get("MOTIONBERT_CHECKPOINT")
    return Path(configured) if configured else _motionbert_repo_dir() / MOTIONBERT_DEFAULT_CHECKPOINT


def _motionbert_config_path():
    configured = os.environ.get("MOTIONBERT_CONFIG")
    return Path(configured) if configured else _motionbert_repo_dir() / MOTIONBERT_DEFAULT_CONFIG


def _motionbert_sidecar_path():
    configured = os.environ.get("MOTIONBERT_SIDECAR")
    return Path(configured) if configured else BASE_DIR / "scripts" / "motionbert_lift.py"


def _motionbert_runtime_env():
    env = os.environ.copy()
    env_dir = _motionbert_env_dir()
    path_parts = [
        str(env_dir),
        str(env_dir / "Library" / "bin"),
        str(env_dir / "Scripts"),
        env.get("PATH", ""),
    ]
    env["PATH"] = os.pathsep.join(part for part in path_parts if part)
    return env


def _assert_motionbert_runtime_ready():
    checks = [
        (_motionbert_python_path(), "MotionBERT python env not found"),
        (_motionbert_repo_dir(), "MotionBERT repo not found"),
        (_motionbert_config_path(), "MotionBERT config not found"),
        (_motionbert_checkpoint_path(), "MotionBERT checkpoint missing"),
        (_motionbert_sidecar_path(), "MotionBERT sidecar not found"),
    ]
    for path, message in checks:
        if not path.exists():
            raise RuntimeError(f"{message}: {path}")


def _run_motionbert_3d_lift(sequence, video_path):
    _assert_motionbert_runtime_ready()
    started_at = time.time()
    with tempfile.TemporaryDirectory(prefix="motionbert_lift_") as tmp_dir:
        tmp_path = Path(tmp_dir)
        input_path = tmp_path / "sequence.json"
        output_path = tmp_path / "lifted.json"
        with input_path.open("w", encoding="utf-8", newline="\n") as f:
            json.dump(sequence, f, ensure_ascii=False)

        command = [
            str(_motionbert_python_path()),
            str(_motionbert_sidecar_path()),
            "--motionbert-root",
            str(_motionbert_repo_dir()),
            "--config",
            str(_motionbert_config_path()),
            "--checkpoint",
            str(_motionbert_checkpoint_path()),
            "--input-json",
            str(input_path),
            "--output-json",
            str(output_path),
            "--video-path",
            str(video_path),
            "--device",
            os.environ.get("MOTIONBERT_DEVICE", "cuda"),
        ]

        try:
            result = subprocess.run(
                command,
                cwd=str(_motionbert_repo_dir()),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=MOTIONBERT_TIMEOUT_SEC,
                env=_motionbert_runtime_env(),
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"MotionBERT lift timeout ({MOTIONBERT_TIMEOUT_SEC}s)") from exc

        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip()
            raise RuntimeError(f"MotionBERT lift failed: {detail[-1200:]}")
        if not output_path.is_file():
            raise RuntimeError("MotionBERT lift failed: output JSON missing")

        with output_path.open("r", encoding="utf-8") as f:
            lifted = json.load(f)
    if not isinstance(lifted, dict) or lifted.get("ok") is False:
        raise RuntimeError(str(lifted.get("error") if isinstance(lifted, dict) else "MotionBERT output invalid"))
    lifted.setdefault("metadata", {})
    lifted["metadata"]["runtimeMs"] = round((time.time() - started_at) * 1000)
    return lifted


def _merge_motionbert_lifted_frames(sequence, lifted_frames):
    original_frames = sequence.get("frames", []) if isinstance(sequence, dict) else []
    if not original_frames or not isinstance(lifted_frames, list):
        return original_frames

    for index, frame in enumerate(original_frames):
        lifted = lifted_frames[min(index, len(lifted_frames) - 1)] if lifted_frames else {}
        lifted_landmarks = lifted.get("landmarks", {}) if isinstance(lifted, dict) else {}
        frame_landmarks = frame.get("landmarks", {}) if isinstance(frame, dict) else {}
        for name, lifted_point in lifted_landmarks.items():
            if not isinstance(lifted_point, dict):
                continue
            try:
                z = float(lifted_point.get("z"))
            except (TypeError, ValueError):
                continue
            if name in frame_landmarks and isinstance(frame_landmarks[name], dict):
                frame_landmarks[name]["z"] = round(z, 5)
    return original_frames


def _apply_motionbert_3d_lift(sequence, video_path, *, strict=False):
    try:
        lifted = _run_motionbert_3d_lift(sequence, video_path)
        lifted_frames = lifted.get("frames", [])
        _merge_motionbert_lifted_frames(sequence, lifted_frames)
        metadata = lifted.get("metadata", {})
        fallback_metadata = _motionbert_depth_metadata(sequence.get("frames", []))
        source = sequence.get("source", {}) if isinstance(sequence.get("source"), dict) else {}
        front_back_confidence = metadata.get("frontBackConfidence", fallback_metadata["frontBackConfidence"])
        sequence["poseMode"] = "3d_lifted"
        sequence["depthSource"] = "motionbert"
        sequence["landmarksVersion"] = "motionbert_3d_lift_v1"
        sequence["viewpoint"] = metadata.get("viewpoint", fallback_metadata["viewpoint"])
        sequence["frontBackConfidence"] = round(float(front_back_confidence), 3)
        sequence["depthConfidence"] = round(float(metadata.get("depthConfidence", front_back_confidence)), 3)
        sequence["leadFoot"] = metadata.get("leadFoot", fallback_metadata["leadFoot"])
        sequence["source"] = {
            **source,
            "depthSource": "motionbert",
            "liftAdapter": "MotionBert3DLiftSubprocess",
            "motionBert": {
                "ok": True,
                "adapter": "MotionBert3DLiftSubprocess",
                "runtimeMs": metadata.get("runtimeMs"),
                "checkpoint": _motionbert_checkpoint_path().name,
            },
        }
        return sequence
    except RuntimeError as exc:
        if strict:
            raise
        return _apply_motionbert_3d_lift_poc(sequence, unavailable_error=str(exc))


def _apply_motionbert_3d_lift_poc(sequence, unavailable_error=None):
    frames = sequence.get("frames", []) if isinstance(sequence, dict) else []
    metadata = _motionbert_depth_metadata(frames)
    source = sequence.get("source", {}) if isinstance(sequence.get("source"), dict) else {}
    motionbert_status = source.get("motionBert") if isinstance(source.get("motionBert"), dict) else None
    if unavailable_error:
        motionbert_status = {
            "ok": False,
            "fallback": "motionbert_poc",
            "error": unavailable_error,
        }
    sequence["poseMode"] = "3d_lifted"
    sequence["depthSource"] = "motionbert_poc"
    sequence["viewpoint"] = metadata["viewpoint"]
    sequence["frontBackConfidence"] = metadata["frontBackConfidence"]
    sequence["leadFoot"] = metadata["leadFoot"]
    sequence["source"] = {
        **source,
        "depthSource": "motionbert_poc",
        "liftAdapter": "MotionBert3DLiftPoc",
    }
    if motionbert_status:
        sequence["source"]["motionBert"] = motionbert_status
    return sequence


def _extract_video_skeleton_sequence(
    video_path,
    *,
    target_fps=VIDEO_SKELETON_DEFAULT_FPS,
    max_frames=VIDEO_SKELETON_MAX_FRAMES,
    start_ms=0,
    end_ms=None,
):
    try:
        import cv2
        import mediapipe as mp
    except ImportError as exc:
        raise RuntimeError("缺少姿態偵測套件，請先執行 pip install -r requirements.txt") from exc

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError("無法開啟本機影片檔")

    source_fps = capture.get(cv2.CAP_PROP_FPS) or 30
    source_fps = source_fps if source_fps > 0 else 30
    frame_step = max(1, round(source_fps / max(1, target_fps)))
    start_ms = max(0, float(start_ms or 0))
    end_ms = None if end_ms is None else float(end_ms)
    if end_ms is not None and end_ms <= start_ms:
        capture.release()
        raise ValueError("endMs 必須大於 startMs")
    start_frame_index = max(0, round((start_ms / 1000) * source_fps))
    if start_frame_index > 0:
        capture.set(cv2.CAP_PROP_POS_FRAMES, start_frame_index)

    frames = []
    detected_frame_count = 0
    frame_index = start_frame_index
    stem = video_path.stem

    # MediaPipe Pose 是目前最小可用路徑；未來可在同一個函式替換 YOLO/MoveNet。
    with mp.solutions.pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        enable_segmentation=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ) as pose:
        while len(frames) < max_frames:
            current_time_ms = (frame_index / source_fps) * 1000
            if end_ms is not None and current_time_ms > end_ms:
                break

            ok, frame = capture.read()
            if not ok:
                break
            if (frame_index - start_frame_index) % frame_step != 0:
                frame_index += 1
                continue

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = pose.process(rgb)
            if result.pose_landmarks:
                detected_frame_count += 1
                frames.append({
                    "timeMs": round(current_time_ms, 3),
                    "landmarks": _convert_mediapipe_landmarks_to_canonical(result.pose_landmarks),
                })
            frame_index += 1

    capture.release()

    if not frames:
        raise RuntimeError("影片中沒有偵測到可用人體骨架，請改用人物更清楚的片段")

    return {
        "ok": True,
        "sequence": {
            "id": f"{stem}_skeleton",
            "label": f"{stem} skeleton",
            "sourceType": "video",
            "fps": target_fps,
            "frames": frames,
            "source": {
                "type": "video",
                "url": f"capture/youtube/{video_path.name}",
                "extractor": "mediapipe_pose",
                "range": {
                    "startMs": round(start_ms, 3),
                    "endMs": None if end_ms is None else round(end_ms, 3),
                },
            },
        },
        "frameCount": len(frames),
        "detectedFrameCount": detected_frame_count,
        "sourceFps": round(source_fps, 3),
        "targetFps": target_fps,
    }


def _motion_profile_store_path():
    configured = os.environ.get("MOTION_PROFILE_STORE_PATH")
    return Path(configured) if configured else DEFAULT_MOTION_PROFILE_STORE_PATH


def _motion_mining_log_store_path():
    configured = os.environ.get("MOTION_MINING_LOG_STORE_PATH")
    return Path(configured) if configured else DEFAULT_MOTION_MINING_LOG_STORE_PATH


def _empty_motion_profile_document():
    return {
        "schemaVersion": 1,
        "updatedAt": "",
        "profiles": {},
    }


def _load_motion_profile_document():
    path = _motion_profile_store_path()
    if not path.exists():
        return _empty_motion_profile_document()
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        return _empty_motion_profile_document()
    profiles = data.get("profiles", {})
    if not isinstance(profiles, dict):
        profiles = {}
    return {
        "schemaVersion": 1,
        "updatedAt": str(data.get("updatedAt", "")),
        "profiles": profiles,
    }


def _write_motion_profile_document(document):
    path = _motion_profile_store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(document, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")
    tmp_path.replace(path)


def _load_motion_mining_entries():
    path = _motion_mining_log_store_path()
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if isinstance(data, dict) and isinstance(data.get("entries"), list):
        return [item for item in data["entries"] if isinstance(item, dict)]
    return []


def _write_motion_mining_entries(entries):
    path = _motion_mining_log_store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")
    tmp_path.replace(path)


def _list_vrma_samples():
    samples = []
    roots = [
        (VRMA_SAMPLE_DIR, False, "examples"),
        # 第三方 VRMA binary 不進 git；local_assets 是本機採礦還原區。
        (LOCAL_VRMA_SAMPLE_DIR, True, "local_assets"),
    ]

    for root_dir, force_external, source_root in roots:
        if not root_dir.exists():
            continue

        for path in sorted(root_dir.rglob("*.vrma")):
            try:
                relative_to_root = path.relative_to(root_dir)
                relative_to_base_dir = path.relative_to(BASE_DIR)
            except ValueError:
                continue

            samples.append({
                "name": path.name,
                "path": relative_to_root.as_posix(),
                "url": relative_to_base_dir.as_posix(),
                "external": force_external or "external" in relative_to_root.parts,
                "sourceRoot": source_root,
                "size": path.stat().st_size,
            })

    return sorted(samples, key=lambda item: (item["external"], item["name"].lower(), item["path"].lower()))


def _normalize_motion_profile(profile):
    if not isinstance(profile, dict):
        raise ValueError("profile 必須是物件")

    source = str(profile.get("source", "")).strip()
    if not source or source != os.path.basename(source) or not source.lower().endswith(".vrma"):
        raise ValueError("source 必須是單一 .vrma 檔名")

    category = str(profile.get("motionCategory", "")).strip()
    if category not in MOTION_PROFILE_CATEGORIES:
        raise ValueError("motionCategory 不在允許清單")

    try:
        score = int(profile.get("motionScore", 3))
    except (TypeError, ValueError):
        score = 3
    score = max(1, min(5, score))
    description = str(profile.get("description", profile.get("note", "")))[:2000]
    usage_description = str(profile.get("usageDescription", ""))[:4000]
    agent_usage = profile.get("agentUsage", [])
    if not isinstance(agent_usage, list):
        agent_usage = []
    agent_usage = [str(item).strip()[:500] for item in agent_usage if str(item).strip()]

    return {
        "source": source,
        "motionCategory": category,
        "motionScore": score,
        "description": description,
        "usageDescription": usage_description,
        "agentUsage": agent_usage,
        "note": description,
        "updatedAt": str(profile.get("updatedAt", ""))[:64] or _now_iso(),
    }


def _normalize_motion_mining_entry(entry):
    if not isinstance(entry, dict):
        raise ValueError("entry 必須是物件")

    source = str(entry.get("source", "")).strip()
    if not source or source != os.path.basename(source) or not source.lower().endswith(".vrma"):
        raise ValueError("source 必須是單一 .vrma 檔名")

    status = str(entry.get("status", "described")).strip() or "described"
    if status not in {"described", "classified"}:
        raise ValueError("status 必須是 described 或 classified")

    try:
        sample_time = round(float(entry.get("sampleTime", 0)), 3)
    except (TypeError, ValueError):
        sample_time = 0.0
    sample_time = max(0.0, sample_time)

    category = entry.get("category")
    if category is not None:
        category = str(category).strip()
        if category and category not in MOTION_PROFILE_CATEGORIES:
            raise ValueError("category 不在允許清單")
        category = category or None

    agent_usage = entry.get("agentUsage", [])
    if not isinstance(agent_usage, list):
        agent_usage = []
    agent_usage = [str(item).strip()[:500] for item in agent_usage if str(item).strip()]

    suggestion = entry.get("suggestion", {})
    if not isinstance(suggestion, dict):
        suggestion = {}

    return {
        "id": str(entry.get("id", "")).strip()[:80],
        "source": source,
        "sampleTime": sample_time,
        "status": status,
        "motionDescription": str(entry.get("motionDescription", ""))[:4000],
        "usageDescription": str(entry.get("usageDescription", ""))[:4000],
        "agentUsage": agent_usage,
        "category": category,
        "classificationSource": str(entry.get("classificationSource", "pending_llm"))[:80],
        "descriptionSource": str(entry.get("descriptionSource", "human"))[:80],
        "suggestion": suggestion,
        "createdAt": str(entry.get("createdAt", ""))[:64] or _now_iso(),
        "updatedAt": _now_iso(),
    }


def _next_mining_entry_id(entries, prefix):
    marker = f"{prefix}_"
    used = []
    for entry in entries:
        entry_id = str(entry.get("id", ""))
        if entry_id.startswith(marker):
            try:
                used.append(int(entry_id[len(marker):]))
            except ValueError:
                pass
    return f"{prefix}_{max(used, default=0) + 1:03d}"


def _upsert_motion_mining_entry(entries, entry):
    for index, existing in enumerate(entries):
        same_source_time = (
            existing.get("source") == entry["source"]
            and round(float(existing.get("sampleTime", 0)), 3) == entry["sampleTime"]
            and existing.get("status") == entry["status"]
        )
        same_id_and_source = (
            entry["id"]
            and existing.get("id") == entry["id"]
            and existing.get("source") == entry["source"]
        )
        if same_source_time or same_id_and_source:
            merged = {**existing, **entry}
            if same_source_time and existing.get("id"):
                merged["id"] = existing["id"]
            if not merged.get("id"):
                merged["id"] = _next_mining_entry_id(entries, entry["status"])
            entries[index] = merged
            return merged

    if not entry["id"] or any(item.get("id") == entry["id"] for item in entries):
        entry["id"] = _next_mining_entry_id(entries, entry["status"])
    entries.append(entry)
    return entry

@app.route('/')
def index():
    return app.send_static_file('index.html')


@app.route('/demo.php')
def serve_php():
    try:
        # Check if release demo.php exists, otherwise use the root one
        php_file = BASE_DIR / "dist" / "releases" / "v0.1.0" / "demo.php"
        if not php_file.is_file():
            php_file = BASE_DIR / "demo.php"
            cwd = BASE_DIR
        else:
            cwd = php_file.parent
        res = subprocess.run(
            ['php', str(php_file)],
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8'
        )
        if res.returncode == 0:
            return res.stdout
        else:
            return f"PHP Execution Error:<pre>{res.stderr}</pre>", 500
    except Exception as e:
        return f"Failed to run PHP: {str(e)}", 500


@app.route('/js/vendor/<path:filepath>')
def serve_vendor(filepath):
    filename = os.path.basename(filepath)
    vendor_path = BASE_DIR / "vendor" / filename
    if vendor_path.is_file():
        return send_from_directory(vendor_path.parent, vendor_path.name)
    return "File not found", 404


@app.route('/motions/<path:filepath>')
def serve_motions(filepath):
    filename = os.path.basename(filepath)

    local_direct = LOCAL_VRMA_SAMPLE_DIR / filename
    if local_direct.is_file():
        return send_from_directory(LOCAL_VRMA_SAMPLE_DIR, filename)

    examples_direct = VRMA_SAMPLE_DIR / filename
    if examples_direct.is_file():
        return send_from_directory(VRMA_SAMPLE_DIR, filename)

    if LOCAL_VRMA_SAMPLE_DIR.exists():
        for path in LOCAL_VRMA_SAMPLE_DIR.rglob(filename):
            if path.is_file():
                return send_from_directory(path.parent, path.name)

    if VRMA_SAMPLE_DIR.exists():
        for path in VRMA_SAMPLE_DIR.rglob(filename):
            if path.is_file():
                return send_from_directory(path.parent, path.name)

    full_static_path = Path(app.static_folder) / "motions" / filepath
    if full_static_path.is_file():
        return send_from_directory(full_static_path.parent, full_static_path.name)

    return "File not found", 404


@app.route('/capture/youtube/<path:filename>')
def serve_youtube_capture(filename):
    safe_name = os.path.basename(filename)
    if not safe_name or safe_name != filename:
        return "File not found", 404

    capture_dir = _youtube_capture_dir()
    video_path = capture_dir / safe_name
    try:
        resolved_path = video_path.resolve()
        if not _path_is_inside(resolved_path, capture_dir):
            return "File not found", 404
    except OSError:
        return "File not found", 404

    if video_path.is_file():
        return send_from_directory(video_path.parent, video_path.name)
    return "File not found", 404


@app.route('/api/capture/youtube', methods=['POST'])
def capture_youtube():
    data = request.get_json() or {}
    source_url = data.get("url")
    try:
        normalized_url = _normalize_youtube_url(source_url)
        download_result = _download_youtube_capture(normalized_url)
        source = _build_youtube_capture_source(normalized_url, download_result)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 503

    return jsonify({
        "ok": True,
        "source": source,
    })


@app.route('/api/capture/video/skeleton', methods=['POST'])
def capture_video_skeleton():
    data = request.get_json() or {}
    try:
        video_path = _resolve_local_video_url(data.get("videoUrl"))
        target_fps = _clamped_int(data.get("targetFps"), VIDEO_SKELETON_DEFAULT_FPS, 1, 15)
        max_frames = _clamped_int(data.get("maxFrames"), VIDEO_SKELETON_MAX_FRAMES, 8, 600)
        start_ms, end_ms = _normalize_video_capture_range(data)
        result = _extract_video_skeleton_sequence(
            video_path,
            target_fps=target_fps,
            max_frames=max_frames,
            start_ms=start_ms,
            end_ms=end_ms,
        )
        if data.get("enable3dLift") is True:
            result["sequence"] = _apply_motionbert_3d_lift(
                result["sequence"],
                video_path,
                strict=data.get("strict3dLift") is True,
            )
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except FileNotFoundError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 404
    except RuntimeError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 503

    return jsonify(result)


@app.route('/api/vrma-samples', methods=['GET'])
def vrma_samples():
    return jsonify({
        "ok": True,
        "base": "examples/m6_7_vrma_samples",
        "localBase": "local_assets/vrma",
        "samples": _list_vrma_samples(),
    })


@app.route('/api/motion-profiles', methods=['GET', 'POST'])
def motion_profiles():
    if request.method == 'GET':
        document = _load_motion_profile_document()
        return jsonify({
            "ok": True,
            "schemaVersion": document["schemaVersion"],
            "updatedAt": document["updatedAt"],
            "profiles": document["profiles"],
        })

    data = request.get_json() or {}
    try:
        profile = _normalize_motion_profile(data.get("profile"))
    except ValueError as exc:
        return jsonify({ "ok": False, "error": str(exc) }), 400

    document = _load_motion_profile_document()
    document["schemaVersion"] = 1
    document["updatedAt"] = _now_iso()
    document.setdefault("profiles", {})[profile["source"]] = profile
    _write_motion_profile_document(document)

    return jsonify({
        "ok": True,
        "profile": profile,
        "profiles": document["profiles"],
        "path": "examples/m6_7_vrma_samples/review/motion_profiles.json",
    })


@app.route('/api/motion-mining-log', methods=['GET', 'POST'])
def motion_mining_log():
    if request.method == 'GET':
        entries = _load_motion_mining_entries()
        return jsonify({
            "ok": True,
            "entries": entries,
            "path": "examples/m6_7_vrma_samples/review/mining_log.json",
        })

    data = request.get_json() or {}
    try:
        entry = _normalize_motion_mining_entry(data.get("entry"))
    except ValueError as exc:
        return jsonify({ "ok": False, "error": str(exc) }), 400

    entries = _load_motion_mining_entries()
    saved_entry = _upsert_motion_mining_entry(entries, entry)
    _write_motion_mining_entries(entries)

    return jsonify({
        "ok": True,
        "entry": saved_entry,
        "entries": entries,
        "path": "examples/m6_7_vrma_samples/review/mining_log.json",
    })


def _scan_pose_library():
    manifest_path = BASE_DIR / "motions" / "poses" / "pose_library_manifest.json"
    poses_dir = BASE_DIR / "motions" / "poses"

    poses = {}
    if poses_dir.exists():
        for path in sorted(poses_dir.rglob("*.json")):
            if path == manifest_path:
                continue
            # Only include files inside a sub-category folder
            try:
                rel = path.relative_to(poses_dir)
            except ValueError:
                continue
            if len(rel.parts) < 2:
                continue

            try:
                with open(path, 'r', encoding='utf-8') as f:
                    entry = json.load(f)
            except Exception:
                continue

            if isinstance(entry, dict) and "id" in entry and "category" in entry and "label" in entry:
                rel_path = path.relative_to(BASE_DIR).as_posix()
                poses[entry["id"]] = {
                    "id": entry["id"],
                    "category": entry["category"],
                    "label": entry["label"],
                    "model": entry.get("model", "AliciaSolid"),
                    "path": rel_path,
                    "humanization": entry.get("humanization", {"profile": "alicia", "level": 2}),
                    "qa": entry.get("qa", {"balance": 5, "silhouette": 5, "noTpose": True, "noArmCrossBody": True})
                }

    manifest = {
        "schemaVersion": 1,
        "poses": poses
    }

    poses_dir.mkdir(parents=True, exist_ok=True)
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    return manifest


@app.route('/api/pose-library', methods=['GET'])
def get_pose_library():
    manifest_path = BASE_DIR / "motions" / "poses" / "pose_library_manifest.json"
    if not manifest_path.exists():
        manifest = _scan_pose_library()
    else:
        try:
            with open(manifest_path, 'r', encoding='utf-8') as f:
                manifest = json.load(f)
        except Exception:
            manifest = _scan_pose_library()

    return jsonify({
        "ok": True,
        "manifest": manifest,
        "path": "motions/poses/pose_library_manifest.json"
    })


@app.route('/api/pose-library', methods=['POST'])
def post_pose_library():
    import re
    data = request.get_json() or {}
    pose = data.get("pose")
    if not isinstance(pose, dict):
        return jsonify({"ok": False, "error": "pose 必須是物件"}), 400

    pose_id = pose.get("id")
    category = pose.get("category")
    label = pose.get("label")

    if not pose_id or not category or not label:
        return jsonify({"ok": False, "error": "id, category 與 label 為必填欄位"}), 400

    allowed_categories = {"standing", "walking", "crouching", "stretch", "touch_face", "breathing"}
    if category not in allowed_categories:
        return jsonify({"ok": False, "error": f"不支援的分類: {category}"}), 400

    if not re.match(r"^[a-zA-Z0-9_-]+$", pose_id):
        return jsonify({"ok": False, "error": "id 必須是英數字、底線或連字號"}), 400

    poses_dir = BASE_DIR / "motions" / "poses"
    target_dir = poses_dir / category
    target_path = target_dir / f"{pose_id}.json"

    try:
        # resolve target_path against poses_dir to reject traversal
        resolved_poses_dir = poses_dir.resolve()
        resolved_target_path = target_path.resolve()
        if not resolved_target_path.as_posix().startswith(resolved_poses_dir.as_posix()):
            raise ValueError()
    except Exception:
        return jsonify({"ok": False, "error": "不合法的路徑"}), 400

    pose.setdefault("schemaVersion", 1)
    pose.setdefault("model", "AliciaSolid")
    pose.setdefault("humanization", {"profile": "alicia", "level": 2})
    pose.setdefault("qa", {"balance": 5, "silhouette": 5, "noTpose": True, "noArmCrossBody": True})
    pose.setdefault("runtimeQa", {
        "transitionScore": 0,
        "idleCompatibility": True,
        "clipCompatibility": True,
        "vrmaCompatibility": True
    })
    pose.setdefault("source", {"type": "manual", "tool": "pose_training_lab"})

    target_dir.mkdir(parents=True, exist_ok=True)
    with open(target_path, 'w', encoding='utf-8') as f:
        json.dump(pose, f, ensure_ascii=False, indent=2)

    manifest = _scan_pose_library()

    return jsonify({
        "ok": True,
        "pose": pose,
        "manifest": manifest
    })


@app.route('/api/llm', methods=['POST'])
def llm_proxy():
    # 接收並清理前端輸入，限制 1000 字元
    data = request.get_json() or {}
    message = str(data.get("message", "")).strip()[:1000]

    # 保護點 2：空字串回傳 error schema
    if not message:
        return jsonify({
            "intent": "error",
            "text": "請先輸入訊息。",
            "emotion": "sorrow",
            "motion": "shake_head"
        })

    # 優先解析 Context Digest (Phase 12.5)
    context_digest = data.get("contextDigest", {})
    if context_digest:
        selected_feature = context_digest.get("selectedFeature", "none")
        active_element = context_digest.get("activeElement", "none")
        active_panel = context_digest.get("activePanel", "none")
        last_intent = context_digest.get("lastIntent", "none")
        center = context_digest.get("mapCenter", [120.6, 24.1])
        validation_errors = context_digest.get("validationErrors", [])

        # 將 validationErrors 對應回相容格式
        address_invalid = any(k in validation_errors for k in ["reportAddress", "address"])
        email_invalid = any(k in validation_errors for k in ["reportEmail", "email"])
        validation_state = {
            "reportAddress": { "valid": not address_invalid },
            "reportEmail": { "valid": not email_invalid }
        }
        form_state = {
            "reportEmail": "",
            "reportAddress": ""
        }

        # 模擬上一筆執行工具歷史
        last_tool_result = None
        if last_intent in ["download_report", "query_pipe", "query_cctv"]:
            last_tool_result = {
                "tool": last_intent,
                "result": {
                    "data": {
                        "depth": 1.8,
                        "status": "online"
                    }
                }
            }
    else:
        # 向下相容傳統格式 (Phase 9A, 10A, 11)
        memory = data.get("memory", [])
        last_tool_result = None
        for item in memory:
            if item.get("type") == "tool_result":
                last_tool_result = item
                break
        spatial_context = data.get("spatialContext", {})
        selected_feature = spatial_context.get("selectedFeature", "none")
        center = spatial_context.get("mapCenter", [120.6, 24.1])
        dom_context = data.get("domContext", {}) or {}
        validation_state = dom_context.get("validationState", {}) or {}
        form_state = dom_context.get("formState", {}) or {}

    # 坐標格式安全校驗與轉換
    if not isinstance(center, list) or len(center) != 2:
        center = [120.6, 24.1]
    try:
        lng = float(center[0])
        lat = float(center[1])
    except (ValueError, TypeError):
        lng, lat = 120.6, 24.1

    # 空間至百分比對應 (供 Mock GIS Panel 使用)
    if abs(lng - 120.65) < 0.01 and abs(lat - 24.15) < 0.01:
        x, y = 65, 45
    elif abs(lng - 120.63) < 0.01 and abs(lat - 24.16) < 0.01:
        x, y = 30, 60
    else:
        x, y = 50, 50

    # A. 表單輔助 (為什麼不能送出？)
    message_lower = message.lower()
    if any(k in message_lower for k in ["不能送出", "無法送出", "校驗失敗", "欄位校驗"]):
        address_state = validation_state.get("reportAddress", {})
        email_state = validation_state.get("reportEmail", {})

        email_val = form_state.get("reportEmail", "")
        address_val = form_state.get("reportAddress", "")

        if address_state and not address_state.get("valid", True):
            return jsonify({
                "intent": "warning",
                "text": "維護地址欄位是必填的喔，請先在地址欄位輸入地址。",
                "emotion": "angry",
                "motion": "warning"
            })
        elif email_state and not email_state.get("valid", True):
            if not email_val:
                return jsonify({
                    "intent": "warning",
                    "text": "聯絡信箱欄位是必填的喔，請輸入電子信箱。",
                    "emotion": "angry",
                    "motion": "warning"
                })
            else:
                return jsonify({
                    "intent": "warning",
                    "text": f"聯絡信箱格式不對，您填的是 '{email_val}'，請補上完整網域（例如 abc@example.com）。",
                    "emotion": "angry",
                    "motion": "warning"
                })
        else:
            return jsonify({
                "intent": "success",
                "text": "目前回報單的欄位看起來都是正確填寫的喔！如果有遇到其他問題，請告訴我。",
                "emotion": "joy",
                "motion": "wave"
            })

    # B. 下載報告與 UI 指引
    if "下載" in message_lower:
        if selected_feature != "none":
            return jsonify({
                "intent": "download_report",
                "confidence": 0.98,
                "text": "好的，我立刻為您下載當前選取物件的維護報告...",
                "tool": "download_report",
                "args": { "featureId": selected_feature },
                "afterText": "我已經幫您下載完成囉～"
            })
        else:
            return jsonify({
                "intent": "warning",
                "text": "目前沒有選取地圖物件，請先在左側點選要下載的管線或監視器。",
                "emotion": "sorrow",
                "motion": "warning"
            })
    elif any(k in message_lower for k in ["成果在哪", "下載按鈕"]):
        return jsonify({
            "intent": "success",
            "text": "在網頁的右上方有一個「📥 下載報表」按鈕，我已經在畫面頂部幫您標示出來囉！",
            "emotion": "joy",
            "motion": "wave"
        })

    # C. 地圖 + DOM 混合推理 (這個可以匯出嗎？)
    if any(k in message_lower for k in ["匯出", "可以匯出嗎"]):
        if selected_feature == "PIPE-008":
            return jsonify({
                "intent": "success",
                "text": "可以，目前選取的是管線物件 PIPE-008（sewer 圖層），右側的「資料匯出面板」已就緒，您可以直接點選「匯出物件」按鈕進行匯出。",
                "emotion": "joy",
                "motion": "wave"
            })
        elif selected_feature == "CCTV-042":
            return jsonify({
                "intent": "success",
                "text": "可以，目前選取的是監視器設備 CCTV-042（monitoring 圖層），右側的「資料匯出面板」已就緒，您可以點選「匯出物件」按鈕以 CSV 或 GeoJSON 匯出。",
                "emotion": "joy",
                "motion": "wave"
            })
        else:
            return jsonify({
                "intent": "warning",
                "text": "目前沒有選取地圖上的任何物件喔。請先點選地圖上的管線或監視器，然後使用右側的「資料匯出面板」進行匯出。",
                "emotion": "sorrow",
                "motion": "warning"
            })

    # 1. 空間臨近查詢優先
    message_lower = message.lower()
    if any(k in message_lower for k in ["附近", "這附近", "這區"]):
        if any(k in message_lower for k in ["管線", "pipe"]):
            return jsonify({
                "intent": "searching",
                "text": f"好的，我以目前地圖中心坐標 [{lng}, {lat}] 為您搜尋附近的管線...",
                "emotion": "fun",
                "motion": "presenting",
                "tool": "query_pipe",
                "args": { "x": x, "y": y },
                "afterText": "已經搜尋中心座標附近的管線，{summary}"
            })
        if any(k in message_lower for k in ["監視器", "cctv", "camera"]):
            return jsonify({
                "intent": "searching",
                "text": f"好的，我以目前地圖中心坐標 [{lng}, {lat}] 讀取附近的監視器影像...",
                "emotion": "fun",
                "motion": "presenting",
                "tool": "query_cctv",
                "args": { "x": x, "y": y },
                "afterText": "已經載入中心座標附近的監視器，{summary}"
            })

    # 2. 處理與對話歷史或空間選取物件相關的代名詞詢問
    # a. 詢問管線深度
    if any(k in message_lower for k in ["多深", "深度", "它有多深"]):
        # 優先從歷史對話解析
        if last_tool_result and last_tool_result.get("tool") == "query_pipe":
            depth = last_tool_result.get("result", {}).get("data", {}).get("depth", 1.8)
            return jsonify({
                "intent": "success",
                "text": f"這條管線的深度為 {depth} 公尺。",
                "emotion": "joy",
                "motion": "wave"
            })
        # 空間選取物件 Fallback
        elif selected_feature == "PIPE-008":
            return jsonify({
                "intent": "success",
                "text": "根據地圖目前的選取項目，管線 PIPE-008 的深度為 1.8 公尺。",
                "emotion": "joy",
                "motion": "wave"
            })

    # b. 詢問監視器狀態
    if any(k in message_lower for k in ["狀態", "影像狀態", "連線狀態"]):
        # 優先從歷史對話解析
        if last_tool_result and last_tool_result.get("tool") == "query_cctv":
            status = last_tool_result.get("result", {}).get("data", {}).get("status", "online")
            return jsonify({
                "intent": "success",
                "text": f"這台監視器的連線狀態是 {status}。",
                "emotion": "joy",
                "motion": "wave"
            })
        # 空間選取物件 Fallback
        elif selected_feature == "CCTV-042":
            return jsonify({
                "intent": "success",
                "text": "目前地圖選取的監視器 CCTV-042 連線狀態為 online。",
                "emotion": "joy",
                "motion": "wave"
            })

    # 判斷是否觸發 GIS 管線查詢 (Phase 6 & 7)
    if any(keyword in message.lower() for keyword in ["管線", "查詢", "地圖", "gis", "search", "query"]):
        return jsonify({
            "intent": "searching",
            "text": "我幫您查詢附近管線...",
            "emotion": "fun",
            "motion": "presenting",
            "tool": "query_pipe",
            "args": {
                "x": 65,
                "y": 45
            },
            "afterText": "地圖查詢完成，{summary}"
        })

    # 判斷是否觸發 CCTV 監視器查詢 (Phase 7)
    if any(keyword in message.lower() for keyword in ["監視器", "監控", "cctv", "camera"]):
        return jsonify({
            "intent": "searching",
            "text": "正在讀取附近監視器即時影像...",
            "emotion": "fun",
            "motion": "presenting",
            "tool": "query_cctv",
            "args": {
                "x": 30,
                "y": 60
            },
            "afterText": "監視器連線成功"
        })

    # 最小版：回傳固定 JSON schema
    response_data = {
        "intent": "success",
        "text": "羽山哥，LLM Connector 已成功接上！",
        "emotion": "joy",
        "motion": "wave"
    }
    return jsonify(response_data)


@app.route('/alicia-runtime.js')
def serve_runtime():
    release_path = BASE_DIR / "dist" / "releases" / "v0.1.0" / "alicia-runtime.js"
    if release_path.is_file():
        return send_from_directory(release_path.parent, release_path.name)
    return "File not found", 404


@app.route('/manifests/<path:filepath>')
def serve_manifests(filepath):
    release_path = BASE_DIR / "dist" / "releases" / "v0.1.0" / "manifests" / filepath
    if release_path.is_file():
        return send_from_directory(release_path.parent, release_path.name)
    return "File not found", 404


if __name__ == '__main__':
    # 保護點 1：限制本機 127.0.0.1，關閉對外綁定
    app.run(host='127.0.0.1', port=8765, debug=True)
