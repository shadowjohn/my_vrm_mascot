import argparse
import json
import math
import sys
from pathlib import Path


BONE_CHAINS = {
    "hips": ("hips", "chest"),
    "spine": ("hips", "chest"),
    "chest": ("chest", "neck"),
    "neck": ("neck", "head"),
    "leftShoulder": ("chest", "leftShoulder"),
    "leftUpperArm": ("leftShoulder", "leftElbow"),
    "leftLowerArm": ("leftElbow", "leftWrist"),
    "rightShoulder": ("chest", "rightShoulder"),
    "rightUpperArm": ("rightShoulder", "rightElbow"),
    "rightLowerArm": ("rightElbow", "rightWrist"),
    "leftUpperLeg": ("hips", "leftKnee"),
    "leftLowerLeg": ("leftKnee", "leftAnkle"),
    "leftFoot": ("leftFoot", "leftToe"),
    "leftToes": ("leftFoot", "leftToe"),
    "rightUpperLeg": ("hips", "rightKnee"),
    "rightLowerLeg": ("rightKnee", "rightAnkle"),
    "rightFoot": ("rightFoot", "rightToe"),
    "rightToes": ("rightFoot", "rightToe"),
}

BONE_PARENTS = {
    "hips": None,
    "spine": "hips",
    "chest": "spine",
    "neck": "chest",
    "leftShoulder": "chest",
    "leftUpperArm": "leftShoulder",
    "leftLowerArm": "leftUpperArm",
    "rightShoulder": "chest",
    "rightUpperArm": "rightShoulder",
    "rightLowerArm": "rightUpperArm",
    "leftUpperLeg": "hips",
    "leftLowerLeg": "leftUpperLeg",
    "leftFoot": "leftLowerLeg",
    "leftToes": "leftFoot",
    "rightUpperLeg": "hips",
    "rightLowerLeg": "rightUpperLeg",
    "rightFoot": "rightLowerLeg",
    "rightToes": "rightFoot",
}

BONE_ALIASES = {
    "hips": ("Hips", "hips", "J_Bip_C_Hips"),
    "spine": ("Spine", "Spine1", "spine", "J_Bip_C_Spine"),
    "chest": ("Spine3", "Chest", "chest", "J_Bip_C_Chest"),
    "neck": ("Neck", "neck", "J_Bip_C_Neck"),
    "leftShoulder": ("LeftShoulder", "leftShoulder", "J_Bip_L_Shoulder"),
    "leftUpperArm": ("LeftArm", "leftUpperArm", "J_Bip_L_UpperArm"),
    "leftLowerArm": ("LeftForeArm", "leftLowerArm", "J_Bip_L_LowerArm"),
    "leftFoot": ("LeftFoot", "leftFoot", "J_Bip_L_Foot"),
    "leftToes": ("LeftToeBase", "leftToes", "J_Bip_L_ToeBase"),
    "rightShoulder": ("RightShoulder", "rightShoulder", "J_Bip_R_Shoulder"),
    "rightUpperArm": ("RightArm", "rightUpperArm", "J_Bip_R_UpperArm"),
    "rightLowerArm": ("RightForeArm", "rightLowerArm", "J_Bip_R_LowerArm"),
    "rightFoot": ("RightFoot", "rightFoot", "J_Bip_R_Foot"),
    "rightToes": ("RightToeBase", "rightToes", "J_Bip_R_ToeBase"),
    "leftUpperLeg": ("LeftUpLeg", "leftUpperLeg", "J_Bip_L_UpperLeg"),
    "leftLowerLeg": ("LeftLeg", "leftLowerLeg", "J_Bip_L_LowerLeg"),
    "rightUpperLeg": ("RightUpLeg", "rightUpperLeg", "J_Bip_R_UpperLeg"),
    "rightLowerLeg": ("RightLeg", "rightLowerLeg", "J_Bip_R_LowerLeg"),
}

ALICIA_FORWARD_XZ = (0.0, 1.0)

REST_CHILD_ALIASES = {
    "hips": ("Spine", "Spine1", "Spine3"),
    "spine": ("Spine3", "Chest", "Neck"),
    "chest": ("Neck",),
    "neck": ("Head",),
    "leftShoulder": ("LeftArm",),
    "leftUpperArm": ("LeftForeArm",),
    "leftLowerArm": ("LeftHand",),
    "leftFoot": ("LeftToeBase",),
    "leftToes": (),
    "rightShoulder": ("RightArm",),
    "rightUpperArm": ("RightForeArm",),
    "rightLowerArm": ("RightHand",),
    "rightFoot": ("RightToeBase",),
    "rightToes": (),
    "leftUpperLeg": ("LeftLeg",),
    "leftLowerLeg": ("LeftFoot",),
    "rightUpperLeg": ("RightLeg",),
    "rightLowerLeg": ("RightFoot",),
}

