import argparse
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn


CANONICAL_TO_H36M = {
    "hips": 0,
    "rightKnee": 2,
    "rightAnkle": 3,
    "leftKnee": 5,
    "leftAnkle": 6,
    "chest": 8,
    "head": 10,
    "leftShoulder": 11,
    "leftElbow": 12,
    "leftWrist": 13,
    "rightShoulder": 14,
    "rightElbow": 15,
    "rightWrist": 16,
}


def finite_number(value, fallback=0.0):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return number if np.isfinite(number) else fallback


def canonical_point(frame, name):
    landmarks = frame.get("landmarks", {}) if isinstance(frame, dict) else {}
    point = landmarks.get(name, {}) if isinstance(landmarks, dict) else {}
    if not isinstance(point, dict):
        point = {}
    return {
        "x": finite_number(point.get("x")),
        "y": finite_number(point.get("y")),
        "visibility": max(0.0, min(1.0, finite_number(point.get("visibility"), 1.0))),
    }


def to_motionbert_xyc(point):
    return [
        point["x"],
        -point["y"],
        point["visibility"],
    ]


def midpoint(a, b):
    return {
        "x": (a["x"] + b["x"]) * 0.5,
        "y": (a["y"] + b["y"]) * 0.5,
        "visibility": min(a["visibility"], b["visibility"]),
    }


def shifted(point, dx):
    return {
        "x": point["x"] + dx,
        "y": point["y"],
        "visibility": point["visibility"],
    }


def sequence_to_h36m_input(sequence):
    frames = sequence.get("frames", []) if isinstance(sequence, dict) else []
    motion = np.zeros((len(frames), 17, 3), dtype=np.float32)
    for index, frame in enumerate(frames):
        hips = canonical_point(frame, "hips")
        chest = canonical_point(frame, "chest")
        left_shoulder = canonical_point(frame, "leftShoulder")
        right_shoulder = canonical_point(frame, "rightShoulder")
        shoulder_width = abs(left_shoulder["x"] - right_shoulder["x"])
        hip_half_width = max(0.06, shoulder_width * 0.22)

        h36m_points = {
            0: hips,
            1: shifted(hips, hip_half_width),
            2: canonical_point(frame, "rightKnee"),
            3: canonical_point(frame, "rightAnkle"),
            4: shifted(hips, -hip_half_width),
            5: canonical_point(frame, "leftKnee"),
            6: canonical_point(frame, "leftAnkle"),
            7: midpoint(hips, chest),
            8: chest,
            9: canonical_point(frame, "head"),
            10: canonical_point(frame, "head"),
            11: left_shoulder,
            12: canonical_point(frame, "leftElbow"),
            13: canonical_point(frame, "leftWrist"),
            14: right_shoulder,
            15: canonical_point(frame, "rightElbow"),
            16: canonical_point(frame, "rightWrist"),
        }
        for joint_index, point in h36m_points.items():
            motion[index, joint_index, :] = to_motionbert_xyc(point)
    return motion


def depth_metadata(frames):
    def values(names):
        output = []
        for frame in frames:
            landmarks = frame.get("landmarks", {}) if isinstance(frame, dict) else {}
            for name in names:
                point = landmarks.get(name, {}) if isinstance(landmarks, dict) else {}
                z = point.get("z") if isinstance(point, dict) else None
                try:
                    output.append(float(z))
                except (TypeError, ValueError):
                    pass
        return output

    left_values = values(["leftKnee", "leftAnkle"])
    right_values = values(["rightKnee", "rightAnkle"])
    if not left_values or not right_values:
        return {
            "viewpoint": "front",
            "frontBackConfidence": 0.0,
            "depthConfidence": 0.0,
            "leadFoot": "unknown",
        }
    left_depth = sum(left_values) / len(left_values)
    right_depth = sum(right_values) / len(right_values)
    delta = right_depth - left_depth
    confidence = max(0.0, min(1.0, abs(delta) / 0.6))
    return {
        "viewpoint": "front",
        "frontBackConfidence": round(confidence, 3),
        "depthConfidence": round(confidence, 3),
        "leadFoot": "left" if delta >= 0 else "right",
    }


