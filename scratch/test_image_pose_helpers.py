from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server


def demo():
    inside = server.BASE_DIR / "conda_vm" / "gvhmr" / "GVHMR" / "outputs" / "demo" / "x.json"
    assert server._local_file_url(inside) == "conda_vm/gvhmr/GVHMR/outputs/demo/x.json"
    assert server._gvhmr_demo_output_dir_for_video(server.BASE_DIR / "local_assets" / "capture" / "image_pose" / "job" / "job.mp4").name == "job"

    outside = Path(server.BASE_DIR.anchor) / "outside.json"
    try:
        server._local_file_url(outside)
    except ValueError:
        pass
    else:
        raise AssertionError("outside path should be rejected")


if __name__ == "__main__":
    demo()
    print("ok")
