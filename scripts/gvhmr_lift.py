import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

PROVIDER_VERSION = "experimental_gvhmr_phase2a"

SMPL_TO_ALICIA_LANDMARKS = {
    "hips": 0,
    "chest": 9,
    "neck": 12,
    "head": 15,
    "leftShoulder": 16,
    "rightShoulder": 17,
    "leftElbow": 18,
    "rightElbow": 19,
    "leftWrist": 20,
    "rightWrist": 21,
    "leftKnee": 4,
    "rightKnee": 5,
    "leftAnkle": 7,
    "rightAnkle": 8,
    "leftFoot": 10,
    "rightFoot": 11,
}


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def load_fixture(path, source, static_camera=False):
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    payload["source"] = source
    payload.setdefault("metadata", {})
    payload["metadata"]["staticCamera"] = bool(static_camera)
    return payload


def base_metadata(args):
    gvhmr_root = Path(args.gvhmr_root).resolve() if args.gvhmr_root else None
    metadata = {
        "videoPath": args.video_path,
        "staticCamera": bool(args.static_camera),
        "providerVersion": PROVIDER_VERSION,
    }
    if gvhmr_root:
        metadata["gvhmrRoot"] = str(gvhmr_root)
    return metadata


def failure(reason, args, extra_metadata=None):
    metadata = base_metadata(args)
    if extra_metadata:
        metadata.update(extra_metadata)
    return {
        "ok": False,
        "source": "gvhmr",
        "reason": reason,
        "frames": [],
        "metadata": metadata,
    }


def resolve_demo_script(gvhmr_root):
    if not gvhmr_root:
        return None
    return Path(gvhmr_root).resolve() / "tools" / "demo" / "demo.py"


def build_demo_command(python_exe, demo_script, video_path, static_camera=False):
    command = [python_exe, str(demo_script), f"--video={video_path}"]
    if static_camera:
        command.append("-s")
    return command


def tensor_to_list(value):
    if hasattr(value, "detach"):
        value = value.detach().cpu()
    if hasattr(value, "tolist"):
        return value.tolist()
    return value


def safe_float(value, default=0.0):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


def yaw_from_axis_angle(axis_angle):
    x, y, z = [safe_float(item) for item in axis_angle[:3]]
    theta = math.sqrt((x * x) + (y * y) + (z * z))
    if theta < 1e-8:
        return 0.0
    ax, ay, az = x / theta, y / theta, z / theta
    c = math.cos(theta)
    s = math.sin(theta)
    one_c = 1.0 - c
    r00 = c + ax * ax * one_c
    r20 = az * ax * one_c - ay * s
    return math.degrees(math.atan2(-r20, r00))


def static_confidence(pred, index):
    logits = pred.get("net_outputs", {}).get("static_conf_logits")
    if logits is None:
        return 0.75
    values = tensor_to_list(logits)
    if not values or not values[0] or index >= len(values[0]):
        return 0.75
    row = [safe_float(item) for item in values[0][index]]
    if not row:
        return 0.75
    max_logit = max(row)
    exps = [math.exp(max(-60.0, min(60.0, item - max_logit))) for item in row]
    total = sum(exps)
    return max(exps) / total if total > 0 else 0.75


def round_point(point):
    return {
        "x": round(safe_float(point[0] if len(point) > 0 else 0.0), 6),
        "y": round(safe_float(point[1] if len(point) > 1 else 0.0), 6),
        "z": round(safe_float(point[2] if len(point) > 2 else 0.0), 6),
    }


def distance(a, b):
    return math.sqrt(sum((safe_float(a[i]) - safe_float(b[i])) ** 2 for i in range(3)))


def toe_from_vertices(ankle, foot, vertices):
    direction = [safe_float(foot[i]) - safe_float(ankle[i]) for i in range(3)]
    length = math.sqrt(sum(item * item for item in direction))
    if length <= 1e-8:
        return None
    direction = [item / length for item in direction]
    radius = max(length * 1.6, 0.12)
    best_vertex = None
    best_projection = None
    for vertex in vertices or []:
        if distance(vertex, foot) > radius:
            continue
        projection = sum((safe_float(vertex[i]) - safe_float(ankle[i])) * direction[i] for i in range(3))
        if best_projection is None or projection > best_projection:
            best_projection = projection
            best_vertex = vertex
    return best_vertex


