import sys
import argparse
from pathlib import Path

# Add project root to sys.path so we can import gvhmr_lift
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from scripts.gvhmr_lift import parse_hmr4d_results, write_json

def main():
    parser = argparse.ArgumentParser(description="Parse any hmr4d_results.pt directly.")
    parser.add_argument("--pt-path", required=True, help="Path to hmr4d_results.pt")
    parser.add_argument("--output-json", required=True, help="Path to output world motion JSON")
    parser.add_argument("--gvhmr-root", required=True, help="Path to GVHMR folder")
    parser.add_argument("--static-camera", action="store_true")
    args = parser.parse_args()

    pt_path = Path(args.pt_path)
    if not pt_path.exists():
        print(f"Error: .pt file not found at {pt_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Parsing {pt_path}...")
    result = parse_hmr4d_results(
        pt_path,
        fps=30,
        static_camera=args.static_camera,
        gvhmr_root=args.gvhmr_root
    )

    write_json(Path(args.output_json), result)
    print(f"Success! Output saved to {args.output_json}")

if __name__ == "__main__":
    main()
