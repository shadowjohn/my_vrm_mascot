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

    def fake_run(command, **_kwargs):
        calls.append(command)
        if "--folder" in command:
            return FakeCompletedProcess(1, stderr="folder quota exceeded")
        output_path = Path(command[command.index("-O") + 1])
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text("fake checkpoint", encoding="utf-8")
        return FakeCompletedProcess(0, stdout="download complete")

    module.ensure_gdown = fake_ensure_gdown
    module.subprocess.run = fake_run

    with tempfile.TemporaryDirectory(prefix="alicia-gvhmr-individual-") as tmp:
        report = module.run_gdown(Path(tmp), install_gdown=True)

    assert report["attempted"] is True
    assert report["ok"] is True
    assert len([call for call in calls if "--folder" in call]) == 1
    individual_calls = [call for call in calls if "--folder" not in call]
    assert len(individual_calls) == len(module.EXPECTED_DOWNLOADABLE_FILES)
    assert len(report["individualDownloads"]) == len(module.EXPECTED_DOWNLOADABLE_FILES)
    assert all(item["ok"] for item in report["individualDownloads"])
    print("PASS test_gvhmr_prepare_assets_individual_download")


if __name__ == "__main__":
    main()
