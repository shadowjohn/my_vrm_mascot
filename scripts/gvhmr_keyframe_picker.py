#!/usr/bin/env python3
"""Pick useful GVHMR calibration keyframes from hmr4d_results.pt."""

import argparse
import json
import math
from pathlib import Path


PT_NAME = "hmr4d_results.pt"
LANDMARK_NAME = "alicia_intermediate_landmarks.json"
OUTPUT_NAME = "keyframes_report.json"


def resolve_input(path):
    path = Path(path)
    if path.is_dir():
        path = path / PT_NAME
    if not path.is_file():
        raise FileNotFoundError(f"GVHMR pt not found: {path}")
    return path


def load_global_params(path):
    try:
        import torch
    except ImportError as exc:
        raise RuntimeError("torch is required to read hmr4d_results.pt") from exc

    data = torch.load(path, map_location="cpu")
    params = data.get("smpl_params_global") if isinstance(data, dict) else None
    if not isinstance(params, dict):
        raise ValueError("smpl_params_global missing")
    required = ("body_pose", "global_orient", "transl")
    missing = [name for name in required if name not in params]
    if missing:
        raise ValueError(f"missing keys: {', '.join(missing)}")
    return {name: params[name].detach().float().cpu() for name in required}


def flatten(tensor):
    return tensor.reshape(tensor.shape[0], -1)


def row_norms(tensor):
    rows = flatten(tensor)
    return [math.sqrt(sum(float(v) ** 2 for v in row)) for row in rows.tolist()]


def deltas(tensor):
    if tensor.shape[0] < 2:
        return []
    return row_norms(tensor[1:] - tensor[:-1])


def joint_blocks(body_pose, joint_indexes):
    flat = flatten(body_pose)
    if not joint_indexes:
        return flat
    joint_size = max(1, flat.shape[1] // 23)
    cols = []
    for joint in joint_indexes:
        start = joint * joint_size
        end = min(flat.shape[1], start + joint_size)
        if start < flat.shape[1]:
            cols.extend(range(start, end))
    return flat[:, cols] if cols else flat


def best_delta_frame(values):
    if not values:
        return None, 0.0
    index, value = max(enumerate(values), key=lambda item: item[1])
    return index + 1, float(value)


def add_frame(items, frame, reason, score, fps):
    if frame is None:
        return
    items.append({
        "frame": int(frame),
        "timeMs": round(int(frame) * 1000.0 / fps),
        "reason": reason,
        "score": round(float(score), 6),
    })


def num(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def landmark_time_ms(frame, index, fps):
    if "timeMs" in frame:
        return round(num(frame.get("timeMs")))
    if "t" in frame:
        return round(num(frame.get("t")) * 1000)
    return round(index * 1000.0 / fps)


def landmark_y(frame, name):
    point = (frame.get("landmarks") or {}).get(name) or {}
    return num(point.get("y"))


def load_sibling_landmarks(source):
    path = Path(source).with_name(LANDMARK_NAME)
    if not path.is_file():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    frames = data.get("frames")
    return frames if isinstance(frames, list) else []


def add_foot_contact_frames(items, landmark_frames, fps):
    if not landmark_frames:
        return False
    foot_names = ("leftFoot", "leftToe", "rightFoot", "rightToe")
    ground_y = min(landmark_y(frame, name) for frame in landmark_frames for name in foot_names)
    for side in ("left", "right"):
        other = "right" if side == "left" else "left"
        best = None
        for index, frame in enumerate(landmark_frames):
            contact = frame.get("footContact") or {}
            foot_y = min(landmark_y(frame, f"{side}Foot"), landmark_y(frame, f"{side}Toe"))
            other_y = min(landmark_y(frame, f"{other}Foot"), landmark_y(frame, f"{other}Toe"))
            # ponytail: real SMPL contact can wait; this picks the planted foot while the other foot is lifted.
            is_contact = bool(contact.get(side)) or foot_y <= ground_y + 0.06
            if is_contact:
                score = other_y - foot_y
                if best is None or score > best[1]:
                    best = (index, score)
        if best:
            index, score = best
            items.append({
                "frame": int(landmark_frames[index].get("frameIndex", index)),
                "timeMs": landmark_time_ms(landmark_frames[index], index, fps),
                "reason": f"{side}_foot_contact",
                "score": round(float(score), 6),
            })
    return True


def pick_keyframes(params, source, fps=30.0, max_frames=8):
    body_pose = params["body_pose"]
    global_orient = params["global_orient"]
    transl = params["transl"]
    frame_count = int(body_pose.shape[0])
    if frame_count <= 0:
        raise ValueError("empty body_pose")

    root_delta = deltas(transl)
    body_delta = deltas(body_pose)
    turn_delta = deltas(global_orient)
    leg_delta = deltas(joint_blocks(body_pose, [0, 1, 3, 4, 6, 7, 9, 10]))
    arm_delta = deltas(joint_blocks(body_pose, [12, 13, 15, 16, 17, 18, 19, 20, 21, 22]))

    picked = []
    add_frame(picked, 0, "start_pose", 0, fps)
    if frame_count > 1:
        add_frame(picked, frame_count - 1, "end_pose", 0, fps)
    for reason, values in (
        ("max_root_travel_delta", root_delta),
        ("max_body_pose_delta", body_delta),
        ("max_turn", turn_delta),
        ("max_leg_motion", leg_delta),
        ("max_arm_motion", arm_delta),
    ):
        frame, score = best_delta_frame(values)
        add_frame(picked, frame, reason, score, fps)
    has_landmark_contact = add_foot_contact_frames(picked, load_sibling_landmarks(source), fps)

    merged = {}
    for item in picked:
        existing = merged.setdefault(item["frame"], {**item, "reasons": []})
        existing["score"] = max(existing["score"], item["score"])
        existing["reasons"].append(item["reason"])
        existing["reason"] = ",".join(existing["reasons"])

    recommended = sorted(merged.values(), key=lambda item: (item["frame"], -item["score"]))[:max_frames]
    for item in recommended:
        item.pop("reasons", None)

    root_travel = sum(root_delta)
    return {
        "kind": "gvhmr_keyframe_picker_v1",
        "source": str(source).replace("\\", "/"),
        "frameCount": frame_count,
        "durationMs": round((frame_count - 1) * 1000.0 / fps) if frame_count > 1 else 0,
        "recommendedFrames": recommended,
        "metrics": {
            "rootTravelDeltaSum": round(root_travel, 6),
            "maxRootDelta": round(max(root_delta, default=0.0), 6),
            "maxPoseDelta": round(max(body_delta, default=0.0), 6),
            "maxTurnDelta": round(max(turn_delta, default=0.0), 6),
            "maxLegDelta": round(max(leg_delta, default=0.0), 6),
            "maxArmDelta": round(max(arm_delta, default=0.0), 6),
            "hasLandmarkFootContact": has_landmark_contact,
        },
        "warnings": [] if has_landmark_contact else ["ponytail: no landmark foot contact; add SMPL joints later if needed"],
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="Pick useful calibration keyframes from GVHMR hmr4d_results.pt.")
    parser.add_argument("input", help="Folder containing hmr4d_results.pt, or the pt file itself.")
    parser.add_argument("--out", help="Output path. Defaults to keyframes_report.json next to the pt.")
    parser.add_argument("--fps", type=float, default=30.0)
    args = parser.parse_args(argv)

    input_path = resolve_input(args.input)
    result = pick_keyframes(load_global_params(input_path), input_path, fps=max(1.0, args.fps))
    output_path = Path(args.out) if args.out else input_path.with_name(OUTPUT_NAME)
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
