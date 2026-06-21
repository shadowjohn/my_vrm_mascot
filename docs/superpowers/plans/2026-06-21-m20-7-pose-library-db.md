# M20.7 Pose Library DB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a SQLite-backed Alicia pose material library that can catalog, import, queue, and preview pose assets.

**Architecture:** Use one small `pose_db.py` module for SQLite schema, CRUD, imports, and job claiming. Keep `server.py` as the Flask route layer and reuse existing GVHMR / image / VRMA helpers. Add `data.html` as the management UI and `pose_demo.html?id=...` as the DB-backed playback page.

**Tech Stack:** Python stdlib `sqlite3`, Flask, existing static HTML/CSS/JS, existing Three.js/Alicia runtime code.

---

### Task 1: SQLite Module

**Files:**
- Create: `pose_db.py`
- Test: `python pose_db.py --self-test`

- [ ] Add `pose_db.py` with `init_db()`, `list_kinds()`, `create_kind()`, `list_items()`, `create_item()`, `update_item()`, `soft_delete_item()`, `claim_next_job()`, `append_progress()`, and `finish_job()`.
- [ ] Use `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000`.
- [ ] Add a `--self-test` path that creates a temp DB, inserts one kind and one item, claims the item, finishes it, and asserts the status becomes `2`.
- [ ] Run `python pose_db.py --self-test`; expected output: `pose_db self-test ok`.
- [ ] Commit: `feat: add pose sqlite store`.

### Task 2: Flask API

**Files:**
- Modify: `server.py`
- Test: `python -m py_compile server.py pose_db.py`

- [ ] Import `pose_db`.
- [ ] Add `POSE_DB_PATH = BASE_DIR / "db.sqlite"`.
- [ ] Add routes:
  - `GET /api/pose-db/kinds`
  - `POST /api/pose-db/kinds`
  - `PATCH /api/pose-db/kinds/<id>`
  - `GET /api/pose-db/items`
  - `POST /api/pose-db/items`
  - `GET /api/pose-db/items/<id>`
  - `PATCH /api/pose-db/items/<id>`
  - `DELETE /api/pose-db/items/<id>`
  - `POST /api/pose-db/items/<id>/queue`
  - `POST /api/pose-db/items/<id>/queue-vrma`
  - `POST /api/pose-db/import/demo`
  - `POST /api/pose-db/import/vrma`
- [ ] Keep route validation small: required title/source kind, valid status integers, soft delete only.
- [ ] Run `python -m py_compile server.py pose_db.py`; expected: no output.
- [ ] Commit: `feat: expose pose db api`.

### Task 3: Import Existing Assets

**Files:**
- Modify: `pose_db.py`
- Modify: `server.py`
- Test: `python pose_db.py --self-test`

- [ ] Add `import_gvhmr_demo_outputs(base_dir, gvhmr_demo_root)` that scans `*/alicia_blender_bake_motion.json` and inserts completed `pose_json` rows.
- [ ] Add `import_vrma_samples(base_dir, roots)` that scans `.vrma` files and inserts `vrma` rows with `status_vrma = 3`.
- [ ] De-duplicate by `source_kind + source_url`.
- [ ] Expose both through existing import routes.
- [ ] Run `python pose_db.py --self-test`; expected output: `pose_db self-test ok`.
- [ ] Commit: `feat: import existing pose assets`.

### Task 4: data.html

**Files:**
- Create: `data.html`
- Modify: `index.html`
- Test: browser smoke at `http://localhost:8765/data.html`

- [ ] Build a single-page static management UI.
- [ ] Load kinds and items from `/api/pose-db/*`.
- [ ] Provide category select, search box, create item form, import demo button, import VRMA button, refresh button.
- [ ] Render table with checkbox, thumbnail/status card, title, category, source kind, status, progress, frames, create time, and actions.
- [ ] Add row actions: preview, requeue, queue VRMA, delete.
- [ ] Add `data.html` link to `index.html`.
- [ ] Browser smoke: page loads, empty state renders, refresh does not throw.
- [ ] Commit: `feat: add pose data workbench`.

### Task 5: Background Worker

**Files:**
- Modify: `server.py`
- Modify: `pose_db.py`
- Test: `python -m py_compile server.py pose_db.py`

- [ ] Add one daemon thread guarded by a module-level boolean.
- [ ] Poll every 2 seconds.
- [ ] Claim one queued item.
- [ ] For `pose_json`, mark done if file exists.
- [ ] For `vrma`, keep registered and do not auto-convert in M20.7.
- [ ] For `youtube`, `local_mp4`, and `image`, write a clear `progress_log` that says manual processing is still done through current lab pages unless a source file is already available.
- [ ] Avoid long SQLite transactions.
- [ ] Run `python -m py_compile server.py pose_db.py`; expected: no output.
- [ ] Commit: `feat: add pose db worker`.

### Task 6: pose_demo.html

**Files:**
- Create: `pose_demo.html`
- Test: browser smoke at `http://localhost:8765/pose_demo.html?id=1`

- [ ] Copy the minimal useful playback path from `demo.html`.
- [ ] Replace sample dropdown with DB item loading by `id`.
- [ ] Load `pose_json_path` or inline `pose_json`.
- [ ] Keep existing Alicia playback and source metadata display.
- [ ] Add GVHMR side skeleton yaw, pitch, zoom, reset controls.
- [ ] Browser smoke: missing id shows an error; valid id attempts to load item JSON.
- [ ] Commit: `feat: add pose db demo page`.

### Task 7: Docs

**Files:**
- Modify: `README.md`
- Modify: `history.md`

- [ ] Document `data.html`.
- [ ] Document `pose_demo.html?id=...`.
- [ ] Document `db.sqlite` and status fields.
- [ ] Add a M20.7 note to `history.md`.
- [ ] Commit: `docs: document pose library db`.

## Self-Review

- Spec coverage: DB, API, imports, worker, `data.html`, `pose_demo.html`, index, README, and history are covered.
- Deferred by design: full VRMA conversion and replacing `demo.html`.
- Test coverage: one stdlib DB self-test plus compile and browser smoke checks.
