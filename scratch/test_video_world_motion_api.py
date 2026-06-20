import importlib.util
import os
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory


SERVER_PATH = Path("server.py")


def load_server_module():
    spec = importlib.util.spec_from_file_location("video_world_motion_server_under_test", SERVER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def create_local_capture(tmp_base, filename="yt_world001.mp4"):
    video_dir = tmp_base / "local_assets" / "capture" / "youtube"
    video_dir.mkdir(parents=True)
    video_path = video_dir / filename
    video_path.write_bytes(b"fake video")
    return video_path


def test_video_world_motion_api_reports_missing_assets_before_runner():
    with TemporaryDirectory() as tmp_dir:
        tmp_base = Path(tmp_dir)
        create_local_capture(tmp_base)
        fake_gvhmr_root = tmp_base / "GVHMR"
        fake_gvhmr_root.mkdir()
        old_root = os.environ.get("GVHMR_ROOT_DIR")
        os.environ["GVHMR_ROOT_DIR"] = str(fake_gvhmr_root)
        try:
            module = load_server_module()
            module.BASE_DIR = tmp_base

            def fail_runner(*args, **kwargs):
                raise AssertionError("missing assets should stop before GVHMR runner")

            module._run_gvhmr_world_motion = fail_runner
            client = module.app.test_client()

            response = client.post("/api/capture/video/world-motion", json={
                "videoUrl": "capture/youtube/yt_world001.mp4"
            })
        finally:
            if old_root is None:
                os.environ.pop("GVHMR_ROOT_DIR", None)
            else:
                os.environ["GVHMR_ROOT_DIR"] = old_root

        assert response.status_code == 200
        body = response.get_json()
        assert body["ok"] is False
        assert body["reason"] == "missing_assets"
        assert "inputs/checkpoints/gvhmr/gvhmr_siga24_release.ckpt" in body["missing"]
        assert body["assetStatus"]["ok"] is False


def test_video_world_motion_api_returns_world_motion_payload_when_ready():
    with TemporaryDirectory() as tmp_dir:
        tmp_base = Path(tmp_dir)
        video_path = create_local_capture(tmp_base)
        module = load_server_module()
        module.BASE_DIR = tmp_base
        module._run_gvhmr_asset_check = lambda: {"ok": True, "missing": []}

        def fake_runner(path, static_camera=True):
            assert path == video_path
            assert static_camera is True
            return {
                "ok": True,
                "source": "gvhmr",
                "frames": [{
                    "t": 0.033,
                    "bodyYawDegrees": -82.5,
                    "rootTranslation": {"x": 0.02, "y": 0.0, "z": 0.14},
                    "footContact": {"left": True, "right": False},
                    "confidence": 0.78,
                }],
            }

        module._run_gvhmr_world_motion = fake_runner
        client = module.app.test_client()

        response = client.post("/api/capture/video/world-motion", json={
            "videoUrl": "capture/youtube/yt_world001.mp4"
        })
        assert response.status_code == 200
        body = response.get_json()
        assert body["ok"] is True
        assert body["worldMotion"]["source"] == "gvhmr"
        assert body["worldMotion"]["frames"][0]["bodyYawDegrees"] == -82.5
        assert body["assetStatus"]["ok"] is True


def test_video_world_motion_api_filters_frames_to_capture_range():
    with TemporaryDirectory() as tmp_dir:
        tmp_base = Path(tmp_dir)
        video_path = create_local_capture(tmp_base)
        module = load_server_module()
        module.BASE_DIR = tmp_base
        module._run_gvhmr_asset_check = lambda: {"ok": True, "missing": []}

        def fake_runner(path, static_camera=True):
            assert path == video_path
            assert static_camera is True
            return {
                "ok": True,
                "source": "gvhmr",
                "frames": [
                    {"t": 0.4, "landmarks": {"hips": {"x": 0, "y": 1, "z": 0}}},
                    {"t": 1.5, "landmarks": {"hips": {"x": 0, "y": 1, "z": 0}}},
                    {"t": 2.4, "landmarks": {"hips": {"x": 0, "y": 1, "z": 0}}},
                    {"t": 3.2, "landmarks": {"hips": {"x": 0, "y": 1, "z": 0}}},
                ],
            }

        module._run_gvhmr_world_motion = fake_runner
        client = module.app.test_client()

        response = client.post("/api/capture/video/world-motion", json={
            "videoUrl": "capture/youtube/yt_world001.mp4",
            "startMs": 1000,
            "endMs": 2500,
        })

        assert response.status_code == 200
        body = response.get_json()
        assert body["ok"] is True
        assert [frame["t"] for frame in body["worldMotion"]["frames"]] == [1.5, 2.4]
        assert body["worldMotion"]["metadata"]["captureRange"]["startMs"] == 1000
        assert body["worldMotion"]["metadata"]["captureRange"]["endMs"] == 2500
        assert body["worldMotion"]["metadata"]["captureRange"]["filteredFrameCount"] == 2


def test_video_world_motion_api_rejects_non_local_video_paths():
    module = load_server_module()
    client = module.app.test_client()

    response = client.post("/api/capture/video/world-motion", json={
        "videoUrl": "https://youtube.com/watch?v=test"
    })
    assert response.status_code == 400
    assert "local video" in response.get_json()["error"]


def test_gvhmr_runtime_is_desktop_friendly_by_default():
    old_values = {
        key: os.environ.get(key)
        for key in ("GVHMR_CPU_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMEXPR_NUM_THREADS")
    }
    try:
        for key in old_values:
            os.environ.pop(key, None)

        module = load_server_module()
        env = module._gvhmr_runtime_env()

        assert env["OMP_NUM_THREADS"] == "2"
        assert env["MKL_NUM_THREADS"] == "2"
        assert env["OPENBLAS_NUM_THREADS"] == "2"
        assert env["NUMEXPR_NUM_THREADS"] == "2"
        if os.name == "nt":
            assert module._gvhmr_subprocess_creationflags() == subprocess.BELOW_NORMAL_PRIORITY_CLASS
        else:
            assert module._gvhmr_subprocess_creationflags() == 0
    finally:
        for key, value in old_values.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


if __name__ == "__main__":
    print("Running test_video_world_motion_api.py...")
    test_video_world_motion_api_reports_missing_assets_before_runner()
    test_video_world_motion_api_returns_world_motion_payload_when_ready()
    test_video_world_motion_api_filters_frames_to_capture_range()
    test_video_world_motion_api_rejects_non_local_video_paths()
    test_gvhmr_runtime_is_desktop_friendly_by_default()
    print("test_video_world_motion_api: ok")
