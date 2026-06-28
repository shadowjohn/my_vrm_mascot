import importlib.util
import os
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory


SERVER_PATH = Path("server.py")
sys.path.insert(0, str(SERVER_PATH.resolve().parent))


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


def fake_alicia_bake(input_json, output_json, hand_json=None):
    Path(output_json).write_text('{"ok": true, "source": "gvhmr_blender_bake", "bones": {}}', encoding="utf-8")


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
                "videoUrl": "local_assets/capture/youtube/yt_world001.mp4"
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
        bake_seen = {}

        def fake_hand_pass(video_path, skeleton_path, output_json):
            Path(output_json).write_text('{"frames":[]}', encoding="utf-8")
            return Path(output_json)

        def fake_bake(input_json, output_json, hand_json=None):
            bake_seen["hand_json"] = hand_json
            fake_alicia_bake(input_json, output_json, hand_json=hand_json)

        module._run_mediapipe_hand_pass = fake_hand_pass
        module._run_alicia_blender_bake = fake_bake

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
            "videoUrl": "local_assets/capture/youtube/yt_world001.mp4"
        })
        assert response.status_code == 200
        body = response.get_json()
        assert body["ok"] is True
        assert body["worldMotion"]["source"] == "gvhmr"
        assert body["worldMotion"]["frames"][0]["bodyYawDegrees"] == -82.5
        assert body["assetStatus"]["ok"] is True
        assert body["motionUrl"].endswith("/alicia_blender_bake_motion.json")
        assert body["handPoseUrl"].endswith("/mediapipe_hand_poses.json")
        assert (tmp_base / body["motionUrl"]).is_file()
        assert (tmp_base / body["skeletonUrl"]).is_file()
        assert bake_seen["hand_json"].name == "mediapipe_hand_poses.json"


def test_video_world_motion_api_filters_frames_to_capture_range():
    with TemporaryDirectory() as tmp_dir:
        tmp_base = Path(tmp_dir)
        video_path = create_local_capture(tmp_base)
        module = load_server_module()
        module.BASE_DIR = tmp_base
        module._run_gvhmr_asset_check = lambda: {"ok": True, "missing": []}
        module._run_mediapipe_hand_pass = lambda *args, **kwargs: None
        module._run_alicia_blender_bake = fake_alicia_bake

        def fake_clip(path, start_ms, end_ms):
            clip_path = tmp_base / "clip.mp4"
            clip_path.write_bytes(b"fake clipped video")
            return clip_path

        module._clip_video_ffmpeg = fake_clip

        def fake_runner(path, static_camera=True):
            assert path.name == "clip.mp4"
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
            "videoUrl": "local_assets/capture/youtube/yt_world001.mp4",
            "startMs": 1000,
            "endMs": 2500,
        })

        assert response.status_code == 200
        body = response.get_json()
        assert body["ok"] is True
        assert [frame["t"] for frame in body["worldMotion"]["frames"]] == [1.4, 2.5]
        assert body["worldMotion"]["metadata"]["captureRange"]["startMs"] == 1000
        assert body["worldMotion"]["metadata"]["captureRange"]["endMs"] == 2500
        assert body["worldMotion"]["metadata"]["captureRange"]["filteredFrameCount"] == 2
        assert body["motionUrl"].endswith("/alicia_blender_bake_motion.json")


def test_video_world_motion_api_rejects_non_local_video_paths():
    module = load_server_module()
    client = module.app.test_client()

    response = client.post("/api/capture/video/world-motion", json={
        "videoUrl": "https://youtube.com/watch?v=test"
    })
    assert response.status_code == 400
    assert "local video" in response.get_json()["error"]


def test_gvhmr_demo_motions_api_lists_baked_outputs():
    with TemporaryDirectory() as tmp_dir:
        tmp_base = Path(tmp_dir)
        demo_dir = tmp_base / "conda_vm" / "gvhmr" / "GVHMR" / "outputs" / "demo" / "sample001"
        demo_dir.mkdir(parents=True)
        (demo_dir / "0_input_video.mp4").write_bytes(b"video")
        (demo_dir / "alicia_intermediate_landmarks.json").write_text('{"frames":[]}', encoding="utf-8")
        (demo_dir / "alicia_blender_bake_motion.json").write_text('{"bones":{}}', encoding="utf-8")

        module = load_server_module()
        module.BASE_DIR = tmp_base
        client = module.app.test_client()

        response = client.get("/api/gvhmr/demo-motions")
        assert response.status_code == 200
        body = response.get_json()
        assert body["ok"] is True
        assert body["motions"][0]["url"] == "conda_vm/gvhmr/GVHMR/outputs/demo/sample001/alicia_blender_bake_motion.json"


def test_existing_demo_video_rerun_reuses_parent_output_dir():
    with TemporaryDirectory() as tmp_dir:
        tmp_base = Path(tmp_dir)
        demo_dir = tmp_base / "conda_vm" / "gvhmr" / "GVHMR" / "outputs" / "demo" / "sample001"
        video_path = demo_dir / "0_input_video.mp4"
        demo_dir.mkdir(parents=True)
        video_path.write_bytes(b"video")

        module = load_server_module()
        module.BASE_DIR = tmp_base

        assert module._gvhmr_demo_output_dir_for_video(video_path) == demo_dir


def test_gvhmr_artifact_backup_copies_existing_json_outputs():
    with TemporaryDirectory() as tmp_dir:
        output_dir = Path(tmp_dir) / "demo001"
        output_dir.mkdir()
        (output_dir / "alicia_blender_bake_motion.json").write_text('{"old":true}', encoding="utf-8")
        (output_dir / "alicia_intermediate_landmarks.json").write_text('{"frames":[1]}', encoding="utf-8")
        (output_dir / "0_input_video.mp4").write_bytes(b"large video")

        module = load_server_module()
        backup_dir = module._backup_existing_gvhmr_artifacts(output_dir)

        assert backup_dir is not None
        assert (backup_dir / "alicia_blender_bake_motion.json").read_text(encoding="utf-8") == '{"old":true}'
        assert (backup_dir / "alicia_intermediate_landmarks.json").read_text(encoding="utf-8") == '{"frames":[1]}'
        assert not (backup_dir / "0_input_video.mp4").exists()


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


def test_gvhmr_timeout_is_long_and_overridable():
    old_value = os.environ.get("GVHMR_TIMEOUT_SEC")
    try:
        os.environ.pop("GVHMR_TIMEOUT_SEC", None)
        module = load_server_module()
        assert module.GVHMR_TIMEOUT_SEC == 1800

        os.environ["GVHMR_TIMEOUT_SEC"] = "42"
        module = load_server_module()
        assert module.GVHMR_TIMEOUT_SEC == 42
    finally:
        if old_value is None:
            os.environ.pop("GVHMR_TIMEOUT_SEC", None)
        else:
            os.environ["GVHMR_TIMEOUT_SEC"] = old_value


if __name__ == "__main__":
    print("Running test_video_world_motion_api.py...")
    test_video_world_motion_api_reports_missing_assets_before_runner()
    test_video_world_motion_api_returns_world_motion_payload_when_ready()
    test_video_world_motion_api_filters_frames_to_capture_range()
    test_video_world_motion_api_rejects_non_local_video_paths()
    test_gvhmr_demo_motions_api_lists_baked_outputs()
    test_existing_demo_video_rerun_reuses_parent_output_dir()
    test_gvhmr_artifact_backup_copies_existing_json_outputs()
    test_gvhmr_runtime_is_desktop_friendly_by_default()
    test_gvhmr_timeout_is_long_and_overridable()
    print("test_video_world_motion_api: ok")
