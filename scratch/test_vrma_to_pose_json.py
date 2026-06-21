import json
import math
import struct
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from vrma_pose_converter import convert_vrma_to_pose_json
import pose_db


def _pad4(data, pad=b" "):
    return data + pad * ((4 - len(data) % 4) % 4)


def _make_tiny_vrma(path, first_pos=(0.0, 0.0, 0.0), second_pos=(0.1, 0.2, 0.3), node_name="Hips"):
    times = struct.pack("<ff", 0.0, 1.0)
    rotations = struct.pack(
        "<ffffffff",
        0.0, 0.0, 0.0, 1.0,
        0.0, 0.7071068, 0.0, 0.7071068,
    )
    translations = struct.pack(
        "<ffffff",
        *first_pos,
        *second_pos,
    )
    blob = times + rotations + translations
    gltf = {
        "asset": {"version": "2.0"},
        "buffers": [{"byteLength": len(blob)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(times)},
            {"buffer": 0, "byteOffset": len(times), "byteLength": len(rotations)},
            {"buffer": 0, "byteOffset": len(times) + len(rotations), "byteLength": len(translations)},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 2, "type": "SCALAR"},
            {"bufferView": 1, "componentType": 5126, "count": 2, "type": "VEC4"},
            {"bufferView": 2, "componentType": 5126, "count": 2, "type": "VEC3"},
        ],
        "nodes": [{"name": node_name}],
        "animations": [{
            "samplers": [
                {"input": 0, "output": 1, "interpolation": "LINEAR"},
                {"input": 0, "output": 2, "interpolation": "LINEAR"},
            ],
            "channels": [
                {"sampler": 0, "target": {"node": 0, "path": "rotation"}},
                {"sampler": 1, "target": {"node": 0, "path": "translation"}},
            ],
        }],
    }
    json_chunk = _pad4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"))
    bin_chunk = _pad4(blob, b"\0")
    total_len = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
    path.write_bytes(
        struct.pack("<III", 0x46546C67, 2, total_len)
        + struct.pack("<II", len(json_chunk), 0x4E4F534A)
        + json_chunk
        + struct.pack("<II", len(bin_chunk), 0x004E4942)
        + bin_chunk
    )


def _make_child_rest_rotation_vrma(path):
    times = struct.pack("<ff", 0.0, 1.0)
    rotations = struct.pack(
        "<ffffffff",
        0.0, 0.0, 0.0, 1.0,
        0.0, 0.0, 0.0, 1.0,
    )
    gltf = {
        "asset": {"version": "2.0"},
        "buffers": [{"byteLength": len(times) + len(rotations)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(times)},
            {"buffer": 0, "byteOffset": len(times), "byteLength": len(rotations)},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 2, "type": "SCALAR"},
            {"bufferView": 1, "componentType": 5126, "count": 2, "type": "VEC4"},
        ],
        "nodes": [
            {"name": "LeftUpperArm", "children": [1]},
            {"name": "LeftLowerArm", "rotation": [0.0, 0.0, 0.7071068, 0.7071068]},
        ],
        "animations": [{
            "samplers": [{"input": 0, "output": 1, "interpolation": "LINEAR"}],
            "channels": [{"sampler": 0, "target": {"node": 1, "path": "rotation"}}],
        }],
    }
    blob = times + rotations
    json_chunk = _pad4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"))
    bin_chunk = _pad4(blob, b"\0")
    total_len = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
    path.write_bytes(
        struct.pack("<III", 0x46546C67, 2, total_len)
        + struct.pack("<II", len(json_chunk), 0x4E4F534A)
        + json_chunk
        + struct.pack("<II", len(bin_chunk), 0x004E4942)
        + bin_chunk
    )


