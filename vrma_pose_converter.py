import argparse
import json
import re
import struct
from pathlib import Path


GLB_MAGIC = 0x46546C67
GLB_JSON = 0x4E4F534A
GLB_BIN = 0x004E4942
COMPONENT_FLOAT = 5126
TYPE_COUNTS = {
    "SCALAR": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
}
TARGET_META_VERSION = "0"

VRM_BONES = [
    "hips",
    "spine",
    "chest",
    "upperChest",
    "neck",
    "head",
    "leftShoulder",
    "leftUpperArm",
    "leftLowerArm",
    "leftHand",
    "leftUpperLeg",
    "leftLowerLeg",
    "leftFoot",
    "leftToes",
    "rightShoulder",
    "rightUpperArm",
    "rightLowerArm",
    "rightHand",
    "rightUpperLeg",
    "rightLowerLeg",
    "rightFoot",
    "rightToes",
]

for side in ("left", "right"):
    for finger in ("Thumb", "Index", "Middle", "Ring", "Little"):
        for part in ("Proximal", "Intermediate", "Distal"):
            VRM_BONES.append(f"{side}{finger}{part}")

BONE_ALIASES = {re.sub(r"[^a-z0-9]", "", bone.lower()): bone for bone in VRM_BONES}


def _read_glb(path):
    data = Path(path).read_bytes()
    if len(data) < 20:
        raise ValueError("VRMA/GLB file is too small")
    magic, version, declared_length = struct.unpack_from("<III", data, 0)
    if magic != GLB_MAGIC:
        raise ValueError("Only binary GLB/VRMA files are supported")
    if version != 2:
        raise ValueError(f"Unsupported glTF version: {version}")
    if declared_length > len(data):
        raise ValueError("GLB length header is larger than file size")

    json_chunk = None
    bin_chunk = b""
    offset = 12
    while offset + 8 <= declared_length:
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset:offset + chunk_length]
        offset += chunk_length
        if chunk_type == GLB_JSON:
            json_chunk = chunk
        elif chunk_type == GLB_BIN:
            bin_chunk = chunk
    if json_chunk is None:
        raise ValueError("GLB JSON chunk not found")
    return json.loads(json_chunk.decode("utf-8")), bin_chunk


def _clean_name(name):
    tail = str(name or "").replace("\\", "/").split("/")[-1].split(":")[-1]
    return re.sub(r"[^a-z0-9]", "", tail.lower())


def _map_bone_name(node_name):
    clean = _clean_name(node_name)
    if clean in BONE_ALIASES:
        return BONE_ALIASES[clean]
    for alias, bone in BONE_ALIASES.items():
        if clean.endswith(alias):
            return bone
    return None


def _read_accessor(gltf, bin_chunk, accessor_index):
    accessors = gltf.get("accessors") or []
    buffer_views = gltf.get("bufferViews") or []
    accessor = accessors[int(accessor_index)]
    if accessor.get("componentType") != COMPONENT_FLOAT:
        raise ValueError("Only FLOAT accessors are supported")
    component_count = TYPE_COUNTS.get(accessor.get("type"))
    if not component_count:
        raise ValueError(f"Unsupported accessor type: {accessor.get('type')}")

    view = buffer_views[int(accessor["bufferView"])]
    if int(view.get("buffer", 0)) != 0:
        raise ValueError("Only embedded GLB BIN buffer is supported")

    count = int(accessor.get("count") or 0)
    component_size = 4
    packed_size = component_count * component_size
    stride = int(view.get("byteStride") or packed_size)
    base_offset = int(view.get("byteOffset") or 0) + int(accessor.get("byteOffset") or 0)
    fmt = "<" + ("f" * component_count)

    values = []
    for index in range(count):
        start = base_offset + index * stride
        row = struct.unpack_from(fmt, bin_chunk, start)
        if component_count == 1:
            values.append(float(row[0]))
        else:
            values.append([float(value) for value in row])
    return values


def _round_track(values, digits=6):
    rounded = []
    for value in values:
        if isinstance(value, list):
            rounded.append([round(float(item), digits) for item in value])
        else:
            rounded.append(round(float(value), digits))
    return rounded


def _quat_multiply(a, b):
    ax, ay, az, aw = [float(value or 0) for value in a[:4]]
    bx, by, bz, bw = [float(value or 0) for value in b[:4]]
    return [
        ax * bw + aw * bx + ay * bz - az * by,
        ay * bw + aw * by + az * bx - ax * bz,
        az * bw + aw * bz + ax * by - ay * bx,
        aw * bw - ax * bx - ay * by - az * bz,
    ]


def _quat_conjugate(q):
    return [-float(q[0] or 0), -float(q[1] or 0), -float(q[2] or 0), float(q[3] if len(q) > 3 else 1)]


def _quat_normalize(q):
    length = sum(float(value or 0) ** 2 for value in q[:4]) ** 0.5 or 1
    return [float(value or 0) / length for value in q[:4]]


def _build_parent_indices(nodes):
    parents = {}
    for index, node in enumerate(nodes):
        for child in node.get("children") or []:
            parents[int(child)] = index
    return parents


def _node_world_quaternions(nodes):
    parents = _build_parent_indices(nodes)
    cache = {}

    def world_quat(index):
        index = int(index)
        if index in cache:
            return cache[index]
        local = nodes[index].get("rotation") or [0, 0, 0, 1]
        local = _quat_normalize(local)
        parent = parents.get(index)
        if parent is None:
            cache[index] = local
        else:
            cache[index] = _quat_normalize(_quat_multiply(world_quat(parent), local))
        return cache[index]

    return parents, {index: world_quat(index) for index in range(len(nodes))}