FALLBACK_REST_DIRS = {
    "hips": (0, 1, 0),
    "spine": (0, 1, 0),
    "chest": (0, 1, 0),
    "neck": (0, 1, 0),
    "leftShoulder": (-1, 0, 0),
    "leftUpperArm": (-1, 0, 0),
    "leftLowerArm": (-1, 0, 0),
    "rightShoulder": (1, 0, 0),
    "rightUpperArm": (1, 0, 0),
    "rightLowerArm": (1, 0, 0),
    "leftUpperLeg": (-0.18, -1, 0),
    "leftLowerLeg": (0, -1, 0),
    "leftFoot": (0, 0, 1),
    "leftToes": (0, 0, 1),
    "rightUpperLeg": (0.18, -1, 0),
    "rightLowerLeg": (0, -1, 0),
    "rightFoot": (0, 0, 1),
    "rightToes": (0, 0, 1),
}

FALLBACK_REST_FORWARDS = {
    "hips": (0, 0, 1),
    "spine": (0, 0, 1),
    "chest": (0, 0, 1),
    "neck": (0, 0, 1),
}

TOE_ROLL_CLEARANCE = 0.005
FOOT_CONTACT_THRESHOLD = 0.06
FOOT_ROLL_LIMIT = 0.04
TOE_FORWARD_MIN_REACH = 0.035
HAND_BONES = ("leftHand", "rightHand")
SMOOTH_BONES = {"leftLowerLeg", "leftFoot", "rightLowerLeg", "rightFoot", *HAND_BONES}
LEG_LOWER_FALLBACK_LIMIT_DEGREES = 75
LEG_UPPER_FALLBACK_LIMIT_DEGREES = 100
HIGH_KNEE_UPPER_FALLBACK_LIMIT_DEGREES = 155
HIGH_KNEE_MIN_RISE = 0.02
TORSO_PITCH_BONES = {"spine", "chest"}
TORSO_PITCH_SCALE = 0.55

TOE_PROXY_SCALE = 0.55


def finite(value, default=0.0):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


def point(landmarks, name):
    item = landmarks.get(name) or {}
    return (finite(item.get("x")), finite(item.get("y")), finite(item.get("z")))


def dict_point(p):
    return {"x": round(float(p[0]), 6), "y": round(float(p[1]), 6), "z": round(float(p[2]), 6)}


def has_point(landmarks, name):
    item = landmarks.get(name)
    return isinstance(item, dict) and any(axis in item for axis in ("x", "y", "z"))


def add_toe_proxies(landmarks):
    landmarks = dict(landmarks or {})
    for side in ("left", "right"):
        toe_name = f"{side}Toe"
        if has_point(landmarks, toe_name):
            continue
        ankle_name = f"{side}Ankle"
        foot_name = f"{side}Foot"
        if not has_point(landmarks, ankle_name) or not has_point(landmarks, foot_name):
            continue
        ankle = point(landmarks, ankle_name)
        foot = point(landmarks, foot_name)
        direction = sub(foot, ankle)
        if length(direction) <= 0.000001:
            continue
        # ponytail: GVHMR minimal joints have no toe; this gives VRM toe bone a stable shoe-tip target.
        landmarks[toe_name] = dict_point((
            foot[0] + direction[0] * TOE_PROXY_SCALE,
            foot[1] + direction[1] * TOE_PROXY_SCALE,
            foot[2] + direction[2] * TOE_PROXY_SCALE,
        ))
    return landmarks


def clamp_toe_roll_landmarks(landmarks):
    landmarks = dict(landmarks or {})
    for side in ("left", "right"):
        foot_name = f"{side}Foot"
        toe_name = f"{side}Toe"
        if not has_point(landmarks, foot_name) or not has_point(landmarks, toe_name):
            continue
        foot = point(landmarks, foot_name)
        toe = point(landmarks, toe_name)
        min_y = foot[1] - TOE_ROLL_CLEARANCE
        if toe[1] < min_y:
            # ponytail: cheap anti-ballet clamp; proper fix is contact-aware heel/toe IK.
            landmarks[toe_name] = {**landmarks[toe_name], "y": round(min_y, 6)}
    return landmarks


def median(values):
    values = sorted(values)
    if not values:
        return 0.0
    middle = len(values) // 2
    if len(values) % 2:
        return values[middle]
    return (values[middle - 1] + values[middle]) / 2


