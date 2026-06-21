import argparse
import json
import math
from pathlib import Path


HIGH_CONFIDENCE = 0.75
LOW_CONFIDENCE = 0.45
MAX_WRIST_DISTANCE = 0.24
FINGER_TIPS = (8, 12, 16, 20)
FINGER_PIPS = (6, 10, 14, 18)


def finite(value, default=0.0):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


def frame_time_ms(frame, index, fps):
    if isinstance(frame, dict):
        for key in ("timeMs", "time_ms"):
            if key in frame:
                return round(finite(frame.get(key)))
        if "t" in frame:
            return round(finite(frame.get("t")) * 1000)
    return round(index * 1000 / max(fps, 1))


def landmark_xy(landmark):
    return (finite(landmark.get("x")), finite(landmark.get("y")))


def hand_center(hand):
    landmarks = hand.get("landmarks2d") or []
    if not landmarks:
        return (0.0, 0.0)
    xs = [finite(item.get("x")) for item in landmarks]
    ys = [finite(item.get("y")) for item in landmarks]
    return (sum(xs) / len(xs), sum(ys) / len(ys))


def distance(a, b):
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)


def assign_hands_to_sides(hands, wrist_xy):
    available = list(hands or [])
    assigned = {}
    for side in ("left", "right"):
        wrist = wrist_xy.get(side)
        if not wrist or not available:
            continue
        best = min(available, key=lambda hand: distance(hand_center(hand), wrist))
        if distance(hand_center(best), wrist) <= MAX_WRIST_DISTANCE:
            assigned[side] = best
            available.remove(best)
    return assigned


def assign_hands_by_label(hands):
    assigned = {}
    label_counts = {}
    for hand in hands or []:
        label = str(hand.get("label") or "").lower()
        label_counts[label] = label_counts.get(label, 0) + 1
    for hand in hands or []:
        label = str(hand.get("label") or "").lower()
        if label_counts.get(label) != 1:
            continue
        if label == "left":
            assigned["left"] = hand
        elif label == "right":
            assigned["right"] = hand
    return assigned


def classify_gesture(hand):
    landmarks = hand.get("landmarks2d") or []
    score = finite(hand.get("score"))
    if len(landmarks) < 21 or score < LOW_CONFIDENCE:
        return {"source": "pass", "confidence": 0, "gesture": "keep", "reason": "low_confidence"}

    vertical_curls = []
    fold_curls = []
    for tip, pip in zip(FINGER_TIPS, FINGER_PIPS):
        tip_xy = landmark_xy(landmarks[tip])
        pip_xy = landmark_xy(landmarks[pip])
        vertical_curls.append(max(0.0, min(1.0, (tip_xy[1] - pip_xy[1]) * 8)))
        fold_curls.append(distance(tip_xy, pip_xy))
    wrist = landmark_xy(landmarks[0])
    middle = landmark_xy(landmarks[9])
    palm_size = max(distance(wrist, middle), 0.000001)
    tip_ratio = sum(distance(wrist, landmark_xy(landmarks[tip])) / palm_size for tip in FINGER_TIPS) / len(FINGER_TIPS)
    fold_ratio = sum(value / palm_size for value in fold_curls) / len(fold_curls)
    tip_points = [landmark_xy(landmarks[tip]) for tip in FINGER_TIPS]
    cluster = sum(
        distance(tip_points[i], tip_points[j])
        for i in range(len(tip_points))
        for j in range(i + 1, len(tip_points))
    ) / 6
    tip_cluster_ratio = cluster / palm_size
    compact_curl = max(0.0, min(1.0, (1.45 - tip_ratio) / 0.7))
    fold_curl = max(0.0, min(1.0, (0.62 - fold_ratio) / 0.45)) if tip_ratio < 1.55 else 0.0
    cluster_curl = max(0.0, min(1.0, (1.2 - tip_cluster_ratio) / 0.75)) if tip_ratio < 1.7 else 0.0
    finger_curl = max(sum(vertical_curls) / len(vertical_curls), compact_curl, fold_curl, cluster_curl)
    gesture = "fist" if finger_curl >= 0.58 else "open" if finger_curl <= 0.28 else "relaxed"
    palm_pitch = max(-28, min(28, (middle[1] - wrist[1]) * -70))
    palm_yaw = max(-24, min(24, (middle[0] - wrist[0]) * 70))
    return {
        "source": "mediapipe_hands",
        "confidence": round(score, 3),
        "gesture": gesture,
        "fingerCurl": round(finger_curl, 3),
        "palmPitch": round(palm_pitch, 3),
        "palmYaw": round(palm_yaw, 3),
        "palmRoll": 0,
        "metrics": {
            "tipRatio": round(tip_ratio, 3),
            "foldRatio": round(fold_ratio, 3),
            "tipClusterRatio": round(tip_cluster_ratio, 3),
        },
        "landmarks2d": {
            "wrist": list(wrist),
            "indexTip": list(landmark_xy(landmarks[8])),
            "thumbTip": list(landmark_xy(landmarks[4])),
        } if score >= HIGH_CONFIDENCE else {},
    }


