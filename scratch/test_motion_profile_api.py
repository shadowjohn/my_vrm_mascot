import importlib.util
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory


SERVER_PATH = Path("server.py")


def load_server_module(store_path, mining_log_path=None):
    os.environ["MOTION_PROFILE_STORE_PATH"] = str(store_path)
    if mining_log_path is not None:
        os.environ["MOTION_MINING_LOG_STORE_PATH"] = str(mining_log_path)
    spec = importlib.util.spec_from_file_location("motion_profile_server_under_test", SERVER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_motion_profile_api_round_trip():
    with TemporaryDirectory() as tmp_dir:
        store_path = Path(tmp_dir) / "motion_profiles.json"
        module = load_server_module(store_path)
        client = module.app.test_client()

        initial = client.get("/api/motion-profiles")
        assert initial.status_code == 200
        assert initial.get_json()["profiles"] == {}

        payload = {
            "profile": {
                "source": "Angry.vrma",
                "motionCategory": "warning",
                "motionScore": 4,
                "description": "雙手叉腰，身體前傾，像是在提醒使用者注意。",
                "usageDescription": "用於限制、警告或提醒使用者確認異常狀態。",
                "agentUsage": ["政策阻擋時提醒", "工具失敗時警告"],
                "note": "測試主分類存檔",
                "updatedAt": "2026-06-14T12:00:00+08:00",
            }
        }
        saved = client.post("/api/motion-profiles", json=payload)
        assert saved.status_code == 200
        body = saved.get_json()
        assert body["ok"] is True
        assert body["profile"]["source"] == "Angry.vrma"
        assert body["profile"]["motionCategory"] == "warning"

        disk = json.loads(store_path.read_text(encoding="utf-8"))
        assert disk["schemaVersion"] == 1
        assert disk["profiles"]["Angry.vrma"]["motionScore"] == 4
        assert disk["profiles"]["Angry.vrma"]["description"] == "雙手叉腰，身體前傾，像是在提醒使用者注意。"
        assert disk["profiles"]["Angry.vrma"]["usageDescription"] == "用於限制、警告或提醒使用者確認異常狀態。"
        assert disk["profiles"]["Angry.vrma"]["agentUsage"] == ["政策阻擋時提醒", "工具失敗時警告"]
        assert disk["profiles"]["Angry.vrma"]["note"] == "雙手叉腰，身體前傾，像是在提醒使用者注意。"

        loaded = client.get("/api/motion-profiles")
        assert loaded.status_code == 200
        assert loaded.get_json()["profiles"]["Angry.vrma"]["motionCategory"] == "warning"
        assert loaded.get_json()["profiles"]["Angry.vrma"]["agentUsage"] == ["政策阻擋時提醒", "工具失敗時警告"]


def test_motion_profile_api_rejects_path_traversal():
    with TemporaryDirectory() as tmp_dir:
        store_path = Path(tmp_dir) / "motion_profiles.json"
        module = load_server_module(store_path)
        client = module.app.test_client()

        response = client.post("/api/motion-profiles", json={
            "profile": {
                "source": "../Angry.vrma",
                "motionCategory": "warning",
                "motionScore": 4,
            }
        })
        assert response.status_code == 400


def test_vrma_samples_api_lists_root_and_external_files():
    with TemporaryDirectory() as tmp_dir:
        store_path = Path(tmp_dir) / "motion_profiles.json"
        sample_dir = Path(tmp_dir) / "samples"
        local_sample_dir = Path(tmp_dir) / "local_assets" / "vrma"
        external_dir = sample_dir / "external" / "demo"
        sample_dir.mkdir()
        local_sample_dir.mkdir(parents=True)
        external_dir.mkdir(parents=True)
        (sample_dir / "Root.vrma").write_bytes(b"glTFroot")
        (local_sample_dir / "LocalOnly.vrma").write_bytes(b"glTFlocal")
        (external_dir / "External.vrma").write_bytes(b"glTFexternal")

        module = load_server_module(store_path)
        module.VRMA_SAMPLE_DIR = sample_dir
        module.LOCAL_VRMA_SAMPLE_DIR = local_sample_dir
        module.BASE_DIR = sample_dir.parent
        client = module.app.test_client()

        response = client.get("/api/vrma-samples")
        assert response.status_code == 200
        body = response.get_json()
        assert body["ok"] is True
        samples = {item["name"]: item for item in body["samples"]}
        assert samples["Root.vrma"]["external"] is False
        assert samples["Root.vrma"]["url"] == "samples/Root.vrma"
        assert samples["LocalOnly.vrma"]["external"] is True
        assert samples["LocalOnly.vrma"]["url"] == "local_assets/vrma/LocalOnly.vrma"
        assert samples["External.vrma"]["external"] is True
        assert samples["External.vrma"]["url"] == "samples/external/demo/External.vrma"


def test_motion_mining_log_api_saves_described_entry():
    with TemporaryDirectory() as tmp_dir:
        store_path = Path(tmp_dir) / "motion_profiles.json"
        mining_log_path = Path(tmp_dir) / "mining_log.json"
        module = load_server_module(store_path, mining_log_path)
        client = module.app.test_client()

        payload = {
            "entry": {
                "id": "described_001",
                "source": "ComeOn.vrma",
                "sampleTime": 1.2,
                "status": "described",
                "motionDescription": "右手在前方往自己身邊招，像是在叫對方過來。",
                "usageDescription": "用於引導使用者靠近或查看指定位置。",
                "agentUsage": ["引導使用者查看指定位置"],
                "category": None,
                "classificationSource": "pending_llm",
                "descriptionSource": "human",
                "createdAt": "2026-06-14T12:00:00+08:00",
            }
        }
        saved = client.post("/api/motion-mining-log", json=payload)
        assert saved.status_code == 200
        body = saved.get_json()
        assert body["ok"] is True
        assert body["entry"]["status"] == "described"
        assert body["path"] == "examples/m6_7_vrma_samples/review/mining_log.json"

        disk = json.loads(mining_log_path.read_text(encoding="utf-8"))
        assert disk[0]["source"] == "ComeOn.vrma"
        assert disk[0]["motionDescription"] == "右手在前方往自己身邊招，像是在叫對方過來。"
        assert disk[0]["classificationSource"] == "pending_llm"

        payload["entry"]["motionDescription"] = "更新後的描述"
        updated = client.post("/api/motion-mining-log", json=payload)
        assert updated.status_code == 200
        disk = json.loads(mining_log_path.read_text(encoding="utf-8"))
        assert len(disk) == 1
        assert disk[0]["id"] == "described_001"
        assert disk[0]["motionDescription"] == "更新後的描述"

        payload["entry"]["id"] = "described_999"
        payload["entry"]["motionDescription"] = "同時間再更新仍保留原 id"
        updated = client.post("/api/motion-mining-log", json=payload)
        assert updated.status_code == 200
        disk = json.loads(mining_log_path.read_text(encoding="utf-8"))
        assert len(disk) == 1
        assert disk[0]["id"] == "described_001"
        assert disk[0]["motionDescription"] == "同時間再更新仍保留原 id"


if __name__ == "__main__":
    test_motion_profile_api_round_trip()
    print("PASS test_motion_profile_api_round_trip")
    test_motion_profile_api_rejects_path_traversal()
    print("PASS test_motion_profile_api_rejects_path_traversal")
    test_vrma_samples_api_lists_root_and_external_files()
    print("PASS test_vrma_samples_api_lists_root_and_external_files")
    test_motion_mining_log_api_saves_described_entry()
    print("PASS test_motion_mining_log_api_saves_described_entry")