def estimate_ground_y(frames):
    values = []
    for frame in frames:
        landmarks = frame.get("landmarks") or {}
        for name in ("leftFoot", "leftToe", "rightFoot", "rightToe"):
            if has_point(landmarks, name):
                values.append(point(landmarks, name)[1])
    return median(values)


def stabilize_foot_contact_landmarks(landmarks, ground_y):
    landmarks = dict(landmarks or {})
    for side in ("left", "right"):
        foot_name = f"{side}Foot"
        toe_name = f"{side}Toe"
        if not has_point(landmarks, foot_name) or not has_point(landmarks, toe_name):
            continue
        foot = list(point(landmarks, foot_name))
        toe = list(point(landmarks, toe_name))
        foot[1] = max(foot[1], ground_y)
        toe[1] = max(toe[1], ground_y)
        if min(foot[1], toe[1]) <= ground_y + FOOT_CONTACT_THRESHOLD:
            # ponytail: contact foot is flattened; add real heel joints only if this becomes visibly too stiff.
            foot[1] = ground_y
            toe[1] = ground_y
        elif toe[1] > foot[1] + FOOT_ROLL_LIMIT:
            toe[1] = foot[1] + FOOT_ROLL_LIMIT
        elif toe[1] < foot[1] - FOOT_ROLL_LIMIT:
            toe[1] = foot[1] - FOOT_ROLL_LIMIT
        landmarks[foot_name] = {**landmarks[foot_name], "y": round(foot[1], 6)}
        landmarks[toe_name] = {**landmarks[toe_name], "y": round(toe[1], 6)}
    return face_toes_forward_landmarks(landmarks)


def face_toes_forward_landmarks(landmarks):
    landmarks = dict(landmarks or {})
    forward_z = ALICIA_FORWARD_XZ[1]
    if abs(forward_z) <= 0.000001:
        return landmarks
    for side in ("left", "right"):
        foot_name = f"{side}Foot"
        toe_name = f"{side}Toe"
        if not has_point(landmarks, foot_name) or not has_point(landmarks, toe_name):
            continue
        foot = point(landmarks, foot_name)
        toe = list(point(landmarks, toe_name))
        toe_forward = (toe[2] - foot[2]) * forward_z
        if toe_forward <= 0.000001:
            reach = max(abs(toe[2] - foot[2]), TOE_FORWARD_MIN_REACH)
            toe[2] = foot[2] + forward_z * reach
            landmarks[toe_name] = {**landmarks[toe_name], "z": round(toe[2], 6)}
    return landmarks


def stabilize_foot_contact_frames(frames):
    ground_y = estimate_ground_y(frames)
    return [
        {**frame, "landmarks": stabilize_foot_contact_landmarks(frame.get("landmarks") or {}, ground_y)}
        for frame in frames
    ]


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def length(v):
    return math.sqrt(dot(v, v))


def normalize(v):
    size = length(v)
    if size <= 0.000001:
        return (0.0, 1.0, 0.0)
    return (v[0] / size, v[1] / size, v[2] / size)


def project_on_plane(v, normal):
    normal = normalize(normal)
    return sub(v, (normal[0] * dot(v, normal), normal[1] * dot(v, normal), normal[2] * dot(v, normal)))


def quat_between(a, b):
    a = normalize(a)
    b = normalize(b)
    d = max(-1.0, min(1.0, dot(a, b)))
    if d > 0.999999:
        return (0.0, 0.0, 0.0, 1.0)
    if d < -0.999999:
        axis = normalize(cross(a, (1.0, 0.0, 0.0)))
        if length(axis) <= 0.000001:
            axis = normalize(cross(a, (0.0, 1.0, 0.0)))
        return (axis[0], axis[1], axis[2], 0.0)
    axis = cross(a, b)
    q = (axis[0], axis[1], axis[2], 1.0 + d)
    return normalize_quat(q)


def quat_mul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return normalize_quat((
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ))


def quat_conjugate(q):
    return (-q[0], -q[1], -q[2], q[3])


def quat_dot(a, b):
    return sum(float(a[i]) * float(b[i]) for i in range(4))


def align_quat_to(q, reference):
    return [-float(item) for item in q] if quat_dot(q, reference) < 0 else [float(item) for item in q]


