import argparse
import json
import subprocess
from pathlib import Path

PROVIDER_VERSION = "experimental_gvhmr_phase2a"


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
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


def base_metadata(args):
    metadata = {
        "videoPath": args.video_path,
        "staticCamera": bool(args.static_camera),
        "providerVersion": PROVIDER_VERSION,
    }
    if args.gvhmr_root:
        metadata["gvhmrRoot"] = str(Path(args.gvhmr_root))
    return metadata


def failure(reason, args, extra_metadata=None):
    metadata = base_metadata(args)
    if extra_metadata:
        metadata.update(extra_metadata)
    return {
        "ok": False,
        "source": "gvhmr",
        "reason": reason,
        "frames": [],
        "metadata": metadata,
    }


def resolve_demo_script(gvhmr_root):
    if not gvhmr_root:
        return None
    return Path(gvhmr_root) / "tools" / "demo" / "demo.py"


def build_demo_command(python_exe, demo_script, video_path, static_camera=False):
    command = [python_exe, str(demo_script), f"--video={video_path}"]
    if static_camera:
        command.append("-s")
    return command


def provider_output_for_args(args):
    if args.fixture_json:
        return load_fixture(args.fixture_json, "gvhmr", args.static_camera)

    demo_script = resolve_demo_script(args.gvhmr_root)
    if demo_script is None:
        return failure("missing_dependency", args, {"missing": "gvhmr_root"})
    if not demo_script.exists():
        return failure("missing_dependency", args, {"missingPath": str(demo_script)})
    if not args.video_path:
        return failure("missing_video", args)

    video_path = Path(args.video_path)
    if not video_path.exists():
        return failure("missing_video", args, {"missingPath": str(video_path)})

    command = build_demo_command(args.python_exe, demo_script, str(video_path), args.static_camera)
    command_metadata = {"command": command, "cwd": str(Path(args.gvhmr_root))}
    if args.dry_run:
        return failure("dry_run", args, command_metadata)

    result = subprocess.run(
        command,
        cwd=str(Path(args.gvhmr_root)),
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    command_metadata.update({
        "returnCode": result.returncode,
        "stdoutTail": result.stdout[-4000:],
        "stderrTail": result.stderr[-4000:],
    })
    if result.returncode != 0:
        return failure("provider_failed", args, command_metadata)
    return failure("parser_pending", args, command_metadata)


def main():
    parser = argparse.ArgumentParser(description="Experimental GVHMR world-motion provider adapter.")
    parser.add_argument("--video-path", default="")
    parser.add_argument("--fixture-json", default="")
    parser.add_argument("--gvhmr-root", default="")
    parser.add_argument("--python-exe", default="python")
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--static-camera", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    output = provider_output_for_args(args)
    write_json(Path(args.output_json), output)


if __name__ == "__main__":
    main()