def fill_pass_with_previous(frames):
    previous = {"left": None, "right": None}
    output = []
    for frame in frames:
        item = dict(frame)
        for side in ("left", "right"):
            pose = dict(item.get(side) or {"source": "pass", "confidence": 0, "gesture": "keep"})
            if pose.get("source") == "pass":
                if previous[side]:
                    held = dict(previous[side])
                    held.update({
                        "source": "pass",
                        "confidence": 0,
                        "heldFromTimeMs": previous[side].get("time_ms", previous[side].get("timeMs", 0)),
                    })
                    pose = held
            else:
                previous[side] = {"time_ms": item.get("time_ms", item.get("timeMs", 0)), **pose}
            item[side] = pose
        output.append(item)
    return output


def wrist_xy_from_landmarks(landmarks):
    points = [
        item for item in (landmarks or {}).values()
        if isinstance(item, dict) and "x" in item and "y" in item
    ]
    if len(points) < 4:
        return {}
    xs = [finite(item.get("x")) for item in points]
    ys = [finite(item.get("y")) for item in points]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    span_x = max(max_x - min_x, 0.000001)
    span_y = max(max_y - min_y, 0.000001)
    result = {}
    for side in ("left", "right"):
        wrist = landmarks.get(f"{side}Wrist")
        if isinstance(wrist, dict):
            # GVHMR 是 3D world-ish 座標，不能直接除影片寬高；這裡只拿身體 bbox 做左右手近似配對。
            result[side] = (
                (finite(wrist.get("x")) - min_x) / span_x,
                1.0 - ((finite(wrist.get("y")) - min_y) / span_y),
            )
    return result


def detect_hands_in_video(video_path, skeleton_path, output_json, max_num_hands=2):
    import cv2
    import mediapipe as mp

    skeleton = json.loads(Path(skeleton_path).read_text(encoding="utf-8"))
    frames = skeleton.get("frames") or []
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"cannot open video: {video_path}")
    fps = finite(cap.get(cv2.CAP_PROP_FPS), 30) or 30

    output_frames = []
    with mp.solutions.hands.Hands(static_image_mode=True, max_num_hands=max_num_hands, model_complexity=1, min_detection_confidence=0.35) as hands_model:
        for index, frame in enumerate(frames):
            time_ms = frame_time_ms(frame, index, fps)
            cap.set(cv2.CAP_PROP_POS_MSEC, time_ms)
            ok, image = cap.read()
            if not ok:
                output_frames.append({"time_ms": time_ms})
                continue
            rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            result = hands_model.process(rgb)
            detected = []
            for landmarks, handedness in zip(result.multi_hand_landmarks or [], result.multi_handedness or []):
                score = handedness.classification[0].score if handedness.classification else 0
                label = handedness.classification[0].label if handedness.classification else ""
                detected.append({
                    "label": label,
                    "score": finite(score),
                    "landmarks2d": [{"x": lm.x, "y": lm.y, "z": lm.z} for lm in landmarks.landmark],
                })
            assigned = assign_hands_to_sides(detected, wrist_xy_from_landmarks(frame.get("landmarks") or {}))
            used_ids = {id(hand) for hand in assigned.values()}
            for side, hand in assign_hands_by_label(detected).items():
                if side not in assigned and id(hand) not in used_ids:
                    assigned[side] = hand
                    used_ids.add(id(hand))
            output_frames.append({
                "time_ms": time_ms,
                "left": classify_gesture(assigned.get("left") or {}),
                "right": classify_gesture(assigned.get("right") or {}),
            })
    cap.release()
    output_frames = fill_pass_with_previous(output_frames)
    payload = {
        "ok": True,
        "source": "mediapipe_hands",
        "video": str(video_path),
        "skeleton": str(skeleton_path),
        "frames": output_frames,
    }
    Path(output_json).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    return payload


def main():
    parser = argparse.ArgumentParser(description="Extract MediaPipe hand poses for Alicia GVHMR bake.")
    parser.add_argument("--video", required=True)
    parser.add_argument("--skeleton-json", required=True)
    parser.add_argument("--output-json", required=True)
    args = parser.parse_args()
    detect_hands_in_video(args.video, args.skeleton_json, args.output_json)


if __name__ == "__main__":
    main()
