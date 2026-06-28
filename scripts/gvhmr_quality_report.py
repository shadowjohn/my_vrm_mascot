#!/usr/bin/env python3
"""Tiny Alicia/GVHMR baked motion quality report."""

import argparse
import json
import math
from pathlib import Path


BAKE_NAME = "alicia_blender_bake_motion.json"
LANDMARK_NAME = "alicia_intermediate_landmarks.json"
OUTPUT_NAME = "motion_quality_report.json"


def num(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def resolve_input(path):
    path = Path(path)
    if path.is_dir():
        path = path / BAKE_NAME
    if not path.is_file():
        raise FileNotFoundError(f"baked motion json not found: {path}")
    return path


def quat_angle_degrees(rot):
    if not isinstance(rot, list) or len(rot) != 4:
        return 0.0
    x, y, z, w = [num(v) for v in rot]
    length = math.sqrt(x * x + y * y + z * z + w * w)
    if length <= 0:
        return 0.0
    w = max(-1.0, min(1.0, w / length))
    return math.degrees(2 * math.acos(abs(w)))


def vec3(value):
    if not isinstance(value, list) or len(value) < 3:
        return (0.0, 0.0, 0.0)
    return (num(value[0]), num(value[1]), num(value[2]))


def point(frame, name):
    item = (frame.get("landmarks") or {}).get(name) or {}
    return (num(item.get("x")), num(item.get("y")), num(item.get("z")))


def issue(kind, frame_index, time_ms, severity, message, metrics):
    return {
        "type": kind,
        "frameIndex": frame_index,
        "timeMs": round(time_ms),
        "severity": severity,
        "message": message,
        "metrics": metrics,
    }


def append_issue_limited(issues, item, limit_per_type=40):
    if sum(1 for x in issues if x["type"] == item["type"]) < limit_per_type:
        issues.append(item)


def load_sibling_landmarks(path):
    sibling = path.with_name(LANDMARK_NAME)
    if not sibling.is_file():
        return None
    data = json.loads(sibling.read_text(encoding="utf-8"))
    frames = data.get("frames")
    return frames if isinstance(frames, list) else None


def report_bone_angles(data, issues):
    bones = data.get("bones") or {}
    frame_count = int(data.get("frame_count") or 0)
    for side in ("left", "right"):
        lower = bones.get(f"{side}LowerLeg") or []
        for index, key in enumerate(lower):
            angle = quat_angle_degrees(key.get("rot"))
            if angle > 135:
                append_issue_limited(issues, issue(
                    "knee_bend",
                    index,
                    num(key.get("time_ms")),
                    "high" if angle > 160 else "medium",
                    f"{side} lower leg rotation looks extreme",
                    {"angleDeg": round(angle, 2), "bone": f"{side}LowerLeg"},
                ))

    for bone_name in ("spine", "chest"):
        for index, key in enumerate(bones.get(bone_name) or []):
            angle = quat_angle_degrees(key.get("rot"))
            if angle > 42:
                append_issue_limited(issues, issue(
                    "spine_lean",
                    index,
                    num(key.get("time_ms")),
                    "high" if angle > 65 else "medium",
                    f"{bone_name} rotation is stronger than Alicia usually tolerates",
                    {"angleDeg": round(angle, 2), "bone": bone_name},
                ))
    return frame_count


def report_root_drift(data, issues):
    hips = data.get("hips_position") or []
    if len(hips) < 2:
        return
    first = vec3(hips[0].get("pos"))
    last = vec3(hips[-1].get("pos"))
    total = math.hypot(last[0] - first[0], last[2] - first[2])
    if total > 1.5:
        issues.append(issue(
            "root_drift",
            len(hips) - 1,
            num(hips[-1].get("time_ms")),
            "medium",
            "root travels far from start; check whether this clip should be in-place",
            {"travel": round(total, 3)},
        ))
    for index, (a, b) in enumerate(zip(hips, hips[1:]), start=1):
        pa, pb = vec3(a.get("pos")), vec3(b.get("pos"))
        delta = math.sqrt(sum((pb[i] - pa[i]) ** 2 for i in range(3)))
        if delta > 0.45:
            append_issue_limited(issues, issue(
                "root_drift",
                index,
                num(b.get("time_ms")),
                "high",
                "root has a sudden per-frame jump",
                {"delta": round(delta, 3)},
            ))


def report_foot_contact(landmark_frames, issues):
    if not landmark_frames:
        return
    foot_names = ("leftFoot", "rightFoot", "leftToe", "rightToe")
    ground = min(point(frame, name)[1] for frame in landmark_frames for name in foot_names)
    for index, frame in enumerate(landmark_frames):
        contact = frame.get("footContact") or {}
        for side in ("left", "right"):
            if not contact.get(side):
                continue
            foot_y = min(point(frame, f"{side}Foot")[1], point(frame, f"{side}Toe")[1])
            lift = foot_y - ground
            if lift > 0.08:
                append_issue_limited(issues, issue(
                    "foot_contact",
                    index,
                    num(frame.get("timeMs"), num(frame.get("t")) * 1000),
                    "medium",
                    f"{side} foot is marked contact while above ground",
                    {"lift": round(lift, 4), "side": side},
                ))


def build_report(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data.get("bones"), dict):
        raise ValueError("bones missing or invalid")

    issues = []
    frame_count = report_bone_angles(data, issues)
    report_root_drift(data, issues)
    landmark_frames = load_sibling_landmarks(path)
    report_foot_contact(landmark_frames, issues)

    by_type = {}
    for item in issues:
        by_type[item["type"]] = by_type.get(item["type"], 0) + 1

    return {
        "kind": "gvhmr_quality_report_v1",
        "source": str(path).replace("\\", "/"),
        "frameCount": frame_count,
        "durationMs": data.get("duration_ms", 0),
        "summary": {
            "issueCount": len(issues),
            "byType": by_type,
            "hasLandmarkFootContact": landmark_frames is not None,
        },
        "issues": issues,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="Report suspicious frames in Alicia baked GVHMR motion.")
    parser.add_argument("input", help="Folder containing alicia_blender_bake_motion.json, or the json file itself.")
    parser.add_argument("--out", help="Output path. Defaults to motion_quality_report.json next to input json.")
    args = parser.parse_args(argv)

    input_path = resolve_input(args.input)
    result = build_report(input_path)
    output_path = Path(args.out) if args.out else input_path.with_name(OUTPUT_NAME)
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