def smooth_quat_keys(keys):
    if len(keys) < 3:
        return [dict(key) for key in keys]
    smoothed = [dict(keys[0])]
    for index in range(1, len(keys) - 1):
        current = [float(item) for item in keys[index]["rot"]]
        prev = align_quat_to(keys[index - 1]["rot"], current)
        nxt = align_quat_to(keys[index + 1]["rot"], current)
        rot = normalize_quat(tuple(prev[i] * 0.2 + current[i] * 0.6 + nxt[i] * 0.2 for i in range(4)))
        smoothed.append({**keys[index], "rot": list(rot)})
    smoothed.append(dict(keys[-1]))
    return smoothed


def smooth_motion_bones(bones):
    return {
        name: smooth_quat_keys(keys) if name in SMOOTH_BONES else keys
        for name, keys in bones.items()
    }


def rotate_vec(q, v):
    qv = (v[0], v[1], v[2], 0.0)
    rotated = quat_mul(quat_mul(q, qv), quat_conjugate(q))
    return (rotated[0], rotated[1], rotated[2])


def torso_forward(landmarks):
    up = sub(point(landmarks, "neck"), point(landmarks, "chest"))
    side = sub(point(landmarks, "rightShoulder"), point(landmarks, "leftShoulder"))
    forward = cross(side, up)
    return normalize(forward) if length(forward) > 0.000001 else None


def rotate_y(point_value, center, degrees):
    radians = math.radians(degrees)
    cos_v = math.cos(radians)
    sin_v = math.sin(radians)
    px = point_value[0] - center[0]
    pz = point_value[2] - center[2]
    return (
        center[0] + px * cos_v - pz * sin_v,
        point_value[1],
        center[2] + px * sin_v + pz * cos_v,
    )


def normalize_quat(q):
    size = math.sqrt(sum(float(v) * float(v) for v in q)) or 1.0
    return tuple(round(float(v) / size, 6) for v in q)


def quat_from_euler_degrees(x, y, z):
    rx, ry, rz = (math.radians(float(v)) / 2 for v in (x, y, z))
    sx, cx = math.sin(rx), math.cos(rx)
    sy, cy = math.sin(ry), math.cos(ry)
    sz, cz = math.sin(rz), math.cos(rz)
    return normalize_quat((
        sx * cy * cz + cx * sy * sz,
        cx * sy * cz - sx * cy * sz,
        cx * cy * sz + sx * sy * cz,
        cx * cy * cz - sx * sy * sz,
    ))


def damp_torso_pitch_quat(bone_name, quat):
    if bone_name not in TORSO_PITCH_BONES:
        return quat
    # Alicia 的身形會放大 SMPL/GVHMR 的軀幹後仰感，壓低 X pitch 避免走路挺肚子。
    return normalize_quat((quat[0] * TORSO_PITCH_SCALE, quat[1], quat[2], quat[3]))


def quat_angle_degrees(q):
    w = max(-1.0, min(1.0, float(q[3])))
    return math.degrees(2 * math.acos(abs(w)))


def is_high_knee_pose(landmarks, side):
    if not has_point(landmarks, "hips") or not has_point(landmarks, f"{side}Knee"):
        return False
    hips = point(landmarks, "hips")
    knee = point(landmarks, f"{side}Knee")
    return knee[1] >= hips[1] + HIGH_KNEE_MIN_RISE


def should_use_base_leg_pose(lower_quat, upper_quat, landmarks, side):
    if not lower_quat or not upper_quat:
        return True
    upper_limit = (
        HIGH_KNEE_UPPER_FALLBACK_LIMIT_DEGREES
        if is_high_knee_pose(landmarks, side)
        else LEG_UPPER_FALLBACK_LIMIT_DEGREES
    )
    return (
        quat_angle_degrees(lower_quat) > LEG_LOWER_FALLBACK_LIMIT_DEGREES
        or quat_angle_degrees(upper_quat) > upper_limit
    )


def should_use_direct_lifted_leg_pose(landmarks, side):
    return is_high_knee_pose(landmarks, side)


def clamp(value, low, high):
    return max(low, min(high, value))


def infer_hand_pose(landmarks, side):
    elbow_name = f"{side}Elbow"
    wrist_name = f"{side}Wrist"
    shoulder_name = f"{side}Shoulder"
    if not has_point(landmarks, elbow_name) or not has_point(landmarks, wrist_name):
        return None
    elbow = point(landmarks, elbow_name)
    wrist = point(landmarks, wrist_name)
    forearm = normalize(sub(wrist, elbow))
    shoulder_y = point(landmarks, shoulder_name)[1] if has_point(landmarks, shoulder_name) else wrist[1]
    gesture = "open" if wrist[1] > shoulder_y + 0.03 else "relaxed"
    finger_curl = 0.15 if gesture == "open" else 0.45
    side_sign = -1 if side == "left" else 1
    palm_pitch = clamp(-forearm[1] * 24, -28, 28)
    palm_yaw = clamp(forearm[2] * 22, -22, 22)
    palm_roll = clamp(side_sign * (8 + abs(forearm[0]) * 10), -24, 24)
    # ponytail: GVHMR has no fingers; this is a wrist/palm proxy until a real hand detector is wired in.
    return {
        "confidence": 0.66,
        "gesture": gesture,
        "palmPitch": round(palm_pitch, 3),
        "palmYaw": round(palm_yaw, 3),
        "palmRoll": round(palm_roll, 3),
        "fingerCurl": finger_curl,
        "source": "forearm_proxy",
    }


