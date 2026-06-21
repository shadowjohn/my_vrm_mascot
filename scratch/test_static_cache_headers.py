import importlib.util
from pathlib import Path


def load_server_module():
    spec = importlib.util.spec_from_file_location("static_cache_server_under_test", Path("server.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_dev_static_assets_are_not_cached():
    module = load_server_module()
    client = module.app.test_client()

    for path in ("/demo.html", "/js/MotionController.js"):
        response = client.get(path)
        assert response.status_code == 200
        assert response.headers["Cache-Control"] == "no-store"


if __name__ == "__main__":
    test_dev_static_assets_are_not_cached()
    print("PASS test_static_cache_headers")
