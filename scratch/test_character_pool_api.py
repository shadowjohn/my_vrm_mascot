import importlib.util
import json
import sys
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory

SERVER_PATH = Path("server.py")
ROOT_DIR = SERVER_PATH.resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


def load_server_module():
    spec = importlib.util.spec_from_file_location("character_pool_server_under_test", SERVER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_character_pool_import_and_list():
    with TemporaryDirectory() as tmp_dir:
        tmp_base = Path(tmp_dir)
        module = load_server_module()
        module.BASE_DIR = tmp_base
        module.CHARACTER_POOL_DIR = tmp_base / "local_assets" / "characters"
        client = module.app.test_client()

        empty_response = client.get("/api/characters")
        assert empty_response.status_code == 200
        assert empty_response.get_json()["characters"] == []

        response = client.post(
            "/api/characters/import",
            data={
                "id": "sample_001",
                "name": "Sample Character",
                "author": "tester",
                "allowCommercialUse": "true",
                "model": (BytesIO(b"fake-vrm"), "sample.vrm"),
            },
            content_type="multipart/form-data",
        )
        assert response.status_code == 200
        body = response.get_json()
        assert body["ok"] is True
        assert body["character"]["id"] == "sample_001"
        assert body["character"]["model"] == "model.vrm"
        assert body["character"]["allowCommercialUse"] is True
        assert body["character"]["motionProfile"] == "vrm_humanoid_v1"
        assert body["character"]["status"] == "testing"

        character_dir = module.CHARACTER_POOL_DIR / "sample_001"
        assert (character_dir / "model.vrm").read_bytes() == b"fake-vrm"
        with open(character_dir / "character.json", "r", encoding="utf-8") as f:
            disk_character = json.load(f)
        assert disk_character["name"] == "Sample Character"

        list_response = client.get("/api/characters")
        assert list_response.status_code == 200
        characters = list_response.get_json()["characters"]
        assert len(characters) == 1
        assert characters[0]["id"] == "sample_001"


if __name__ == "__main__":
    print("Running test_character_pool_api.py...")
    test_character_pool_import_and_list()
    print("test_character_pool_api: ok")
