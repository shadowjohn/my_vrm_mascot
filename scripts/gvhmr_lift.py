import argparse
import json
from pathlib import Path


def write_json(path, payload):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def load_fixture(path, source, static_camera=False):
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    payload["source"] = source
    payload.setdefault("metadata", {})
    payload["metadata"]["staticCamera"] = bool(static_camera)
    return payload


def main():
    parser = argparse.ArgumentParser(description="Experimental GVHMR world-motion provider stub.")
    parser.add_argument("--video-path", default="")
    parser.add_argument("--fixture-json", default="")
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--static-camera", action="store_true")
    args = parser.parse_args()

    if args.fixture_json:
        output = load_fixture(args.fixture_json, "gvhmr", args.static_camera)
    else:
        output = {
            "ok": False,
            "source": "gvhmr",
            "reason": "missing_dependency",
            "frames": [],
            "metadata": {
                "videoPath": args.video_path,
                "staticCamera": bool(args.static_camera),
                "providerVersion": "experimental_stub",
            },
        }
    write_json(Path(args.output_json), output)


if __name__ == "__main__":
    main()
