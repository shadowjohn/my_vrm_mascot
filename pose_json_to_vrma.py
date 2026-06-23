import argparse
import json
import struct
from pathlib import Path


GLB_MAGIC = 0x46546C67
GLB_JSON = 0x4E4F534A
GLB_BIN = 0x004E4942

VRM_BONES = [
    "hips", "spine", "chest", "upperChest", "neck", "head",
    "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
    "leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes",
    "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
    "rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes",
]

for side in ("left", "right"):
    for finger in ("Thumb", "Index", "Middle", "Ring", "Little"):
        for part in ("Proximal", "Intermediate", "Distal"):
            VRM_BONES.append(f"{side}{finger}{part}")


def _pad4(data, pad=b"\0"):
    return data + pad * ((4 - len(data) % 4) % 4)


def _load_pose(value):
    if isinstance(value, (str, Path)):
        return json.loads(Path(value).read_text(encoding="utf-8"))
    return value


def _time_ms(key):
    return int(round(float(key.get("time_ms", key.get("timeMs", 0)))))


def _flip_vrm0_quat(quat):
    x, y, z, w = [float(v) for v in quat[:4]]
    return [-x, y, -z, w]


def _flip_vrm0_pos(pos):
    x, y, z = [float(v) for v in pos[:3]]
    return [-x, y, -z]


def _pack_accessor(blob, values, accessor_type):
    flat = []
    for value in values:
        if isinstance(value, (list, tuple)):
            flat.extend(float(v) for v in value)
        else:
            flat.append(float(value))
    offset = len(blob)
    packed = struct.pack("<" + "f" * len(flat), *flat)
    blob.extend(packed)
    byte_length = len(packed)
    blob.extend(b"\0" * ((4 - len(blob) % 4) % 4))
    return {
        "bufferView": {"buffer": 0, "byteOffset": offset, "byteLength": byte_length},
        "accessor": {
            "componentType": 5126,
            "count": len(values),
            "type": accessor_type,
        },
    }


def _add_track(gltf, blob, node_index, path, keys, value_getter):
    keys = sorted(keys, key=_time_ms)
    if not keys:
        return False
    times = [_time_ms(key) / 1000 for key in keys]
    values = [value_getter(key) for key in keys]
    time_ref = _pack_accessor(blob, times, "SCALAR")
    value_ref = _pack_accessor(blob, values, "VEC4" if path == "rotation" else "VEC3")
    time_accessor = len(gltf["accessors"])
    gltf["bufferViews"].append(time_ref["bufferView"])
    gltf["accessors"].append(time_ref["accessor"] | {"bufferView": len(gltf["bufferViews"]) - 1})
    value_accessor = len(gltf["accessors"])
    gltf["bufferViews"].append(value_ref["bufferView"])
    gltf["accessors"].append(value_ref["accessor"] | {"bufferView": len(gltf["bufferViews"]) - 1})
    sampler = len(gltf["animations"][0]["samplers"])
    gltf["animations"][0]["samplers"].append({
        "input": time_accessor,
        "output": value_accessor,
        "interpolation": "LINEAR",
    })
    gltf["animations"][0]["channels"].append({
        "sampler": sampler,
        "target": {"node": node_index, "path": path},
    })
    return True


def convert_pose_json_to_vrma(pose_json, output_path):
    pose = _load_pose(pose_json)
    
    # 找出所有訊號點中的最小時間點，將時間軸對齊至 0 秒起點
    min_time_ms = None
    for bone, keys in (pose.get("bones") or {}).items():
        for key in keys:
            t = _time_ms(key)
            if min_time_ms is None or t < min_time_ms:
                min_time_ms = t
    if pose.get("hips_position"):
        for key in pose["hips_position"]:
            t = _time_ms(key)
            if min_time_ms is None or t < min_time_ms:
                min_time_ms = t

    if min_time_ms is not None and min_time_ms > 0:
        for bone, keys in (pose.get("bones") or {}).items():
            for key in keys:
                for key_name in ("time_ms", "timeMs"):
                    if key_name in key:
                        key[key_name] = max(0, _time_ms(key) - min_time_ms)
        if pose.get("hips_position"):
            for key in pose["hips_position"]:
                for key_name in ("time_ms", "timeMs"):
                    if key_name in key:
                        key[key_name] = max(0, _time_ms(key) - min_time_ms)
        if "duration_ms" in pose:
            pose["duration_ms"] = max(0, int(pose["duration_ms"]) - min_time_ms)

    output_path = Path(output_path)
    animated = set((pose.get("bones") or {}).keys())
    if pose.get("hips_position"):
        animated.add("hips")
    bone_names = [bone for bone in VRM_BONES if bone in animated]
    if not bone_names:
        raise ValueError("pose_json has no VRM bone animation")

    node_index = {bone: index for index, bone in enumerate(bone_names)}
    gltf = {
        "asset": {"version": "2.0", "generator": "Alicia Pose JSON to VRMA"},
        "extensionsUsed": ["VRMC_vrm_animation"],
        "extensions": {
            "VRMC_vrm_animation": {
                "specVersion": "1.0",
                "humanoid": {
                    "humanBones": {bone: {"node": node_index[bone]} for bone in bone_names},
                },
            },
        },
        "nodes": [{"name": bone} for bone in bone_names],
        "scenes": [{"nodes": list(range(len(bone_names)))}],
        "scene": 0,
        "buffers": [{"byteLength": 0}],
        "bufferViews": [],
        "accessors": [],
        "animations": [{
            "name": str(pose.get("name") or "alicia_pose"),
            "samplers": [],
            "channels": [],
        }],
    }
    blob = bytearray()
    channels = 0
    for bone, keys in (pose.get("bones") or {}).items():
        if bone not in node_index:
            continue
        channels += int(_add_track(
            gltf, blob, node_index[bone], "rotation", keys,
            lambda key: _flip_vrm0_quat(key.get("rot") or key.get("rotation") or [0, 0, 0, 1]),
        ))
    if "hips" in node_index and pose.get("hips_position"):
        channels += int(_add_track(
            gltf, blob, node_index["hips"], "translation", pose["hips_position"],
            lambda key: _flip_vrm0_pos(key.get("pos") or key.get("position") or [0, 0, 0]),
        ))
    if not channels:
        raise ValueError("pose_json has no exportable animation channels")

    gltf["buffers"][0]["byteLength"] = len(blob)
    json_chunk = _pad4(json.dumps(gltf, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), b" ")
    bin_chunk = _pad4(bytes(blob), b"\0")
    total_len = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(
        struct.pack("<III", GLB_MAGIC, 2, total_len)
        + struct.pack("<II", len(json_chunk), GLB_JSON)
        + json_chunk
        + struct.pack("<II", len(bin_chunk), GLB_BIN)
        + bin_chunk
    )
    return {
        "output": output_path.as_posix(),
        "channels": channels,
        "bones": len(bone_names),
        "duration_ms": int(pose.get("duration_ms") or 0),
    }


def main():
    parser = argparse.ArgumentParser(description="Convert Alicia pose_json to animation-only VRMA/GLB.")
    parser.add_argument("pose_json")
    parser.add_argument("output_path")
    args = parser.parse_args()
    print(json.dumps(convert_pose_json_to_vrma(args.pose_json, args.output_path), ensure_ascii=False))


if __name__ == "__main__":
    main()
