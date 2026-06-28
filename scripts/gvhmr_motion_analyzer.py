#!/usr/bin/env python3
"""Tiny GVHMR landmark motion classifier."""

import argparse
import json
import math
import statistics
from pathlib import Path


LANDMARK_NAME = "alicia_intermediate_landmarks.json"
OUTPUT_NAME = "motion_analysis.json"


def num(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def xyz(point):
    point = point or {}
    return (num(point.get("x")), num(point.get("y")), num(point.get("z")))


def dist2(a, b):
    return math.hypot(a[0] - b[0], a[2] - b[2])


def dist3(a, b):
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3)))


def resolve_input(path):
    path = Path(path)
    if path.is_dir():
        path = path / LANDMARK_NAME
    if not path.is_file():
        raise FileNotFoundError(f"landmark json not found: {path}")
    return path


def load_frames(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    frames = data.get("frames")
    if not isinstance(frames, list) or not frames:
        raise ValueError("frames missing or empty")
    return frames


def frame_time(frame, fallback_index, fps=30.0):
    if "t" in frame:
        return num(frame.get("t"))
    if "timeMs" in frame:
        return num(frame.get("timeMs")) / 1000.0
    return fallback_index / fps


def duration_seconds(frames):
    times = [frame_time(frame, i) for i, frame in enumerate(frames)]
    if len(times) < 2:
        return 0.0
    return max(0.001, times[-1] - times[0])


def landmarks(frame):
    return frame.get("landmarks") or {}


def root_point(frame):
    root = frame.get("rootTranslation")
    if root:
        return xyz(root)
    return xyz(landmarks(frame).get("hips"))


def point(frame, name):
    return xyz(landmarks(frame).get(name))


def range_or_zero(values):
    return max(values) - min(values) if values else 0.0


def contact_switches(frames, ground_y):
    last = None
    switches = 0
    off_ground = 0
    for frame in frames:
        contact = frame.get("footContact") or {}
        pair = []
        for side in ("left", "right"):
            foot_y = min(point(frame, f"{side}Foot")[1], point(frame, f"{side}Toe")[1])
            # ponytail: GVHMR contact is often all-false; height heuristic is enough until real contact exists.
            pair.append(bool(contact.get(side)) or foot_y <= ground_y + 0.06)
        pair = tuple(pair)
        if not pair[0] and not pair[1]:
            off_ground += 1
        if last is not None and pair != last:
            switches += 1
        last = pair
    return switches, off_ground / max(1, len(frames))


def max_frame_delta(frames, names):
    best = 0.0
    for prev, cur in zip(frames, frames[1:]):
        for name in names:
            best = max(best, dist3(point(prev, name), point(cur, name)))
    return best


def analyze_frames(frames, source):
    seconds = duration_seconds(frames)
    roots = [root_point(frame) for frame in frames]
    hips_y = [point(frame, "hips")[1] for frame in frames]
    head_y = [point(frame, "head")[1] for frame in frames]
    foot_ys = [point(frame, name)[1] for frame in frames for name in ("leftFoot", "rightFoot", "leftToe", "rightToe")]
    ground_y = min(foot_ys) if foot_ys else 0.0
    switches, off_ground_ratio = contact_switches(frames, ground_y)

    root_travel = sum(dist2(a, b) for a, b in zip(roots, roots[1:]))
    cadence = switches / seconds
    root_speed = root_travel / seconds
    hip_bob = range_or_zero(hips_y)
    max_foot_height = max((y - min(foot_ys) for y in foot_ys), default=0.0)
    body_heights = [h - hip for h, hip in zip(head_y, hips_y) if h and hip]
    avg_body_height = statistics.mean(body_heights) if body_heights else 0.0
    crouch_ratio = sum(1 for h in body_heights if h < avg_body_height * 0.82) / max(1, len(body_heights))

    arm_spreads = []
    hand_high = 0
    for frame in frames:
        lm = landmarks(frame)
        for side in ("left", "right"):
            wrist = xyz(lm.get(f"{side}Wrist"))
            shoulder = xyz(lm.get(f"{side}Shoulder"))
            head = xyz(lm.get("head"))
            arm_spreads.append(dist3(wrist, shoulder))
            if wrist[1] > shoulder[1] + 0.12 or wrist[1] > head[1] - 0.08:
                hand_high += 1
    arm_swing = range_or_zero(arm_spreads)
    hand_high_ratio = hand_high / max(1, len(frames) * 2)
    hand_speed = max_frame_delta(frames, ("leftWrist", "rightWrist"))

    metrics = {
        "rootTravel": round(root_travel, 4),
        "rootSpeed": round(root_speed, 4),
        "cadence": round(cadence, 4),
        "hipBob": round(hip_bob, 4),
        "armSwing": round(arm_swing, 4),
        "maxFootHeight": round(max_foot_height, 4),
        "crouchRatio": round(crouch_ratio, 4),
        "offGroundRatio": round(off_ground_ratio, 4),
        "handHighRatio": round(hand_high_ratio, 4),
        "handSpeed": round(hand_speed, 4),
    }

    jump_by_air = min(1.0, off_ground_ratio / 0.35) * min(1.0, max(hip_bob, max_foot_height) / 0.45)
    jump_by_hip = min(1.0, hip_bob / 0.45) * (1.0 - min(0.65, root_travel / 1.5)) * (1.0 - min(0.5, cadence / 4.0))

    labels = {
        "run": min(1.0, root_travel / 4.0) * max(min(1.0, cadence / 3.2), min(1.0, root_speed / 2.4)),
        "walk": min(1.0, root_travel / 1.1) * max(min(1.0, cadence / 1.4), min(1.0, root_speed / 0.7) * 0.65) * (1.0 - min(0.6, cadence / 7.0)),
        "jump": max(jump_by_air, jump_by_hip),
        "crouch": min(1.0, crouch_ratio / 0.35),
        "wave": min(1.0, hand_high_ratio / 0.35) * min(1.0, arm_swing / 0.45),
        "attack": min(1.0, hand_speed / 0.32) * min(1.0, arm_swing / 0.35),
    }
    sorted_labels = [{"name": k, "score": round(v, 4)} for k, v in sorted(labels.items(), key=lambda kv: kv[1], reverse=True)]
    primary = sorted_labels[0]["name"] if sorted_labels and sorted_labels[0]["score"] >= 0.12 else "unknown"

    warnings = []
    confidences = [num(frame.get("confidence"), 1.0) for frame in frames if "confidence" in frame]
    if confidences and statistics.mean(confidences) < 0.45:
        warnings.append("low average tracking confidence")
    if seconds <= 0.001:
        warnings.append("duration too short")

    return {
        "kind": "gvhmr_motion_analysis_v1",
        "source": str(source).replace("\\", "/"),
        "frameCount": len(frames),
        "durationMs": round(seconds * 1000),
        "primary": primary,
        "labels": sorted_labels,
        "metrics": metrics,
        "warnings": warnings,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="Analyze GVHMR Alicia landmark motion.")
    parser.add_argument("input", help="Folder containing alicia_intermediate_landmarks.json, or the json file itself.")
    parser.add_argument("--out", help="Output path. Defaults to motion_analysis.json next to input json.")
    args = parser.parse_args(argv)

    input_path = resolve_input(args.input)
    result = analyze_frames(load_frames(input_path), input_path)
    output_path = Path(args.out) if args.out else input_path.with_name(OUTPUT_NAME)
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
