import importlib.util
import json
import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

SERVER_PATH = Path("server.py")
ROOT_DIR = SERVER_PATH.resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


def load_server_module():
    spec = importlib.util.spec_from_file_location("pose_library_server_under_test", SERVER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_pose_library_api_get():
    with TemporaryDirectory() as tmp_dir:
        tmp_base = Path(tmp_dir)
        poses_dir = tmp_base / "motions" / "poses"
        standing_dir = poses_dir / "standing"
        standing_dir.mkdir(parents=True)

        # Write seed pose
        seed_pose = {
            "schemaVersion": 1,
            "id": "stand_relaxed_001",
            "category": "standing",
            "label": "自然站姿",
            "model": "AliciaSolid",
            "basePose": {
                "rotation": {"spine": {"x": 2, "y": 0, "z": -2}},
                "position": {"hips": {"x": -0.014, "y": 0, "z": 0.004}}
            }
        }
        with open(standing_dir / "stand_relaxed_001.json", "w", encoding="utf-8") as f:
            json.dump(seed_pose, f)

        module = load_server_module()
        module.BASE_DIR = tmp_base
        client = module.app.test_client()

        # GET request
        response = client.get("/api/pose-library")
        assert response.status_code == 200
        body = response.get_json()
        assert body["ok"] is True
        assert "stand_relaxed_001" in body["manifest"]["poses"]

        entry = body["manifest"]["poses"]["stand_relaxed_001"]
        assert entry["label"] == "自然站姿"
        assert entry["category"] == "standing"
        assert entry["path"] == "motions/poses/standing/stand_relaxed_001.json"


def test_pose_library_api_post_valid():
    with TemporaryDirectory() as tmp_dir:
        tmp_base = Path(tmp_dir)
        poses_dir = tmp_base / "motions" / "poses"
        standing_dir = poses_dir / "standing"
        standing_dir.mkdir(parents=True)

        module = load_server_module()
        module.BASE_DIR = tmp_base
        client = module.app.test_client()

        new_pose = {
            "id": "stand_relaxed_002",
            "category": "standing",
            "label": "第二自然站姿",
            "model": "AliciaSolid",
            "basePose": {
                "rotation": {"spine": {"x": 4, "y": 0, "z": -4}},
                "position": {"hips": {"x": 0, "y": 0, "z": 0}}
            }
        }

        # POST request
        response = client.post("/api/pose-library", json={"pose": new_pose})
        assert response.status_code == 200
        body = response.get_json()
        assert body["ok"] is True
        assert body["pose"]["id"] == "stand_relaxed_002"
        assert body["pose"]["category"] == "standing"

        # Check file is written
        target_path = standing_dir / "stand_relaxed_002.json"
        assert target_path.exists()
        with open(target_path, "r", encoding="utf-8") as f:
            disk_data = json.load(f)
            assert disk_data["label"] == "第二自然站姿"
            assert disk_data["schemaVersion"] == 1

        # Check manifest is updated
        manifest_path = poses_dir / "pose_library_manifest.json"
        assert manifest_path.exists()
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest_data = json.load(f)
            assert "stand_relaxed_002" in manifest_data["poses"]
            assert manifest_data["poses"]["stand_relaxed_002"]["label"] == "第二自然站姿"


def test_pose_library_api_post_rejections():
    with TemporaryDirectory() as tmp_dir:
        tmp_base = Path(tmp_dir)
        module = load_server_module()
        module.BASE_DIR = tmp_base
        client = module.app.test_client()

        # Invalid payload (not a dict)
        response = client.post("/api/pose-library", json={"pose": "not-a-dict"})
        assert response.status_code == 400
        assert "pose 必須是物件" in response.get_json()["error"]

        # Missing fields
        response = client.post("/api/pose-library", json={"pose": {"id": "test"}})
        assert response.status_code == 400
        assert "id, category 與 label 為必填欄位" in response.get_json()["error"]

        # Invalid category
        response = client.post("/api/pose-library", json={
            "pose": {
                "id": "test_pose",
                "category": "flying",
                "label": "飛姿",
                "basePose": {"rotation": {}, "position": {}}
            }
        })
        assert response.status_code == 400
        assert "不支援的分類: flying" in response.get_json()["error"]

        # Path traversal / invalid characters in ID
        response = client.post("/api/pose-library", json={
            "pose": {
                "id": "../test_pose",
                "category": "standing",
                "label": "越界",
                "basePose": {"rotation": {}, "position": {}}
            }
        })
        assert response.status_code == 400
        assert "id 必須是英數字" in response.get_json()["error"]

        response = client.post("/api/pose-library", json={
            "pose": {
                "id": "test pose space",
                "category": "standing",
                "label": "有空白",
                "basePose": {"rotation": {}, "position": {}}
            }
        })
        assert response.status_code == 400
        assert "id 必須是英數字" in response.get_json()["error"]


if __name__ == "__main__":
    print("Running test_pose_library_api.py...")
    test_pose_library_api_get()
    test_pose_library_api_post_valid()
    test_pose_library_api_post_rejections()
    print("test_pose_library_api: ok")
