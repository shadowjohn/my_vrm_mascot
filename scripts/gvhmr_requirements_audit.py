import argparse
import json
import sys
from pathlib import Path


def read_requirement_lines(path):
    with open(path, "r", encoding="utf-8") as f:
        return [
            line.strip()
            for line in f
            if line.strip() and not line.lstrip().startswith("#")
        ]


def requirement_name(line):
    if line.startswith("--"):
        return ""
    if " @ " in line:
        return line.split(" @ ", 1)[0].strip()
    for marker in ("==", ">=", "<=", "~=", ">", "<"):
        if marker in line:
            return line.split(marker, 1)[0].strip()
    return line.strip()


def audit_requirements(lines, platform_name):
    platform_lower = platform_name.lower()
    blockers = []
    warnings = []
    packages = []
    for line_number, line in enumerate(lines, start=1):
        name = requirement_name(line)
        if name:
            packages.append(name)
        if "linux_x86_64.whl" in line and platform_lower.startswith("win"):
            blockers.append({
                "code": "linux_wheel_on_windows",
                "line": line_number,
                "requirement": line,
                "message": "Requirement points to a Linux-only wheel and cannot be installed in a Windows env.",
            })
        if name in {"torch", "torchvision"} and "+cu121" in line:
            warnings.append({
                "code": "cuda121_torch_pin",
                "line": line_number,
                "requirement": line,
                "message": "GVHMR pins CUDA 12.1 PyTorch wheels; RTX 50-series / CUDA 12.8 may need a newer local torch stack.",
            })
    return {
        "ok": True,
        "installSafe": len(blockers) == 0,
        "platform": platform_name,
        "packageCount": len(packages),
        "packages": packages,
        "blockers": blockers,
        "warnings": warnings,
    }


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    parser = argparse.ArgumentParser(description="Audit GVHMR requirements before installing locally.")
    parser.add_argument("--requirements", required=True)
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--platform", default=sys.platform)
    args = parser.parse_args()
    payload = audit_requirements(read_requirement_lines(args.requirements), args.platform)
    write_json(Path(args.output_json), payload)


if __name__ == "__main__":
    main()