def hand_pose_quat(hand_pose):
    curl = float(hand_pose.get("fingerCurl", 0.45))
    return quat_from_euler_degrees(
        float(hand_pose.get("palmPitch", 0)) + curl * 5,
        float(hand_pose.get("palmYaw", 0)),
        float(hand_pose.get("palmRoll", 0)),
    )


def load_hand_pose_frames(path):
    if not path:
        return []
    hand_path = Path(path)
    if not hand_path.is_file():
        return []
    payload = json.loads(hand_path.read_text(encoding="utf-8"))
    return payload.get("frames") or []


def external_hand_pose_for_frame(hand_frames, index, time_ms, side):
    if not hand_frames:
        return None
    if index < len(hand_frames):
        frame = hand_frames[index]
    else:
        frame = min(
            hand_frames,
            key=lambda item: abs(frame_time_ms(item, index, 30) - time_ms),
        )
    pose = frame.get(side) if isinstance(frame, dict) else None
    if not isinstance(pose, dict):
        return None
    if pose.get("source") == "pass" and "fingerCurl" not in pose:
        return None
    return dict(pose)


def estimate_source_forward_xz(landmarks):
    left = point(landmarks, "leftShoulder")
    right = point(landmarks, "rightShoulder")
    side_x = right[0] - left[0]
    side_z = right[2] - left[2]
    size = math.hypot(side_x, side_z)
    if size <= 0.000001:
        return ALICIA_FORWARD_XZ
    side_x /= size
    side_z /= size
    forward = (-side_z, side_x)
    forward_size = math.hypot(forward[0], forward[1]) or 1.0
    return (round(forward[0] / forward_size, 6), round(forward[1] / forward_size, 6))


def facing_yaw_correction_degrees(source_forward):
    return round(math.degrees(math.atan2(source_forward[0], source_forward[1])), 6)


def normalize_payload_facing(payload):
    frames = [frame for frame in payload.get("frames", []) if frame.get("landmarks")]
    if not frames:
        return payload, {
            "sourceForward": {"x": 0.0, "z": 1.0},
            "targetForward": {"x": 0.0, "z": 1.0},
            "yawCorrectionDegrees": 0.0,
        }

    first_landmarks = frames[0]["landmarks"]
    source_forward = estimate_source_forward_xz(first_landmarks)
    yaw_degrees = facing_yaw_correction_degrees(source_forward)
    center = point(first_landmarks, "hips")
    normalized_frames = []

    for frame in payload.get("frames", []):
        landmarks = frame.get("landmarks")
        if not landmarks:
            normalized_frames.append(frame)
            continue
        landmarks = clamp_toe_roll_landmarks(add_toe_proxies(landmarks))
        normalized_landmarks = {}
        for name, item in landmarks.items():
            rotated = rotate_y(point(landmarks, name), center, yaw_degrees)
            normalized_landmarks[name] = dict_point(rotated)
            if isinstance(item, dict) and "visibility" in item:
                normalized_landmarks[name]["visibility"] = item["visibility"]
        normalized_frames.append({**frame, "landmarks": normalized_landmarks})

    normalized_frames = stabilize_foot_contact_frames(normalized_frames)
    alignment = {
        "sourceForward": {"x": source_forward[0], "z": source_forward[1]},
        "targetForward": {"x": ALICIA_FORWARD_XZ[0], "z": ALICIA_FORWARD_XZ[1]},
        "yawCorrectionDegrees": yaw_degrees,
    }
    return {**payload, "frames": normalized_frames}, alignment


def frame_time_ms(frame, index, fps):
    if "timeMs" in frame:
        return int(round(finite(frame.get("timeMs"))))
    if "time_ms" in frame:
        return int(round(finite(frame.get("time_ms"))))
    if "t" in frame:
        return int(round(finite(frame.get("t")) * 1000))
    return int(round(index * 1000 / fps))