def _quat_from_euler_xyz_degrees(x, y, z):
    x, y, z = [math.radians(value) / 2 for value in (x, y, z)]
    cx, sx = math.cos(x), math.sin(x)
    cy, sy = math.cos(y), math.sin(y)
    cz, sz = math.cos(z), math.sin(z)
    return [
        sx * cy * cz + cx * sy * sz,
        cx * sy * cz - sx * cy * sz,
        cx * cy * sz + sx * sy * cz,
        cx * cy * cz - sx * sy * sz,
    ]


class VrmaToPoseJsonTests(unittest.TestCase):
    def test_convert_tiny_vrma_to_alicia_pose_json(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            tmp_path = Path(temp_dir)
            vrma_path = tmp_path / "tiny.vrma"
            output_path = tmp_path / "tiny_pose.json"
            _make_tiny_vrma(vrma_path)

            pose = convert_vrma_to_pose_json(vrma_path, output_path)

            self.assertTrue(output_path.exists())
            self.assertEqual(pose["source"], "vrma_basic_convert")
            self.assertEqual(pose["frame_count"], 2)
            self.assertEqual(pose["duration_ms"], 1000)
            self.assertEqual(pose["bones"]["hips"][1]["time_ms"], 1000)
            self.assertEqual(pose["bones"]["hips"][1]["rot"], [0.0, 0.707107, 0.0, 0.707107])
            self.assertEqual(pose["hips_position"][1]["pos"], [-0.1, 0.2, -0.3])

    def test_hips_position_is_relative_to_first_key(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            tmp_path = Path(temp_dir)
            vrma_path = tmp_path / "tiny.vrma"
            _make_tiny_vrma(vrma_path, first_pos=(1.0, 2.0, 3.0), second_pos=(1.1, 2.2, 3.3))

            pose = convert_vrma_to_pose_json(vrma_path)

            self.assertEqual(pose["hips_position"][0]["pos"], [0.0, 0.0, 0.0])
            self.assertEqual(pose["hips_position"][1]["pos"], [-0.1, 0.2, -0.3])

    def test_identity_rotation_stays_in_vrma_official_rest_space(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            tmp_path = Path(temp_dir)
            vrma_path = tmp_path / "tiny.vrma"
            _make_tiny_vrma(vrma_path, node_name="LeftUpperArm")

            pose = convert_vrma_to_pose_json(vrma_path)

            self.assertEqual(pose["bones"]["leftUpperArm"][0]["rot"], [0.0, 0.0, 0.0, 1.0])

    def test_official_rest_world_rotation_compensation_for_child_bone(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            tmp_path = Path(temp_dir)
            vrma_path = tmp_path / "tiny.vrma"
            _make_child_rest_rotation_vrma(vrma_path)

            pose = convert_vrma_to_pose_json(vrma_path)

            # 官方 VRMAnimationLoaderPlugin 會做 parentWorld * raw * inverse(boneWorld)。
            actual = pose["bones"]["leftLowerArm"][0]["rot"]
            self.assertEqual(actual, [-0.0, 0.0, 0.707107, 0.707107])

    def test_pose_db_vrma_row_becomes_previewable(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base_dir = Path(temp_dir)
            db_path = base_dir / "db.sqlite"
            vrma_path = base_dir / "local_assets" / "vrma" / "tiny.vrma"
            vrma_path.parent.mkdir(parents=True)
            _make_tiny_vrma(vrma_path)
            pose_db.init_db(db_path)
            item = pose_db.create_item(db_path, {
                "title": "tiny vrma",
                "source_kind": "vrma",
                "source_url": "local_assets/vrma/tiny.vrma",
                "vrma_path": "local_assets/vrma/tiny.vrma",
                "status": 2,
                "progress": 100,
            })

            converted = pose_db.convert_vrma_item_to_pose_json(db_path, base_dir, item["id"])

            self.assertEqual(converted["status"], 2)
            self.assertEqual(converted["frames"], 2)
            self.assertEqual(converted["duration_ms"], 1000)
            self.assertTrue(converted["pose_json_path"].endswith("_tiny_pose.json"))
            self.assertTrue((base_dir / converted["pose_json_path"]).exists())


if __name__ == "__main__":
    unittest.main()
