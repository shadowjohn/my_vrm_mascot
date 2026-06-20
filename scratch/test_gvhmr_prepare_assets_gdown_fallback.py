import importlib.util
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = REPO_ROOT / "scripts" / "gvhmr_prepare_assets.py"


def load_module():
    spec = importlib.util.spec_from_file_location("gvhmr_prepare_assets", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeCompletedProcess:
    def __init__(self, returncode, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


def main():
    module = load_module()
    calls = []

    def fake_ensure_gdown(_install_gdown):
        return {"ok": True, "installed": False}

    current_root = None

    def fake_run(command, **_kwargs):
        calls.append(command)
        if len(calls) == 1:
            return FakeCompletedProcess(
                2,
                stderr="__main__.py: error: unrecognized arguments: --remaining-ok",
            )
        if "--folder" in command:
            for item in module.EXPECTED_DOWNLOADABLE_FILES:
                path = current_root / item
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("fake checkpoint", encoding="utf-8")
        return FakeCompletedProcess(0, stdout="download complete")

    module.ensure_gdown = fake_ensure_gdown
    module.subprocess.run = fake_run

    with tempfile.TemporaryDirectory(prefix="alicia-gvhmr-gdown-") as tmp:
        current_root = Path(tmp)
        report = module.run_gdown(current_root, install_gdown=True)

    assert report["attempted"] is True
    assert report["ok"] is True
    assert report["retryWithoutRemainingOk"] is True
    assert len(calls) == 2
    assert "--remaining-ok" in calls[0]
    assert "--remaining-ok" not in calls[1]
    print("PASS test_gvhmr_prepare_assets_gdown_fallback")


if __name__ == "__main__":
    main()
