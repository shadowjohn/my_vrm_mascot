import importlib.util
from pathlib import Path

SERVER_PATH = Path("server.py")


def load_server_module():
    spec = importlib.util.spec_from_file_location("capture_service_status_server_under_test", SERVER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_capture_service_status_reports_ready_services():
    module = load_server_module()
    module._module_available = lambda name: name in {"yt_dlp", "cv2", "mediapipe"}
    module._assert_motionbert_runtime_ready = lambda: None
    module._run_gvhmr_asset_check = lambda: {"ok": True, "missing": []}
    module._gvhmr_python_path = lambda: Path("D:/fake/gvhmr/env/python.exe")
    module._gvhmr_root_dir = lambda: Path("D:/fake/gvhmr/GVHMR")
    module._gvhmr_lift_sidecar_path = lambda: Path("D:/fake/scripts/gvhmr_lift.py")
    module._path_ready = lambda path, expected_type: True
    module._micromamba_executable_path = lambda: Path("D:/fake/micromamba.exe")

    response = module.app.test_client().get("/api/capture/services/status")

    assert response.status_code == 200
    body = response.get_json()
    assert body["ok"] is True
    services = {item["id"]: item for item in body["services"]}
    assert list(services.keys()) == ["ytdlp", "skeleton", "motionbert", "gvhmr", "micromamba"]
    assert services["ytdlp"]["status"] == "ready"
    assert services["skeleton"]["status"] == "ready"
    assert services["motionbert"]["status"] == "ready"
    assert services["gvhmr"]["status"] == "ready"
    assert services["micromamba"]["status"] == "ready"


def test_capture_service_status_reports_missing_dependencies():
    module = load_server_module()
    module._module_available = lambda name: False

    def missing_motionbert():
        raise RuntimeError("MotionBERT checkpoint missing")

    module._assert_motionbert_runtime_ready = missing_motionbert
    module._run_gvhmr_asset_check = lambda: {"ok": False, "missing": ["gvhmr_siga24_release.ckpt"]}
    module._gvhmr_python_path = lambda: Path("D:/fake/gvhmr/env/python.exe")
    module._gvhmr_root_dir = lambda: Path("D:/fake/gvhmr/GVHMR")
    module._gvhmr_lift_sidecar_path = lambda: Path("D:/fake/scripts/gvhmr_lift.py")
    module._path_ready = lambda path, expected_type: True
    module._micromamba_executable_path = lambda: None

    response = module.app.test_client().get("/api/capture/services/status")

    assert response.status_code == 200
    body = response.get_json()
    assert body["ok"] is False
    services = {item["id"]: item for item in body["services"]}
    assert services["ytdlp"]["status"] == "missing"
    assert services["skeleton"]["status"] == "missing"
    assert services["motionbert"]["status"] == "missing"
    assert services["gvhmr"]["status"] == "partial"
    assert services["micromamba"]["status"] == "missing"
    assert "checkpoint missing" in services["motionbert"]["detail"]
    assert "gvhmr_siga24_release.ckpt" in services["gvhmr"]["detail"]


def test_capture_service_status_reports_gvhmr_missing_when_runtime_path_is_missing():
    module = load_server_module()
    module._module_available = lambda name: name in {"yt_dlp", "cv2", "mediapipe"}
    module._assert_motionbert_runtime_ready = lambda: None
    module._run_gvhmr_asset_check = lambda: {"ok": True, "missing": []}
    module._gvhmr_python_path = lambda: Path("D:/fake/gvhmr/env/python.exe")
    module._gvhmr_root_dir = lambda: Path("D:/fake/gvhmr/GVHMR")
    module._gvhmr_lift_sidecar_path = lambda: Path("D:/fake/scripts/gvhmr_lift.py")
    module._path_ready = lambda path, expected_type: "python.exe" not in str(path)
    module._micromamba_executable_path = lambda: Path("D:/fake/micromamba.exe")

    response = module.app.test_client().get("/api/capture/services/status")

    assert response.status_code == 200
    body = response.get_json()
    services = {item["id"]: item for item in body["services"]}
    assert services["gvhmr"]["status"] == "missing"
    assert "GVHMR python env" in services["gvhmr"]["detail"]


if __name__ == "__main__":
    print("Running test_capture_service_status_api.py...")
    test_capture_service_status_reports_ready_services()
    test_capture_service_status_reports_missing_dependencies()
    test_capture_service_status_reports_gvhmr_missing_when_runtime_path_is_missing()
    print("test_capture_service_status_api: ok")
