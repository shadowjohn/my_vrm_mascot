import importlib.util
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = REPO_ROOT / "scripts" / "mediapipe_hand_pass.py"


def load_module():
    spec = importlib.util.spec_from_file_location("mediapipe_hand_pass_under_test", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fake_hand(label, score, cx, cy, curl=0.1):
    landmarks = []
    for index in range(21):
        landmarks.append({"x": cx + index * 0.001, "y": cy + index * 0.001, "z": 0})
    for tip in (8, 12, 16, 20):
        landmarks[tip]["y"] = cy + curl
    return {"label": label, "score": score, "landmarks2d": landmarks}


def fake_clustered_fist(label, score):
    landmarks = []
    for index in range(21):
        landmarks.append({"x": 0.45 + index * 0.002, "y": 0.42 + index * 0.001, "z": 0})
    landmarks[0] = {"x": 0.446, "y": 0.382, "z": 0}
    landmarks[9] = {"x": 0.446, "y": 0.438, "z": 0}
    for tip in (4, 8, 12, 16, 20):
        landmarks[tip] = {"x": 0.412 + tip * 0.0004, "y": 0.341 + tip * 0.0003, "z": 0}
    return {"label": label, "score": score, "landmarks2d": landmarks}


def main():
    module = load_module()
    wrists = {"left": (0.22, 0.52), "right": (0.78, 0.52)}
    hands = [
        fake_hand("Right", 0.93, 0.21, 0.51, curl=0.03),
        fake_hand("Right", 0.91, 0.79, 0.51, curl=0.15),
    ]
    assigned = module.assign_hands_to_sides(hands, wrists)
    assert assigned["left"]["score"] == 0.93
    assert assigned["right"]["score"] == 0.91
    assert module.classify_gesture(assigned["left"])["gesture"] == "open"
    assert module.classify_gesture(assigned["right"])["gesture"] == "fist"
    clustered = module.classify_gesture(fake_clustered_fist("Right", 0.99))
    assert clustered["gesture"] == "fist"
    assert clustered["metrics"]["tipClusterRatio"] < 1.15

    frames = [
        {"time_ms": 0, "left": {"source": "mediapipe_hands", "confidence": 0.9, "gesture": "fist", "fingerCurl": 0.9}},
        {"time_ms": 33, "left": {"source": "pass", "confidence": 0, "gesture": "keep"}},
    ]
    filled = module.fill_pass_with_previous(frames)
    assert filled[1]["left"]["gesture"] == "fist"
    assert filled[1]["left"]["source"] == "pass"
    assert filled[1]["left"]["heldFromTimeMs"] == 0
    print("PASS test_mediapipe_hand_pass")


if __name__ == "__main__":
    main()
