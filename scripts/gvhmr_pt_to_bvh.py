import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gvhmr_lift import parse_hmr4d_results


JOINT_TREE = {
    "hips": ["chest", "leftKnee", "rightKnee"],
    "chest": ["neck", "leftShoulder", "rightShoulder"],
    "neck": ["head"],
    "leftShoulder": ["leftElbow"],
    "leftElbow": ["leftWrist"],
    "rightShoulder": ["rightElbow"],
    "rightElbow": ["rightWrist"],
    "leftKnee": ["leftAnkle"],
    "leftAnkle": ["leftFoot"],
    "rightKnee": ["rightAnkle"],
    "rightAnkle": ["rightFoot"],
}

ROOT = "hips"
CHANNELS = "CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation"


def point(frame, name):
    return frame.get("landmarks", {}).get(name) or {"x": 0.0, "y": 0.0, "z": 0.0}


def vec_sub(a, b):
    return {
        "x": float(a["x"]) - float(b["x"]),
        "y": float(a["y"]) - float(b["y"]),
        "z": float(a["z"]) - float(b["z"]),
    }


def fmt(number):
    return f"{float(number):.6f}"


def write_joint(lines, name, first_frame, depth=0):
    indent = "  " * depth
    lines.append(f"{indent}{'ROOT' if name == ROOT else 'JOINT'} {name}")
    lines.append(f"{indent}{{")
    parent = {"x": 0.0, "y": 0.0, "z": 0.0} if name == ROOT else None
    if name != ROOT:
        for maybe_parent, children in JOINT_TREE.items():
            if name in children:
                parent = point(first_frame, maybe_parent)
                break
    offset = vec_sub(point(first_frame, name), parent or point(first_frame, ROOT))
    lines.append(f"{indent}  OFFSET {fmt(offset['x'])} {fmt(offset['y'])} {fmt(offset['z'])}")
    lines.append(f"{indent}  {CHANNELS}")
    children = JOINT_TREE.get(name, [])
    if children:
        for child in children:
            write_joint(lines, child, first_frame, depth + 1)
    else:
        lines.append(f"{indent}  End Site")
        lines.append(f"{indent}  {{")
        lines.append(f"{indent}    OFFSET 0.000000 0.050000 0.000000")
        lines.append(f"{indent}  }}")
    lines.append(f"{indent}}}")


def ordered_joints(name=ROOT):
    names = [name]
    for child in JOINT_TREE.get(name, []):
        names.extend(ordered_joints(child))
    return names


def frame_values(frame, names):
    values = []
    for name in names:
        p = point(frame, name)
        if name != ROOT:
            parent_name = next(parent for parent, children in JOINT_TREE.items() if name in children)
            p = vec_sub(p, point(frame, parent_name))
        values.extend([fmt(p["x"]), fmt(p["y"]), fmt(p["z"]), "0.000000", "0.000000", "0.000000"])
    return " ".join(values)


def world_motion_to_bvh(payload, fps=30):
    frames = [frame for frame in payload.get("frames", []) if frame.get("landmarks")]
    if not frames:
        raise ValueError("no GVHMR landmark frames to export")

    lines = ["HIERARCHY"]
    write_joint(lines, ROOT, frames[0])
    names = ordered_joints()

    lines.extend([
        "MOTION",
        f"Frames: {len(frames)}",
        f"Frame Time: {1 / float(fps):.8f}",
    ])
    lines.extend(frame_values(frame, names) for frame in frames)
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description="Convert GVHMR hmr4d_results.pt to a Blender-readable positional BVH.")
    parser.add_argument("--pt-path", required=True)
    parser.add_argument("--output-bvh", required=True)
    parser.add_argument("--gvhmr-root", required=True)
    parser.add_argument("--fps", type=float, default=30.0)
    parser.add_argument("--static-camera", action="store_true")
    args = parser.parse_args()

    payload = parse_hmr4d_results(
        Path(args.pt_path),
        fps=args.fps,
        static_camera=args.static_camera,
        gvhmr_root=Path(args.gvhmr_root),
    )
    if not payload.get("ok"):
        raise SystemExit(f"GVHMR parse failed: {payload.get('reason')}")

    # ponytail: positional BVH is only for Blender import proof; replace with rotational solve for production retarget.
    bvh = world_motion_to_bvh(payload, fps=args.fps)
    output = Path(args.output_bvh)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(bvh, encoding="utf-8", newline="\n")
    print(f"wrote {output}")


if __name__ == "__main__":
    main()