def find_pose_bone(armature, name):
    if not armature:
        return None
    for alias in BONE_ALIASES.get(name, (name,)):
        bone = armature.pose.bones.get(alias)
        if bone:
            return bone
    return None


def blender_rest_dirs(armature):
    dirs = {}
    if not armature:
        return dirs
    for name in BONE_CHAINS:
        bone = find_pose_bone(armature, name)
        if not bone:
            continue
        child = None
        for alias in REST_CHILD_ALIASES.get(name, ()):
            child = armature.pose.bones.get(alias)
            if child:
                break
        if child:
            dirs[name] = normalize(tuple(child.bone.head_local - bone.bone.head_local))
        else:
            dirs[name] = normalize(tuple(bone.bone.tail_local - bone.bone.head_local))
    return dirs


def pose_bone_name(armature, name):
    bone = find_pose_bone(armature, name)
    return bone.name if bone else None


def bone_quat(landmarks, bone_name, rest_dirs, parent_world_quat=None):
    start_name, end_name = BONE_CHAINS[bone_name]
    # ponytail: hips is the root yaw carrier; torso pitch belongs to spine/chest.
    target = FALLBACK_REST_DIRS["hips"] if bone_name == "hips" else sub(point(landmarks, end_name), point(landmarks, start_name))
    if length(target) <= 0.000001:
        return None
    if parent_world_quat:
        target = rotate_vec(quat_conjugate(parent_world_quat), normalize(target))
    rest = rest_dirs.get(bone_name) or FALLBACK_REST_DIRS[bone_name]
    base_quat = quat_between(rest, target)
    rest_forward = FALLBACK_REST_FORWARDS.get(bone_name)
    desired_forward = torso_forward(landmarks) if rest_forward else None
    if desired_forward:
        if parent_world_quat:
            desired_forward = rotate_vec(quat_conjugate(parent_world_quat), desired_forward)
        # ponytail: shoulder plane gives chest/head twist; no face landmark means no independent gaze yet.
        current_forward = project_on_plane(rotate_vec(base_quat, rest_forward), target)
        desired_forward = project_on_plane(desired_forward, target)
        if length(current_forward) > 0.000001 and length(desired_forward) > 0.000001:
            return damp_torso_pitch_quat(
                bone_name,
                normalize_quat(quat_mul(quat_between(current_forward, desired_forward), base_quat)),
            )
    return damp_torso_pitch_quat(bone_name, normalize_quat(base_quat))


def build_blender_space_mapper(frames, armature):
    from mathutils import Vector

    first = frames[0]["landmarks"]
    hips_bone = find_pose_bone(armature, "hips")
    left_foot = find_pose_bone(armature, "leftFoot")
    right_foot = find_pose_bone(armature, "rightFoot")
    rest_hips = hips_bone.bone.head_local if hips_bone else Vector((0, 0, 1))
    rest_left = left_foot.bone.head_local if left_foot else Vector((-0.05, 0, 0))
    rest_right = right_foot.bone.head_local if right_foot else Vector((0.05, 0, 0))

    source_hips = point(first, "hips")
    source_left = point(first, "leftAnkle")
    source_right = point(first, "rightAnkle")
    source_leg = (length(sub(source_left, source_hips)) + length(sub(source_right, source_hips))) / 2
    rest_leg = ((rest_left - rest_hips).length + (rest_right - rest_hips).length) / 2
    scale = rest_leg / max(0.0001, source_leg)

    def raw(p):
        # GVHMR landmarks are Y-up; Blender is Z-up.
        return Vector((p[0] * scale, -p[2] * scale, p[1] * scale))

    offset = rest_hips - raw(source_hips)

    def convert(name_or_point, landmarks=None):
        p = point(landmarks, name_or_point) if landmarks is not None else name_or_point
        return raw(p) + offset

    def convert_relative_to_hips(name, landmarks):
        return rest_hips + raw(sub(point(landmarks, name), point(landmarks, "hips")))

    return convert, convert_relative_to_hips


def retip_edit_bones_for_ik(armature):
    import bpy

    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    for bone_name, child_aliases in REST_CHILD_ALIASES.items():
        edit_name = pose_bone_name(armature, bone_name)
        if not edit_name or edit_name not in armature.data.edit_bones:
            continue
        child = next((armature.data.edit_bones.get(alias) for alias in child_aliases if alias in armature.data.edit_bones), None)
        if child:
            # ponytail: temporary bake rig only; real asset is untouched.
            armature.data.edit_bones[edit_name].tail = child.head
    bpy.ops.object.mode_set(mode="OBJECT")


def make_empty(name, location):
    import bpy

    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "SPHERE"
    obj.empty_display_size = 0.03
    obj.location = location
    bpy.context.collection.objects.link(obj)
    return obj