def _to_official_vrma_quat(quat, node_index, parents, world_quats):
    if not isinstance(quat, list) or len(quat) < 4:
        return quat
    parent = parents.get(int(node_index))
    parent_world = world_quats.get(parent, [0, 0, 0, 1]) if parent is not None else [0, 0, 0, 1]
    bone_world_inv = _quat_conjugate(world_quats.get(int(node_index), [0, 0, 0, 1]))
    # ponytail: mirror VRMAnimationLoaderPlugin: parentWorld * rawQuat * inverse(boneWorld).
    fixed = _quat_multiply(_quat_multiply(parent_world, quat), bone_world_inv)
    return _to_target_vrm_quat(_quat_normalize(fixed))


def _to_target_vrm_quat(quat):
    # ponytail: Alicia is VRM0; official createVRMAnimationClip flips quaternion X/Z for VRM0 targets.
    if TARGET_META_VERSION != "0":
        return [round(value, 6) for value in quat]
    return [round(-quat[0], 6), round(quat[1], 6), round(-quat[2], 6), round(quat[3], 6)]


def _to_target_vrm_position(pos):
    if TARGET_META_VERSION != "0":
        return [round(float(value), 6) for value in pos]
    return [round(-float(pos[0]), 6), round(float(pos[1]), 6), round(-float(pos[2]), 6)]


def convert_vrma_to_pose_json(vrma_path, output_path=None):
    """把 VRMA/glTF animation[0] 轉成 Alicia runtime 可直接播放的最小 pose_json。"""
    vrma_path = Path(vrma_path)
    gltf, bin_chunk = _read_glb(vrma_path)
    animations = gltf.get("animations") or []
    if not animations:
        raise ValueError("VRMA animation clip not found")

    animation = animations[0]
    nodes = gltf.get("nodes") or []
    node_parents, node_world_quats = _node_world_quaternions(nodes)
    samplers = animation.get("samplers") or []
    bones = {}
    hips_position = []
    max_time_ms = 0
    max_frame_count = 0
    converted_channels = 0

    for channel in animation.get("channels") or []:
        target = channel.get("target") or {}
        node_index = target.get("node")
        if node_index is None or int(node_index) >= len(nodes):
            continue
        bone_name = _map_bone_name(nodes[int(node_index)].get("name"))
        if not bone_name:
            continue

        path = target.get("path")
        if path not in ("rotation", "translation"):
            continue
        sampler = samplers[int(channel["sampler"])]
        times = _round_track(_read_accessor(gltf, bin_chunk, sampler["input"]), 6)
        values = _round_track(_read_accessor(gltf, bin_chunk, sampler["output"]), 6)
        count = min(len(times), len(values))
        if count == 0:
            continue
        max_frame_count = max(max_frame_count, count)
        max_time_ms = max(max_time_ms, int(round(float(times[count - 1]) * 1000)))

        if path == "rotation":
            bones[bone_name] = [
                {
                    "time_ms": int(round(float(times[index]) * 1000)),
                    "rot": _to_official_vrma_quat(values[index], node_index, node_parents, node_world_quats),
                }
                for index in range(count)
            ]
            converted_channels += 1
        elif path == "translation" and bone_name == "hips":
            base_pos = values[0] if values and isinstance(values[0], list) else [0, 0, 0]
            hips_position = [
                {
                    "time_ms": int(round(float(times[index]) * 1000)),
                    "pos": _to_target_vrm_position([float(values[index][axis]) - float(base_pos[axis]) for axis in range(3)]),
                }
                for index in range(count)
            ]
            converted_channels += 1

    if not bones and not hips_position:
        raise ValueError("No Alicia-compatible VRMA channels found")

    duration_ms = max(max_time_ms, 1)
    fps = 0
    if max_frame_count > 1 and duration_ms > 0:
        fps = round((max_frame_count - 1) * 1000 / duration_ms, 3)

    pose = {
        "version": 1,
        "source": "vrma_basic_convert",
        "retarget_mode": "vrma_official_rest_space",
        "name": vrma_path.stem,
        "frame_count": max_frame_count,
        "duration_ms": duration_ms,
        "fps": fps,
        "bones": bones,
        "hips_position": hips_position,
        "metadata": {
            "source_vrma": str(vrma_path).replace("\\", "/"),
            "animation_index": 0,
            "converted_channels": converted_channels,
            "rotation_compensation": "VRMAnimationLoaderPlugin parentWorld * raw * inverse(boneWorld)",
            "target_meta_version": TARGET_META_VERSION,
        },
    }

    if output_path:
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(pose, ensure_ascii=False, indent=2), encoding="utf-8")
    return pose


def main():
    parser = argparse.ArgumentParser(description="Convert VRMA animation clip to Alicia pose_json.")
    parser.add_argument("vrma_path")
    parser.add_argument("output_path")
    args = parser.parse_args()
    pose = convert_vrma_to_pose_json(args.vrma_path, args.output_path)
    print(json.dumps({
        "ok": True,
        "output": args.output_path,
        "frame_count": pose["frame_count"],
        "duration_ms": pose["duration_ms"],
        "bones": len(pose["bones"]),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