def add_toe_landmarks(landmarks, frame_joints, frame_verts):
    if not frame_verts:
        return
    for side, ankle_index, foot_index in (("left", 7, 10), ("right", 8, 11)):
        if max(ankle_index, foot_index) >= len(frame_joints):
            continue
        toe = toe_from_vertices(frame_joints[ankle_index], frame_joints[foot_index], frame_verts)
        if toe is not None:
            # ponytail: SMPL has no toe joint; nearest forward foot mesh vertex is enough for VRM toe aiming.
            landmarks[f"{side}Toe"] = round_point(toe)


def smpl_joints_to_landmark_frames(joints, verts=None):
    values = tensor_to_list(joints)
    vert_values = tensor_to_list(verts) if verts is not None else []
    frames = []
    for frame_index, frame_joints in enumerate(values or []):
        landmarks = {}
        for name, index in SMPL_TO_ALICIA_LANDMARKS.items():
            if index < len(frame_joints):
                landmarks[name] = round_point(frame_joints[index])
        add_toe_landmarks(landmarks, frame_joints, vert_values[frame_index] if frame_index < len(vert_values) else None)
        if landmarks:
            frames.append(landmarks)
    return frames


def extract_smpl_landmark_frames(pred, gvhmr_root=None):
    for key in ("smpl_joints_global", "joints_global", "joints_glob"):
        if key in pred:
            frames = smpl_joints_to_landmark_frames(pred[key])
            if frames:
                return frames

    if not gvhmr_root:
        return []

    root = Path(gvhmr_root).resolve()
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))

    import torch
    from einops import einsum
    from hmr4d.utils.geo_transform import apply_T_on_points, compute_T_ayfz2ay
    from hmr4d.utils.smplx_utils import make_smplx

    smpl_global = pred.get("smpl_params_global") or {}
    if not smpl_global:
        return []

    device = torch.device("cpu")
    params = {
        key: value.detach().to(device) if hasattr(value, "detach") else torch.as_tensor(value, device=device)
        for key, value in smpl_global.items()
    }
    smplx = make_smplx("supermotion").to(device)
    smplx2smpl = torch.load(root / "hmr4d" / "utils" / "body_model" / "smplx2smpl_sparse.pt", map_location=device)
    j_regressor = torch.load(root / "hmr4d" / "utils" / "body_model" / "smpl_neutral_J_regressor.pt", map_location=device)

    with torch.no_grad():
        smplx_out = smplx(**params)
        pred_ay_verts = torch.stack([torch.matmul(smplx2smpl, vertices) for vertices in smplx_out.vertices])
        verts = pred_ay_verts.clone()
        offset = einsum(j_regressor, verts[0], "j v, v i -> j i")[0]
        offset[1] = verts[:, :, [1]].min()
        verts = verts - offset
        transform = compute_T_ayfz2ay(einsum(j_regressor, verts[[0]], "j v, l v i -> l j i"), inverse=True)
        verts = apply_T_on_points(verts, transform)
        joints = einsum(j_regressor, verts, "j v, l v i -> l j i")

    return smpl_joints_to_landmark_frames(joints, verts)