def setup_leg_ik(armature, convert, first_landmarks):
    targets = {}
    for side in ("left", "right"):
        lower = find_pose_bone(armature, f"{side}LowerLeg")
        if not lower:
            continue
        target = make_empty(f"{side}_ankle_ik_target", convert(f"{side}Ankle", first_landmarks))
        pole = make_empty(f"{side}_knee_ik_pole", convert(f"{side}Knee", first_landmarks))
        constraint = lower.constraints.new(type="IK")
        constraint.name = "GVHMR foot lock"
        constraint.target = target
        constraint.pole_target = pole
        constraint.chain_count = 2
        constraint.use_rotation = True
        targets[side] = {"target": target, "pole": pole}
    return targets


def sample_visual_local_quat(armature, bone_name):
    bone = find_pose_bone(armature, bone_name)
    if not bone:
        return None
    matrix = armature.convert_space(
        pose_bone=bone,
        matrix=bone.matrix,
        from_space="POSE",
        to_space="LOCAL",
    )
    q = matrix.to_quaternion()
    return normalize_quat((q.x, q.y, q.z, q.w))


def set_direct_upper_body_pose(armature, landmarks, rest_dirs):
    for bone_name in BONE_CHAINS:
        if "Leg" in bone_name or bone_name.endswith("Foot"):
            continue
        bone = find_pose_bone(armature, bone_name)
        quat = bone_quat(landmarks, bone_name, rest_dirs)
        if bone and quat:
            bone.rotation_mode = "QUATERNION"
            bone.rotation_quaternion = (quat[3], quat[0], quat[1], quat[2])


def reset_pose(armature):
    for bone in armature.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.rotation_quaternion = (1, 0, 0, 0)
        bone.location = (0, 0, 0)
        bone.scale = (1, 1, 1)


def build_animation_with_blender_ik(payload, fps, armature, facing_alignment, hand_frames=None):
    import bpy

    frames = [frame for frame in payload.get("frames", []) if frame.get("landmarks")]
    if not frames:
        raise ValueError("no landmark frames to bake")

    foot_rest_dirs = {
        name: direction
        for name, direction in blender_rest_dirs(armature).items()
        if name.endswith("Foot") or name.endswith("Toes")
    }
    base_animation = build_animation_core(
        payload,
        fps,
        facing_alignment,
        rest_dirs=foot_rest_dirs,
        smooth=False,
        hand_frames=hand_frames,
    )
    retip_edit_bones_for_ik(armature)
    convert, convert_relative_to_hips = build_blender_space_mapper(frames, armature)
    targets = setup_leg_ik(armature, convert_relative_to_hips, frames[0]["landmarks"])
    bones = {
        name: [dict(key) for key in keys]
        for name, keys in base_animation["bones"].items()
    }
    leg_bones = {
        "leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes",
        "rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes",
    }
    for bone_name in leg_bones:
        bones[bone_name] = []

    for index, frame in enumerate(frames):
        landmarks = frame["landmarks"]
        time_ms = frame_time_ms(frame, index, fps)
        reset_pose(armature)
        for side, item in targets.items():
            item["target"].location = convert_relative_to_hips(f"{side}Ankle", landmarks)
            item["pole"].location = convert_relative_to_hips(f"{side}Knee", landmarks)

        bpy.context.view_layer.update()

        for side in ("left", "right"):
            side_bones = [f"{side}UpperLeg", f"{side}LowerLeg"]
            foot_bone = f"{side}Foot"
            toe_bone = f"{side}Toes"
            candidate = {
                bone_name: sample_visual_local_quat(armature, bone_name)
                for bone_name in side_bones
            }
            lower = candidate.get(f"{side}LowerLeg")
            upper = candidate.get(f"{side}UpperLeg")
            use_direct_lifted_leg = should_use_direct_lifted_leg_pose(landmarks, side)
            use_base = should_use_base_leg_pose(lower, upper, landmarks, side)
            for bone_name in side_bones:
                if use_direct_lifted_leg or use_base:
                    bones[bone_name].append(dict(base_animation["bones"][bone_name][index]))
                elif candidate.get(bone_name):
                    bones[bone_name].append({"time_ms": time_ms, "rot": list(candidate[bone_name])})
            for bone_name in (foot_bone, toe_bone):
                quat = sample_visual_local_quat(armature, bone_name)
                if quat:
                    # ponytail: IK already solved the leg; keep the shoe/toe near VRM rest to avoid tiptoe.
                    bones[bone_name].append({"time_ms": time_ms, "rot": list(quat)})
                elif index < len(base_animation["bones"].get(bone_name, [])):
                    bones[bone_name].append(dict(base_animation["bones"][bone_name][index]))

    bones = smooth_motion_bones({name: keys for name, keys in bones.items() if keys})
    return {
        **base_animation,
        "retarget_mode": "blender_ik_foot_lock",
        "name": "gvhmr_alicia_blender_ik_bake",
        "bones": bones,
        "ik": {"leftFoot": "locked", "rightFoot": "locked"},
    }


