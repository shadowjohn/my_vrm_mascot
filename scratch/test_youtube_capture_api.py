import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory

SERVER_PATH = Path("server.py")


def load_server_module():
    spec = importlib.util.spec_from_file_location("youtube_capture_server_under_test", SERVER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_youtube_capture_rejects_invalid_urls():
    module = load_server_module()
    client = module.app.test_client()

    response = client.post("/api/capture/youtube", json={"url": ""})
    assert response.status_code == 400
    assert "YouTube URL" in response.get_json()["error"]

    response = client.post("/api/capture/youtube", json={"url": "https://example.com/watch?v=abc"})
    assert response.status_code == 400
    assert "YouTube" in response.get_json()["error"]


def test_youtube_capture_returns_local_video_source():
    with TemporaryDirectory() as tmp_dir:
        tmp_base = Path(tmp_dir)
        video_dir = tmp_base / "local_assets" / "capture" / "youtube"
        video_dir.mkdir(parents=True)
        video_path = video_dir / "yt_test001.mp4"
        video_path.write_bytes(b"fake video")

        module = load_server_module()
        module.BASE_DIR = tmp_base

        def fake_download(url):
            assert url == "https://www.youtube.com/watch?v=test001"
            return {
                "title": "Test Video",
                "filename": "yt_test001.mp4",
                "path": video_path,
                "size": video_path.stat().st_size,
            }

        module._download_youtube_capture = fake_download
        client = module.app.test_client()

        response = client.post("/api/capture/youtube", json={
            "url": "https://www.youtube.com/watch?v=test001"
        })
        assert response.status_code == 200
        body = response.get_json()
        assert body["ok"] is True
        assert body["source"]["type"] == "youtube"
        assert body["source"]["title"] == "Test Video"
        assert body["source"]["filename"] == "yt_test001.mp4"
        assert body["source"]["url"] == "capture/youtube/yt_test001.mp4"
        assert body["source"]["contentType"] == "video/mp4"


def test_youtube_capture_file_route_rejects_traversal():
    with TemporaryDirectory() as tmp_dir:
        tmp_base = Path(tmp_dir)
        module = load_server_module()
        module.BASE_DIR = tmp_base
        client = module.app.test_client()

        response = client.get("/capture/youtube/../secret.mp4")
        assert response.status_code == 404


if __name__ == "__main__":
    print("Running test_youtube_capture_api.py...")
    test_youtube_capture_rejects_invalid_urls()
    test_youtube_capture_returns_local_video_source()
    test_youtube_capture_file_route_rejects_traversal()
    print("test_youtube_capture_api: ok")
