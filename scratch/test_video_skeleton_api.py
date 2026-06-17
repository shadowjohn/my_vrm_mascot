import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory

SERVER_PATH = Path("server.py")


def load_server_module():
    spec = importlib.util.spec_from_file_location("video_skeleton_server_under_test", SERVER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def make_frame(time_ms=0):
    return {
        "timeMs": time_ms,
        "landmarks": {
            "hips": {"x": 0, "y": 1.0, "z": 0, "visibility": 1},
            "chest": {"x": 0, "y": 1.4, "z": 0, "visibility": 1},
            "head": {"x": 0, "y": 1.7, "z": 0, "visibility": 1},
            "leftShoulder": {"x": -0.2, "y": 1.5, "z": 0, "visibility": 1},
            "rightShoulder": {"x": 0.2, "y": 1.5, "z": 0, "visibility": 1},
            "leftWrist": {"x": -0.3, "y": 1.1, "z": 0, "visibility": 1},
            "rightWrist": {"x": 0.3, "y": 1.1, "z": 0, "visibility": 1},
            "leftAnkle": {"x": -0.1, "y": 0.05, "z": 0, "visibility": 1},
            "rightAnkle": {"x": 0.1, "y": 0.05, "z": 0, "visibility": 1},
        }
    }


class FakeLandmark:
    def __init__(self, x=0.5, y=0.5, z=0.0, visibility=1.0):
        self.x = x
        self.y = y
        self.z = z
        self.visibility = visibility


class FakePoseLandmarks:
    def __init__(self, landmarks):
        self.landmark = landmarks


def test_video_skeleton_api_requires_video_url():
    module = load_server_module()
    client = module.app.test_client()

    response = client.post("/api/capture/video/skeleton", json={})
    assert response.status_code == 400
    assert "videoUrl" in response.get_json()["error"]


def test_mediapipe_conversion_keeps_elbows_and_knees_for_retargeting():
    module = load_server_module()
    landmarks = [FakeLandmark() for _ in range(33)]
    landmarks[0] = FakeLandmark(0.5, 0.12, -0.08, 0.98)
    landmarks[11] = FakeLandmark(0.42, 0.32, -0.03, 0.97)
    landmarks[12] = FakeLandmark(0.58, 0.32, -0.03, 0.97)
    landmarks[13] = FakeLandmark(0.36, 0.45, -0.12, 0.91)
    landmarks[14] = FakeLandmark(0.64, 0.45, 0.08, 0.91)
    landmarks[15] = FakeLandmark(0.30, 0.58, -0.20, 0.88)
    landmarks[16] = FakeLandmark(0.70, 0.58, 0.18, 0.88)
    landmarks[23] = FakeLandmark(0.46, 0.68, 0.0, 0.96)
    landmarks[24] = FakeLandmark(0.54, 0.68, 0.0, 0.96)
    landmarks[25] = FakeLandmark(0.44, 0.82, -0.04, 0.9)
    landmarks[26] = FakeLandmark(0.56, 0.82, 0.05, 0.9)
    landmarks[27] = FakeLandmark(0.43, 0.96, -0.06, 0.9)
    landmarks[28] = FakeLandmark(0.57, 0.96, 0.07, 0.9)

    canonical = module._convert_mediapipe_landmarks_to_canonical(FakePoseLandmarks(landmarks))

    for name in ("leftElbow", "rightElbow", "leftKnee", "rightKnee"):
        assert name in canonical
        assert set(canonical[name]) == {"x", "y", "z", "visibility"}


def test_video_skeleton_api_extracts_sequence_from_local_capture_url():
    with TemporaryDirectory() as tmp_dir:
        tmp_base = Path(tmp_dir)
        video_dir = tmp_base / "local_assets" / "capture" / "youtube"
        video_dir.mkdir(parents=True)
        video_path = video_dir / "yt_test001.mp4"
        video_path.write_bytes(b"fake video")

        module = load_server_module()
        module.BASE_DIR = tmp_base

        def fake_extract(path, **options):
            assert path == video_path
            assert options["target_fps"] == 8
            assert options["start_ms"] == 1500
            assert options["end_ms"] == 4500
            return {
                "ok": True,
                "sequence": {
                    "id": "yt_test001_skeleton",
                    "label": "yt_test001 skeleton",
                    "sourceType": "video",
                    "fps": 8,
                    "frames": [make_frame(0), make_frame(125)],
                    "source": {
                        "type": "video",
                        "url": "capture/youtube/yt_test001.mp4"
                    }
                },
                "frameCount": 2,
                "detectedFrameCount": 2,
            }

        module._extract_video_skeleton_sequence = fake_extract
        client = module.app.test_client()

        response = client.post("/api/capture/video/skeleton", json={
            "videoUrl": "capture/youtube/yt_test001.mp4",
            "targetFps": 8,
            "startMs": 1500,
            "endMs": 4500,
        })
        assert response.status_code == 200
        body = response.get_json()
        assert body["ok"] is True
        assert body["sequence"]["sourceType"] == "video"
        assert body["sequence"]["fps"] == 8
        assert len(body["sequence"]["frames"]) == 2
        assert body["frameCount"] == 2
        assert body["detectedFrameCount"] == 2


def test_video_skeleton_api_uses_real_motionbert_lift_when_runner_succeeds():
    with TemporaryDirectory() as tmp_dir:
        tmp_base = Path(tmp_dir)
        video_dir = tmp_base / "local_assets" / "capture" / "youtube"
        video_dir.mkdir(parents=True)
        video_path = video_dir / "yt_test001.mp4"
        video_path.write_bytes(b"fake video")

        module = load_server_module()
        module.BASE_DIR = tmp_base

        def fake_extract(path, **options):
            frame = make_frame(0)
            frame["landmarks"]["leftKnee"] = {"x": -0.08, "y": 0.55, "z": -0.2, "visibility": 0.9}
            frame["landmarks"]["rightKnee"] = {"x": 0.08, "y": 0.55, "z": 0.22, "visibility": 0.9}
            frame["landmarks"]["leftAnkle"]["z"] = -0.36
            frame["landmarks"]["rightAnkle"]["z"] = 0.34
            return {
                "ok": True,
                "sequence": {
                    "id": "yt_test001_skeleton",
                    "label": "yt_test001 skeleton",
                    "sourceType": "video",
                    "fps": 8,
                    "frames": [frame],
                    "source": {
                        "type": "video",
                        "url": "capture/youtube/yt_test001.mp4"
                    }
                },
                "frameCount": 1,
                "detectedFrameCount": 1,
            }

        module._extract_video_skeleton_sequence = fake_extract

        def fake_motionbert_lift(sequence, path):
            assert path == video_path
            assert sequence["id"] == "yt_test001_skeleton"
            return {
                "frames": [{
                    "timeMs": 0,
                    "landmarks": {
                        "hips": {"z": 0.0},
                        "leftKnee": {"z": -0.28},
                        "rightKnee": {"z": 0.27},
                        "leftAnkle": {"z": -0.42},
                        "rightAnkle": {"z": 0.39},
                    },
                }],
                "metadata": {
                    "viewpoint": "front",
                    "frontBackConfidence": 0.88,
                    "leadFoot": "left",
                    "depthConfidence": 0.88,
                    "runtimeMs": 321,
                },
            }

        module._run_motionbert_3d_lift = fake_motionbert_lift
        client = module.app.test_client()

        response = client.post("/api/capture/video/skeleton", json={
            "videoUrl": "capture/youtube/yt_test001.mp4",
            "enable3dLift": True,
        })
        assert response.status_code == 200
        body = response.get_json()
        sequence = body["sequence"]
        assert sequence["poseMode"] == "3d_lifted"
        assert sequence["depthSource"] == "motionbert"
        assert sequence["viewpoint"] == "front"
        assert sequence["leadFoot"] == "left"
        assert sequence["frontBackConfidence"] == 0.88
        assert sequence["depthConfidence"] == 0.88
        assert sequence["landmarksVersion"] == "motionbert_3d_lift_v1"
        assert sequence["frames"][0]["landmarks"]["leftAnkle"]["z"] == -0.42
        assert sequence["frames"][0]["landmarks"]["rightAnkle"]["z"] == 0.39
        assert sequence["source"]["depthSource"] == "motionbert"
        assert sequence["source"]["liftAdapter"] == "MotionBert3DLiftSubprocess"
        assert sequence["source"]["motionBert"]["ok"] is True
        assert sequence["source"]["motionBert"]["runtimeMs"] == 321


def test_video_skeleton_api_falls_back_to_poc_when_motionbert_is_unavailable():
    with TemporaryDirectory() as tmp_dir:
        tmp_base = Path(tmp_dir)
        video_dir = tmp_base / "local_assets" / "capture" / "youtube"
        video_dir.mkdir(parents=True)
        video_path = video_dir / "yt_test001.mp4"
        video_path.write_bytes(b"fake video")

        module = load_server_module()
        module.BASE_DIR = tmp_base

        def fake_extract(path, **options):
            frame = make_frame(0)
            frame["landmarks"]["leftKnee"] = {"x": -0.08, "y": 0.55, "z": -0.2, "visibility": 0.9}
            frame["landmarks"]["rightKnee"] = {"x": 0.08, "y": 0.55, "z": 0.22, "visibility": 0.9}
            frame["landmarks"]["leftAnkle"]["z"] = -0.36
            frame["landmarks"]["rightAnkle"]["z"] = 0.34
            return {
                "ok": True,
                "sequence": {
                    "id": "yt_test001_skeleton",
                    "label": "yt_test001 skeleton",
                    "sourceType": "video",
                    "fps": 8,
                    "frames": [frame],
                    "source": {
                        "type": "video",
                        "url": "capture/youtube/yt_test001.mp4"
                    }
                },
                "frameCount": 1,
                "detectedFrameCount": 1,
            }

        def fake_motionbert_lift(sequence, path):
            raise RuntimeError("MotionBERT checkpoint missing")

        module._extract_video_skeleton_sequence = fake_extract
        module._run_motionbert_3d_lift = fake_motionbert_lift
        client = module.app.test_client()

        response = client.post("/api/capture/video/skeleton", json={
            "videoUrl": "capture/youtube/yt_test001.mp4",
            "enable3dLift": True,
        })
        assert response.status_code == 200
        body = response.get_json()
        sequence = body["sequence"]
        assert sequence["poseMode"] == "3d_lifted"
        assert sequence["depthSource"] == "motionbert_poc"
        assert sequence["source"]["liftAdapter"] == "MotionBert3DLiftPoc"
        assert sequence["source"]["motionBert"]["ok"] is False
        assert sequence["source"]["motionBert"]["fallback"] == "motionbert_poc"
        assert "checkpoint" in sequence["source"]["motionBert"]["error"]


def test_video_skeleton_api_strict_motionbert_returns_503_when_unavailable():
    with TemporaryDirectory() as tmp_dir:
        tmp_base = Path(tmp_dir)
        video_dir = tmp_base / "local_assets" / "capture" / "youtube"
        video_dir.mkdir(parents=True)
        video_path = video_dir / "yt_test001.mp4"
        video_path.write_bytes(b"fake video")

        module = load_server_module()
        module.BASE_DIR = tmp_base

        def fake_extract(path, **options):
            return {
                "ok": True,
                "sequence": {
                    "id": "yt_test001_skeleton",
                    "label": "yt_test001 skeleton",
                    "sourceType": "video",
                    "fps": 8,
                    "frames": [make_frame(0)],
                    "source": {
                        "type": "video",
                        "url": "capture/youtube/yt_test001.mp4"
                    }
                },
                "frameCount": 1,
                "detectedFrameCount": 1,
            }

        def fake_motionbert_lift(sequence, path):
            raise RuntimeError("MotionBERT checkpoint missing")

        module._extract_video_skeleton_sequence = fake_extract
        module._run_motionbert_3d_lift = fake_motionbert_lift
        client = module.app.test_client()

        response = client.post("/api/capture/video/skeleton", json={
            "videoUrl": "capture/youtube/yt_test001.mp4",
            "enable3dLift": True,
            "strict3dLift": True,
        })
        assert response.status_code == 503
        assert "MotionBERT checkpoint missing" in response.get_json()["error"]


def test_video_skeleton_api_rejects_invalid_capture_range_before_extract():
    with TemporaryDirectory() as tmp_dir:
        tmp_base = Path(tmp_dir)
        video_dir = tmp_base / "local_assets" / "capture" / "youtube"
        video_dir.mkdir(parents=True)
        video_path = video_dir / "yt_test001.mp4"
        video_path.write_bytes(b"fake video")

        module = load_server_module()
        module.BASE_DIR = tmp_base

        def fake_extract(path, **options):
            raise AssertionError("invalid range should not call extractor")

        module._extract_video_skeleton_sequence = fake_extract
        client = module.app.test_client()

        response = client.post("/api/capture/video/skeleton", json={
            "videoUrl": "capture/youtube/yt_test001.mp4",
            "startMs": 4500,
            "endMs": 1500,
        })
        assert response.status_code == 400
        assert "endMs" in response.get_json()["error"]


def test_video_skeleton_api_rejects_non_local_video_paths():
    module = load_server_module()
    client = module.app.test_client()

    response = client.post("/api/capture/video/skeleton", json={
        "videoUrl": "https://youtube.com/watch?v=test"
    })
    assert response.status_code == 400
    assert "local video" in response.get_json()["error"]


if __name__ == "__main__":
    print("Running test_video_skeleton_api.py...")
    test_video_skeleton_api_requires_video_url()
    test_mediapipe_conversion_keeps_elbows_and_knees_for_retargeting()
    test_video_skeleton_api_extracts_sequence_from_local_capture_url()
    test_video_skeleton_api_uses_real_motionbert_lift_when_runner_succeeds()
    test_video_skeleton_api_falls_back_to_poc_when_motionbert_is_unavailable()
    test_video_skeleton_api_strict_motionbert_returns_503_when_unavailable()
    test_video_skeleton_api_rejects_invalid_capture_range_before_extract()
    test_video_skeleton_api_rejects_non_local_video_paths()
    print("test_video_skeleton_api: ok")