def build_animation_from_landmarks(payload, fps=30, armature=None, hand_frames=None):
    payload, facing_alignment = normalize_payload_facing(payload)
    if armature:
        return build_animation_with_blender_ik(payload, fps, armature, facing_alignment, hand_frames=hand_frames)
    return build_animation_core(payload, fps, facing_alignment, hand_frames=hand_frames)


def build_animation_core(payload, fps, facing_alignment, rest_dirs=None, smooth=True, hand_frames=None):
    frames = [frame for frame in payload.get("frames", []) if frame.get("landmarks")]
    if not frames:
        raise ValueError("no landmark frames to bake")

    rest_dirs = rest_dirs or {}
    bones = {name: [] for name in list(BONE_CHAINS) + list(HAND_BONES)}
    hand_poses = {"left": [], "right": []}
    hips_position = []
    first_hips = point(frames[0]["landmarks"], "hips")

    for index, frame in enumerate(frames):
        landmarks = frame["landmarks"]
        time_ms = frame_time_ms(frame, index, fps)
        hips = point(landmarks, "hips")
        hips_position.append({
            "time_ms": time_ms,
            "pos": [
                round((hips[0] - first_hips[0]) * 0.08, 6),
                round((hips[1] - first_hips[1]) * 0.08, 6),
                round((hips[2] - first_hips[2]) * 0.08, 6),
            ],
        })
        world_quats = {}
        for bone_name in BONE_CHAINS:
            parent_name = BONE_PARENTS[bone_name]
            parent_world_quat = world_quats.get(parent_name)
            quat = bone_quat(landmarks, bone_name, rest_dirs, parent_world_quat)
            if quat:
                world_quats[bone_name] = quat_mul(parent_world_quat, quat) if parent_world_quat else quat
                bones[bone_name].append({"time_ms": time_ms, "rot": list(quat)})
        for side in ("left", "right"):
            hand_pose = external_hand_pose_for_frame(hand_frames, index, time_ms, side)
            if not hand_pose:
                hand_pose = infer_hand_pose(landmarks, side)
            if hand_pose:
                hand_poses[side].append({"time_ms": time_ms, **hand_pose})
                bones[f"{side}Hand"].append({"time_ms": time_ms, "rot": list(hand_pose_quat(hand_pose))})

    bones = {name: keys for name, keys in bones.items() if keys}
    hand_poses = {side: keys for side, keys in hand_poses.items() if keys}
    if smooth:
        bones = smooth_motion_bones(bones)
    duration_ms = max(item["time_ms"] for item in hips_position)
    return {
        "version": 1,
        "source": "gvhmr_blender_bake",
        "retarget_mode": "blender_ik_foot_lock",
        "name": "gvhmr_alicia_blender_ik_bake",
        "fps": fps,
        "duration_ms": duration_ms,
        "bones": bones,
        "hips_position": hips_position,
        "hand_poses": hand_poses,
        "frame_count": len(frames),
        "ik": {"leftFoot": "locked", "rightFoot": "locked"},
        "facing_alignment": facing_alignment,
    }


def import_alicia_armature(model_path):
    import bpy

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    bpy.ops.import_scene.gltf(filepath=str(model_path))
    for obj in bpy.context.scene.objects:
        if obj.type == "ARMATURE":
            return obj
    return None


def main():
    parser = argparse.ArgumentParser(description="Bake GVHMR Alicia landmarks through Blender rest directions.")
    parser.add_argument("--input-json", required=True)
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--model", default="models/mascot.vrm")
    parser.add_argument("--fps", type=float, default=30.0)
    parser.add_argument("--hand-json", default="")
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else None
    args = parser.parse_args(argv)

    input_path = Path(args.input_json)
    output_path = Path(args.output_json)
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    hand_frames = load_hand_pose_frames(args.hand_json)
    armature = import_alicia_armature(Path(args.model))
    animation = build_animation_from_landmarks(payload, fps=args.fps, armature=armature, hand_frames=hand_frames)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(animation, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    print(f"wrote {output_path}")


if __name__ == "__main__":
    main()
