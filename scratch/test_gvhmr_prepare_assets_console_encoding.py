import importlib.util
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = REPO_ROOT / "scripts" / "gvhmr_prepare_assets.py"


def load_module():
    spec = importlib.util.spec_from_file_location("gvhmr_prepare_assets", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    module = load_module()
    text = module.report_json({"stderrTail": "decode replacement \ufffd"})
    text.encode("cp950")
    assert "\\ufffd" in text
    print("PASS test_gvhmr_prepare_assets_console_encoding")


if __name__ == "__main__":
    main()