def load_motionbert(root, config_path, checkpoint_path, device):
    sys.path.insert(0, str(root))
    from lib.utils.learning import load_backbone
    from lib.utils.tools import get_config

    config = get_config(str(config_path))
    model = load_backbone(config)
    use_cuda = device == "cuda" and torch.cuda.is_available()
    if use_cuda:
        model = nn.DataParallel(model).cuda()

    checkpoint = torch.load(str(checkpoint_path), map_location="cuda" if use_cuda else "cpu")
    state = checkpoint["model_pos"] if isinstance(checkpoint, dict) and "model_pos" in checkpoint else checkpoint
    model.load_state_dict(state, strict=True)
    model.eval()
    return model, config, use_cuda


def run_lift(model, config, motion, use_cuda, clip_len):
    from lib.utils.utils_data import crop_scale, flip_data

    motion = crop_scale(motion, [1, 1])
    outputs = []
    with torch.no_grad():
        for start in range(0, len(motion), clip_len):
            clip = motion[start:start + clip_len]
            batch = torch.from_numpy(clip).unsqueeze(0).float()
            if use_cuda:
                batch = batch.cuda()
            model_input = batch[:, :, :, :2] if getattr(config, "no_conf", False) else batch
            if getattr(config, "flip", False):
                flipped_input = flip_data(model_input)
                prediction = model(model_input)
                flipped_prediction = model(flipped_input)
                prediction = (prediction + flip_data(flipped_prediction)) / 2.0
            else:
                prediction = model(model_input)

            if getattr(config, "rootrel", False):
                prediction[:, :, 0, :] = 0
            else:
                prediction[:, 0, 0, 2] = 0
            if getattr(config, "gt_2d", False):
                prediction[..., :2] = model_input[..., :2]
            outputs.append(prediction.cpu().numpy()[0])
    return np.concatenate(outputs, axis=0) if outputs else np.zeros((0, 17, 3), dtype=np.float32)


def build_output_frames(sequence, lifted):
    source_frames = sequence.get("frames", []) if isinstance(sequence, dict) else []
    output_frames = []
    for index, frame in enumerate(source_frames):
        root_z = finite_number(lifted[index, 0, 2]) if index < len(lifted) else 0.0
        landmarks = {}
        for name, joint_index in CANONICAL_TO_H36M.items():
            if index < len(lifted):
                landmarks[name] = {
                    "z": round(float(lifted[index, joint_index, 2] - root_z), 5)
                }
        output_frames.append({
            "timeMs": frame.get("timeMs", index),
            "landmarks": landmarks,
        })
    return output_frames


def main():
    parser = argparse.ArgumentParser(description="Lift Alicia canonical skeleton JSON with MotionBERT.")
    parser.add_argument("--motionbert-root", required=True)
    parser.add_argument("--config", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--input-json", required=True)
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--video-path", default="")
    parser.add_argument("--device", default="cuda", choices=["cuda", "cpu"])
    parser.add_argument("--clip-len", type=int, default=243)
    args = parser.parse_args()

    started_at = time.time()
    root = Path(args.motionbert_root).resolve()
    config_path = Path(args.config).resolve()
    checkpoint_path = Path(args.checkpoint).resolve()
    with open(args.input_json, "r", encoding="utf-8") as f:
        sequence = json.load(f)

    old_cwd = os.getcwd()
    try:
        os.chdir(root)
        model, config, use_cuda = load_motionbert(root, config_path, checkpoint_path, args.device)
        motion = sequence_to_h36m_input(sequence)
        lifted = run_lift(model, config, motion, use_cuda, args.clip_len)
        frames = build_output_frames(sequence, lifted)
        output = {
            "ok": True,
            "frames": frames,
            "metadata": {
                **depth_metadata(frames),
                "runtimeMs": round((time.time() - started_at) * 1000),
                "device": "cuda" if use_cuda else "cpu",
                "checkpoint": checkpoint_path.name,
            },
        }
    finally:
        os.chdir(old_cwd)

    with open(args.output_json, "w", encoding="utf-8", newline="\n") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
