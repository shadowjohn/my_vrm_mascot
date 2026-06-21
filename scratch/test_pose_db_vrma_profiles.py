import json
import tempfile
from pathlib import Path

import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import pose_db


with tempfile.TemporaryDirectory() as tmp:
    base = Path(tmp)
    profile_dir = base / "examples" / "m6_7_vrma_samples" / "review"
    profile_dir.mkdir(parents=True)
    (profile_dir / "motion_profiles.json").write_text(json.dumps({
        "profiles": {
            "Clapping.vrma": {
                "source": "Clapping.vrma",
                "usageDescription": "這件事情不對，不是這樣",
                "agentUsage": ["嚴格禁止，不能這樣"],
                "description": "雙手在面前連續交叉數次",
                "motionCategory": "success",
                "motionScore": 4,
                "note": "雙手在面前連續交叉數次",
            }
        }
    }, ensure_ascii=False), encoding="utf-8")

    db_path = base / "db.sqlite"
    pose_db.create_item(db_path, {
        "title": "Clapping",
        "source_kind": "vrma",
        "source_url": "local_assets/vrma/Clapping.vrma",
        "purpose": "VRMA sample",
        "vrma_path": "local_assets/vrma/Clapping.vrma",
    })

    result = pose_db.apply_vrma_motion_profiles(db_path, base)
    row = pose_db.list_items(db_path, {"source_kind": "vrma"})[0]

    assert result["updated"] == 1
    assert "這件事情不對" in row["purpose"]
    assert "嚴格禁止" in row["purpose"]
    assert json.loads(row["metadata_json"])["motionCategory"] == "success"

print("pose db vrma profiles ok")
