# M20.7 Pose Library DB

## Goal

Build a small SQLite-backed pose material library for Alicia. It manages video, image, VRMA, and generated GVHMR/Alicia pose assets in one searchable place.

This is a library layer, not a new retargeting engine. Existing GVHMR, image pose, hand pose, Blender bake, and demo playback code should be reused.

## Scope

M20.7 includes:

- `db.sqlite` metadata store.
- `data.html` pose material management page.
- Background conversion worker in `server.py`.
- `pose_demo.html?id=...` item-based playback page.
- Import of existing GVHMR demo outputs and VRMA sample files.
- `index.html`, `README.md`, and `history.md` updates.

M20.7 does not include:

- Full VRMA authoring pipeline rewrite.
- Replacing existing `demo.html` immediately.
- New frontend framework.
- OpenAI API integration.

## Database

Use SQLite with WAL mode. Store searchable metadata in SQLite. Keep large files such as videos, VRMA files, thumbnails, and large motion JSON files on disk, referenced by path.

`charactor` is intentionally normalized to `character`.

```sql
CREATE TABLE IF NOT EXISTS kinds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  character TEXT NOT NULL DEFAULT 'alicia',
  del INTEGER NOT NULL DEFAULT 0,
  create_datetime TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kinds_id INTEGER,
  title TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT '',

  status INTEGER NOT NULL DEFAULT 0,
  progress REAL NOT NULL DEFAULT 0,
  progress_log TEXT NOT NULL DEFAULT '',

  create_datetime TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  process_start_datetime TEXT,
  process_end_datetime TEXT,
  process_ms INTEGER,

  frames INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  fps REAL,
  source_start_ms INTEGER,
  source_end_ms INTEGER,

  pose_json TEXT,
  pose_json_path TEXT,
  skeleton_json_path TEXT,
  hand_pose_json_path TEXT,
  thumb_path TEXT,
  preview_path TEXT,

  status_vrma INTEGER NOT NULL DEFAULT 0,
  vrma_path TEXT,
  vrma_start_datetime TEXT,
  vrma_end_datetime TEXT,
  vrma_process_ms INTEGER,

  error_message TEXT,
  metadata_json TEXT,
  del INTEGER NOT NULL DEFAULT 0,

  FOREIGN KEY(kinds_id) REFERENCES kinds(id)
);

CREATE INDEX IF NOT EXISTS idx_data_kind ON data(kinds_id, del);
CREATE INDEX IF NOT EXISTS idx_data_status ON data(status, del);
CREATE INDEX IF NOT EXISTS idx_data_source ON data(source_kind, del);
```

Status values:

- `status`: `0` queued, `1` processing, `2` done, `3` failed.
- `status_vrma`: `0` skip, `1` queued, `2` processing, `3` done, `4` failed.
- `source_kind`: `youtube`, `local_mp4`, `image`, `vrma`, `pose_json`.

## API

Add these minimal endpoints:

```txt
GET    /api/pose-db/kinds
POST   /api/pose-db/kinds
PATCH  /api/pose-db/kinds/<id>

GET    /api/pose-db/items
POST   /api/pose-db/items
GET    /api/pose-db/items/<id>
PATCH  /api/pose-db/items/<id>
DELETE /api/pose-db/items/<id>

POST   /api/pose-db/items/<id>/queue
POST   /api/pose-db/items/<id>/queue-vrma
POST   /api/pose-db/import/demo
POST   /api/pose-db/import/vrma
```

Deletes are soft deletes using `del = 1`.

## Background Worker

`server.py` starts one daemon worker thread. The worker polls every 2 seconds, claims one queued item, then runs the existing pipeline.

Processing rules:

- `youtube` and `local_mp4`: run existing GVHMR world motion and Alicia Blender bake pipeline.
- `image`: run existing image pose pipeline.
- `vrma`: register first; pose JSON conversion can be queued separately.
- `pose_json`: mark done if the referenced JSON exists.

The worker writes `progress`, `progress_log`, `process_*`, `frames`, `pose_json_path`, `thumb_path`, `preview_path`, and `error_message`.

Use one SQLite connection per thread. Keep transactions short: claim job in a transaction, process outside it, update progress with small writes.

## data.html

`data.html` is the pose material workbench.

Primary controls:

- Category selector.
- Create category.
- Edit category.
- Refresh.
- Search title/source/purpose.
- Create material.
- Import existing demo outputs.
- Import VRMA samples.

Table columns:

- Checkbox.
- Preview thumbnail.
- Title.
- Category.
- Source kind.
- Status.
- Progress.
- Frames.
- Created time.
- Actions.

Actions:

- Detail.
- Edit.
- Requeue.
- Queue VRMA.
- Preview.
- Delete.

Hover preview:

- If `preview_path` exists, play it muted in a small preview.
- Else show `thumb_path`.
- Else show a compact status card.

## pose_demo.html

`pose_demo.html?id=123` loads one DB item and plays it.

Changes from `demo.html`:

- No sample dropdown.
- Load pose by `id`.
- Show source metadata from DB.
- Optional GVHMR side-view skeleton.
- Skeleton viewer supports yaw, pitch, zoom, and reset.

`demo.html` remains as a development sandbox for now.

## Import

Initial imports:

- `conda_vm/gvhmr/GVHMR/outputs/demo/*/alicia_blender_bake_motion.json`
- `examples/m6_7_vrma_samples/**/*.vrma`
- `local_assets/vrma/**/*.vrma`

GVHMR demo imports should become completed `pose_json` items.

VRMA imports should become registered `vrma` items. They do not need to convert immediately.

## Files

Expected implementation files:

- `pose_db.py`: SQLite init, CRUD helpers, import helpers, worker helpers.
- `server.py`: API routes and worker startup.
- `data.html`: material library UI.
- `pose_demo.html`: DB-backed pose playback.
- `index.html`: add material library link.
- `README.md`: document the flow.
- `history.md`: record M20.7.

## Verification

Minimum checks:

- SQLite schema initializes on empty workspace.
- `GET /api/pose-db/kinds` and `GET /api/pose-db/items` return valid JSON.
- Creating an item inserts a row.
- Import demo scans existing GVHMR outputs without crashing.
- `data.html` loads and lists items.
- `pose_demo.html?id=...` loads one item.

## Implementation Order

1. Add DB init and CRUD API.
2. Add `data.html` list/create/search UI.
3. Add import endpoints for demo outputs and VRMA samples.
4. Add background worker queue.
5. Add `pose_demo.html?id=...`.
6. Update `index.html`, `README.md`, and `history.md`.
