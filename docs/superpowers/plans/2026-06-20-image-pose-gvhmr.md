# Image Pose GVHMR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `image_pose_lab.html` so one pasted/uploaded image can become an Alicia static pose through GVHMR and Blender IK bake.

**Architecture:** Reuse the existing GVHMR world-motion provider and `scripts/gvhmr_to_alicia_blender_bake.py`. Add only a tiny server endpoint that turns an image into `0_input_video.mp4`, runs the existing pipeline, writes JSON artifacts, and returns their local URLs.

**Tech Stack:** Flask, ffmpeg, GVHMR env, Blender CLI, existing Three.js/VRM frontend.

---

### Task 1: Backend Image Pose Endpoint

**Files:**
- Modify: `server.py`
- Test: `scratch/test_image_pose_helpers.py`

- [ ] Add helpers in `server.py`:

```python
def _image_pose_capture_dir():
    return BASE_DIR / "local_assets" / "capture" / "image_pose"

def _ffmpeg_executable_path():
    return os.environ.get("FFMPEG_EXE") or shutil.which("ffmpeg") or "ffmpeg"
```

- [ ] Add endpoint `POST /api/capture/image/pose` that accepts multipart field `image`, writes `source.png`, runs ffmpeg to create `0_input_video.mp4`, calls `_run_gvhmr_world_motion(video_path)`, writes `alicia_intermediate_landmarks.json`, runs Blender bake, and returns JSON URLs.

- [ ] Add one assert-based helper test for local URL safety and output shape.

### Task 2: Frontend Page

**Files:**
- Create: `image_pose_lab.html`

- [ ] Add a three-column page: source image, GVHMR side skeleton, Alicia pose.
- [ ] Support paste and file input.
- [ ] Call `/api/capture/image/pose`, then load returned `motionUrl` and `skeletonUrl`.
- [ ] Hold Alicia at the first usable frame and allow downloading returned JSON.

### Task 3: Verification

**Files:**
- Run only existing cheap checks plus the new helper test.

- [ ] Run:

```powershell
python scratch\test_image_pose_helpers.py
python -m py_compile server.py scripts\gvhmr_to_alicia_blender_bake.py
```

- [ ] Start or reuse `run_server.bat`, open `http://localhost:8765/image_pose_lab.html`, paste one full-body image, and verify the page returns Alicia pose JSON.
