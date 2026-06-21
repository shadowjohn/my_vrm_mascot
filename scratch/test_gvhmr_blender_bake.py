import importlib.util
import math
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = REPO_ROOT / "scripts" / "gvhmr_to_alicia_blender_bake.py"


def load_module():
    spec = importlib.util.spec_from_file_location("gvhmr_to_alicia_blender_bake_under_test", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def quat_length(quat):
    return math.sqrt(sum(float(v) * float(v) for v in quat))


def quat_angle_degrees(quat):
    w = max(-1.0, min(1.0, float(quat[3])))
    return math.degrees(2 * math.acos(abs(w)))


def quat_from_degrees(degrees):
    radians = math.radians(degrees)
    return [math.sin(radians / 2), 0, 0, math.cos(radians / 2)]


def minimal_landmarks(left_shoulder, right_shoulder):
    return {
        "hips": {"x": 0, "y": 1.0, "z": 0},
        "chest": {"x": 0, "y": 1.45, "z": 0},
        "neck": {"x": 0, "y": 1.72, "z": 0},
        "head": {"x": 0, "y": 1.92, "z": 0},
        "leftShoulder": left_shoulder,
        "rightShoulder": right_shoulder,
    }


def main():
    module = load_module()
    payload = {
        "ok": True,
        "frames": [
            {
                "timeMs": 0,
                "landmarks": {
                    "hips": {"x": 0, "y": 1.0, "z": 0},
                    "chest": {"x": 0, "y": 1.45, "z": 0},
                    "leftShoulder": {"x": 0, "y": 1.45, "z": 0.5},
                    "rightShoulder": {"x": 0, "y": 1.45, "z": -0.5},
                    "leftKnee": {"x": -0.16, "y": 0.55, "z": -0.35},
                    "leftAnkle": {"x": -0.16, "y": 0.06, "z": -0.55},
                    "leftFoot": {"x": -0.16, "y": 0.04, "z": -0.72},
                    "rightKnee": {"x": 0.16, "y": 0.55, "z": 0.35},
                    "rightAnkle": {"x": 0.16, "y": 0.06, "z": 0.55},
                    "rightFoot": {"x": 0.16, "y": 0.04, "z": 0.72},
                },
            },
            {
                "timeMs": 33.333,
                "landmarks": {
                    "hips": {"x": 0.01, "y": 1.0, "z": 0},
                    "chest": {"x": 0.01, "y": 1.45, "z": 0},
                    "leftShoulder": {"x": 0.01, "y": 1.45, "z": 0.5},
                    "rightShoulder": {"x": 0.01, "y": 1.45, "z": -0.5},
                    "leftKnee": {"x": -0.17, "y": 0.54, "z": -0.34},
                    "leftAnkle": {"x": -0.17, "y": 0.06, "z": -0.53},
                    "leftFoot": {"x": -0.17, "y": 0.04, "z": -0.70},
                    "rightKnee": {"x": 0.17, "y": 0.54, "z": 0.34},
                    "rightAnkle": {"x": 0.17, "y": 0.06, "z": 0.53},
                    "rightFoot": {"x": 0.17, "y": 0.04, "z": 0.70},
                },
            },
        ],
    }
    animation = module.build_animation_from_landmarks(payload, fps=30, armature=None)
    normalized_payload, facing_alignment = module.normalize_payload_facing(payload)
    core_with_rest_override = module.build_animation_core(
        normalized_payload,
        30,
        facing_alignment,
        rest_dirs={"leftFoot": (1, 0, 0)},
    )

    assert animation["source"] == "gvhmr_blender_bake"
    assert animation["retarget_mode"] == "blender_ik_foot_lock"
    assert animation["facing_alignment"]["targetForward"] == {"x": 0.0, "z": 1.0}
    assert abs(animation["facing_alignment"]["yawCorrectionDegrees"] - 90) < 0.001
    assert animation["duration_ms"] == 33
    assert set(["hips", "spine", "chest", "leftUpperLeg", "rightUpperLeg"]).issubset(animation["bones"])
    assert set(["leftToes", "rightToes"]).issubset(animation["bones"])
    assert len(animation["bones"]["leftUpperLeg"]) == 2
    assert len(animation["bones"]["leftToes"]) == 2
    assert animation["bones"]["leftFoot"][0]["rot"] != core_with_rest_override["bones"]["leftFoot"][0]["rot"]
    assert animation["hips_position"][1]["time_ms"] == 33
    for keys in animation["bones"].values():
        for key in keys:
            assert abs(quat_length(key["rot"]) - 1) < 0.0001
    assert animation["bones"]["leftUpperLeg"][0]["rot"] != animation["bones"]["rightUpperLeg"][0]["rot"]
    assert animation["ik"] == {"leftFoot": "locked", "rightFoot": "locked"}

    high_knee_landmarks = {
        "hips": {"x": 0, "y": 1.0, "z": 0},
        "leftKnee": {"x": 0.1, "y": 1.08, "z": 0.45},
    }
    normal_leg_landmarks = {
        "hips": {"x": 0, "y": 1.0, "z": 0},
        "leftKnee": {"x": 0.1, "y": 0.55, "z": 0.1},
    }
    assert not module.should_use_base_leg_pose(
        quat_from_degrees(70),
        quat_from_degrees(125),
        high_knee_landmarks,
        "left",
    )
    assert module.should_use_direct_lifted_leg_pose(high_knee_landmarks, "left")
    assert module.should_use_base_leg_pose(
        quat_from_degrees(80),
        quat_from_degrees(125),
        normal_leg_landmarks,
        "left",
    )
    assert module.should_use_base_leg_pose(
        quat_from_degrees(91),
        quat_from_degrees(55),
        normal_leg_landmarks,
        "left",
    )
    assert module.should_use_base_leg_pose(
        quat_from_degrees(89),
        quat_from_degrees(55),
        normal_leg_landmarks,
        "left",
    )
    assert module.should_use_base_leg_pose(
        quat_from_degrees(81),
        quat_from_degrees(43),
        normal_leg_landmarks,
        "right",
    )
    assert not module.should_use_direct_lifted_leg_pose(normal_leg_landmarks, "left")

    twist_payload = {
        "ok": True,
        "frames": [
            {
                "timeMs": 0,
                "landmarks": minimal_landmarks(
                    {"x": -0.35, "y": 1.55, "z": 0},
                    {"x": 0.35, "y": 1.55, "z": 0},
                ),
            },
            {
                "timeMs": 33,
                "landmarks": minimal_landmarks(
                    {"x": 0, "y": 1.55, "z": -0.35},
                    {"x": 0, "y": 1.55, "z": 0.35},
                ),
            },
        ],
    }
    twist_animation = module.build_animation_from_landmarks(twist_payload, fps=30, armature=None)
    assert twist_animation["bones"]["hips"][0]["rot"] != twist_animation["bones"]["hips"][1]["rot"]
    assert "chest" in twist_animation["bones"]
    assert "neck" in twist_animation["bones"]

    flat_foot_payload = {
        "ok": True,
        "frames": [
            {
                "timeMs": 0,
                "landmarks": {
                    "hips": {"x": 0, "y": 1.0, "z": 0},
                    "chest": {"x": 0, "y": 1.4, "z": 0.22},
                    "neck": {"x": 0, "y": 1.7, "z": 0.28},
                    "head": {"x": 0, "y": 1.9, "z": 0.3},
                    "leftShoulder": {"x": -0.3, "y": 1.55, "z": 0.22},
                    "rightShoulder": {"x": 0.3, "y": 1.55, "z": 0.22},
                    "leftKnee": {"x": -0.1, "y": 0.55, "z": 0},
                    "leftAnkle": {"x": -0.1, "y": 0.05, "z": 0},
                    "leftFoot": {"x": -0.1, "y": 0, "z": 0},
                    "leftToe": {"x": -0.1, "y": 0, "z": 0.2},
                    "rightKnee": {"x": 0.1, "y": 0.55, "z": 0},
                    "rightAnkle": {"x": 0.1, "y": 0.05, "z": 0},
                    "rightFoot": {"x": 0.1, "y": 0, "z": 0},
                    "rightToe": {"x": 0.1, "y": 0, "z": 0.2},
                },
            }
        ],
    }
    flat_foot_animation = module.build_animation_from_landmarks(flat_foot_payload, fps=30, armature=None)
    assert quat_angle_degrees(flat_foot_animation["bones"]["leftFoot"][0]["rot"]) < 8
    assert quat_angle_degrees(flat_foot_animation["bones"]["rightFoot"][0]["rot"]) < 8
    assert quat_angle_degrees(flat_foot_animation["bones"]["spine"][0]["rot"]) > 8
    assert quat_angle_degrees(flat_foot_animation["bones"]["hips"][0]["rot"]) < quat_angle_degrees(flat_foot_animation["bones"]["spine"][0]["rot"])
    torso_quat = module.normalize_quat((0.2, 0.1, 0, 0.97))
    damped_torso_quat = module.damp_torso_pitch_quat("spine", torso_quat)
    assert abs(damped_torso_quat[0]) < abs(torso_quat[0])
    assert module.damp_torso_pitch_quat("leftUpperLeg", torso_quat) == torso_quat

    toe_landmarks = module.clamp_toe_roll_landmarks({
        "leftFoot": {"x": 0, "y": 0.04, "z": 0.2},
        "leftToe": {"x": 0, "y": -0.3, "z": 0.6},
    })
    assert toe_landmarks["leftToe"]["y"] >= 0.035
    contact_frames = [
        {
            "landmarks": {
                "leftFoot": {"x": 0, "y": 0.12, "z": 0.2},
                "leftToe": {"x": 0, "y": -0.12, "z": 0.6},
                "rightFoot": {"x": 1, "y": 0.0, "z": 0.2},
                "rightToe": {"x": 1, "y": 0.0, "z": 0.6},
            }
        },
        {
            "landmarks": {
                "leftFoot": {"x": 0, "y": 0.01, "z": 0.2},
                "leftToe": {"x": 0, "y": 0.16, "z": 0.6},
                "rightFoot": {"x": 1, "y": 0.0, "z": 0.2},
                "rightToe": {"x": 1, "y": 0.0, "z": 0.6},
            }
        },
    ]
    contact_frames = module.stabilize_foot_contact_frames(contact_frames)
    for frame in contact_frames:
        landmarks = frame["landmarks"]
        assert landmarks["leftFoot"]["y"] >= 0.0
        assert landmarks["leftToe"]["y"] >= 0.0
        assert abs(landmarks["leftToe"]["y"] - landmarks["leftFoot"]["y"]) <= 0.04

    reversed_toe_frames = module.stabilize_foot_contact_frames([
        {
            "landmarks": {
                "leftFoot": {"x": 0, "y": 0, "z": 0.2},
                "leftToe": {"x": 0, "y": 0, "z": 0.1},
            }
        }
    ])
    reversed_toe_landmarks = reversed_toe_frames[0]["landmarks"]
    assert reversed_toe_landmarks["leftToe"]["z"] > reversed_toe_landmarks["leftFoot"]["z"]

    spike_keys = [
        {"time_ms": 0, "rot": [0, 0, 0, 1]},
        {"time_ms": 33, "rot": [1, 0, 0, 0]},
        {"time_ms": 67, "rot": [0, 0, 0, 1]},
    ]
    smoothed = module.smooth_quat_keys(spike_keys)
    assert quat_angle_degrees(smoothed[1]["rot"]) < quat_angle_degrees(spike_keys[1]["rot"])
    print("PASS test_gvhmr_blender_bake")


if __name__ == "__main__":
    main()