def parse_hmr4d_results(result_path, fps=30, static_camera=False, gvhmr_root=None):
    import torch

    pred = torch.load(result_path, map_location="cpu")
    smpl_global = pred.get("smpl_params_global") or {}
    transl = tensor_to_list(smpl_global.get("transl"))
    global_orient = tensor_to_list(smpl_global.get("global_orient"))
    if not transl or not global_orient:
        return {
            "ok": False,
            "source": "gvhmr",
            "reason": "missing_hmr4d_global_params",
            "frames": [],
            "metadata": {"resultPath": str(result_path)},
        }

    frame_count = min(len(transl), len(global_orient))
    landmark_frames = []
    landmark_error = ""
    try:
        landmark_frames = extract_smpl_landmark_frames(pred, gvhmr_root=gvhmr_root)
    except Exception as exc:
        landmark_error = str(exc)
    frames = []
    for index in range(frame_count):
        position = transl[index] if isinstance(transl[index], list) else [0, 0, 0]
        orientation = global_orient[index] if isinstance(global_orient[index], list) else [0, 0, 0]
        frame = {
            "t": round(index / fps, 6),
            "frameIndex": index,
            "bodyYawDegrees": round(yaw_from_axis_angle(orientation), 4),
            "rootTranslation": {
                "x": round(safe_float(position[0] if len(position) > 0 else 0.0), 6),
                "y": round(safe_float(position[1] if len(position) > 1 else 0.0), 6),
                "z": round(safe_float(position[2] if len(position) > 2 else 0.0), 6),
            },
            "footContact": {"left": False, "right": False},
            "confidence": round(max(0.0, min(1.0, static_confidence(pred, index))), 4),
        }
        if index < len(landmark_frames):
            frame["landmarks"] = landmark_frames[index]
        frames.append(frame)

    metadata = {
        "parser": "hmr4d_results_minimal",
        "providerVersion": PROVIDER_VERSION,
        "resultPath": str(result_path),
        "fps": fps,
        "staticCamera": bool(static_camera),
    }
    if landmark_frames:
        metadata["jointSource"] = "smpl_joints"
        metadata["jointFrameCount"] = min(frame_count, len(landmark_frames))
    if landmark_error:
        metadata["jointError"] = landmark_error

    return {
        "ok": True,
        "source": "gvhmr",
        "frames": frames,
        "metadata": metadata,
    }


def hmr4d_result_path(gvhmr_root, video_path):
    return Path(gvhmr_root) / "outputs" / "demo" / Path(video_path).stem / "hmr4d_results.pt"


def provider_output_for_args(args):
    if args.fixture_json:
        return load_fixture(args.fixture_json, "gvhmr", args.static_camera)

    demo_script = resolve_demo_script(args.gvhmr_root)
    if demo_script is None:
        return failure("missing_dependency", args, {"missing": "gvhmr_root"})
    if not demo_script.exists():
        return failure("missing_dependency", args, {"missingPath": str(demo_script)})
    if not args.video_path:
        return failure("missing_video", args)

    video_path = Path(args.video_path)
    if not video_path.exists():
        return failure("missing_video", args, {"missingPath": str(video_path)})

    command = build_demo_command(args.python_exe, demo_script, str(video_path), args.static_camera)
    gvhmr_root = Path(args.gvhmr_root).resolve()
    command_metadata = {"command": command, "cwd": str(gvhmr_root)}
    if args.dry_run:
        return failure("dry_run", args, command_metadata)

    cached_result = hmr4d_result_path(gvhmr_root, video_path)
    if cached_result.exists():
        parsed = parse_hmr4d_results(cached_result, static_camera=args.static_camera, gvhmr_root=gvhmr_root)
        parsed.setdefault("metadata", {}).update(command_metadata)
        parsed["metadata"]["usedCachedResult"] = True
        return parsed

    result = subprocess.run(
        command,
        cwd=str(gvhmr_root),
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    command_metadata.update({
        "returnCode": result.returncode,
        "stdoutTail": result.stdout[-4000:],
        "stderrTail": result.stderr[-4000:],
    })
    if result.returncode != 0:
        return failure("provider_failed", args, command_metadata)
    result_path = hmr4d_result_path(gvhmr_root, video_path)
    if not result_path.exists():
        return failure("missing_hmr4d_results", args, command_metadata)
    parsed = parse_hmr4d_results(result_path, static_camera=args.static_camera, gvhmr_root=gvhmr_root)
    parsed.setdefault("metadata", {}).update(command_metadata)
    parsed["metadata"]["usedCachedResult"] = False
    return parsed


def main():
    parser = argparse.ArgumentParser(description="Experimental GVHMR world-motion provider adapter.")
    parser.add_argument("--video-path", default="")
    parser.add_argument("--fixture-json", default="")
    parser.add_argument("--gvhmr-root", default="")
    parser.add_argument("--python-exe", default="python")
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--static-camera", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    output = provider_output_for_args(args)
    write_json(Path(args.output_json), output)


if __name__ == "__main__":
    main()
