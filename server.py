import os
import json
import mimetypes
import subprocess
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory

mimetypes.add_type('text/html', '.php')

app = Flask(__name__, static_folder='.', static_url_path='')

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_MOTION_PROFILE_STORE_PATH = BASE_DIR / "examples" / "m6_7_vrma_samples" / "review" / "motion_profiles.json"
DEFAULT_MOTION_MINING_LOG_STORE_PATH = BASE_DIR / "examples" / "m6_7_vrma_samples" / "review" / "mining_log.json"
VRMA_SAMPLE_DIR = BASE_DIR / "examples" / "m6_7_vrma_samples"
LOCAL_VRMA_SAMPLE_DIR = BASE_DIR / "local_assets" / "vrma"
MOTION_PROFILE_CATEGORIES = {
    "present",
    "point",
    "think",
    "warning",
    "success",
    "candidate_future",
    "reject",
}


def _now_iso():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _motion_profile_store_path():
    configured = os.environ.get("MOTION_PROFILE_STORE_PATH")
    return Path(configured) if configured else DEFAULT_MOTION_PROFILE_STORE_PATH


def _motion_mining_log_store_path():
    configured = os.environ.get("MOTION_MINING_LOG_STORE_PATH")
    return Path(configured) if configured else DEFAULT_MOTION_MINING_LOG_STORE_PATH


def _empty_motion_profile_document():
    return {
        "schemaVersion": 1,
        "updatedAt": "",
        "profiles": {},
    }


def _load_motion_profile_document():
    path = _motion_profile_store_path()
    if not path.exists():
        return _empty_motion_profile_document()
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        return _empty_motion_profile_document()
    profiles = data.get("profiles", {})
    if not isinstance(profiles, dict):
        profiles = {}
    return {
        "schemaVersion": 1,
        "updatedAt": str(data.get("updatedAt", "")),
        "profiles": profiles,
    }


def _write_motion_profile_document(document):
    path = _motion_profile_store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(document, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")
    tmp_path.replace(path)


def _load_motion_mining_entries():
    path = _motion_mining_log_store_path()
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if isinstance(data, dict) and isinstance(data.get("entries"), list):
        return [item for item in data["entries"] if isinstance(item, dict)]
    return []


def _write_motion_mining_entries(entries):
    path = _motion_mining_log_store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")
    tmp_path.replace(path)


def _list_vrma_samples():
    samples = []
    roots = [
        (VRMA_SAMPLE_DIR, False, "examples"),
        # 第三方 VRMA binary 不進 git；local_assets 是本機採礦還原區。
        (LOCAL_VRMA_SAMPLE_DIR, True, "local_assets"),
    ]

    for root_dir, force_external, source_root in roots:
        if not root_dir.exists():
            continue

        for path in sorted(root_dir.rglob("*.vrma")):
            try:
                relative_to_root = path.relative_to(root_dir)
                relative_to_base_dir = path.relative_to(BASE_DIR)
            except ValueError:
                continue

            samples.append({
                "name": path.name,
                "path": relative_to_root.as_posix(),
                "url": relative_to_base_dir.as_posix(),
                "external": force_external or "external" in relative_to_root.parts,
                "sourceRoot": source_root,
                "size": path.stat().st_size,
            })

    return sorted(samples, key=lambda item: (item["external"], item["name"].lower(), item["path"].lower()))


def _normalize_motion_profile(profile):
    if not isinstance(profile, dict):
        raise ValueError("profile 必須是物件")

    source = str(profile.get("source", "")).strip()
    if not source or source != os.path.basename(source) or not source.lower().endswith(".vrma"):
        raise ValueError("source 必須是單一 .vrma 檔名")

    category = str(profile.get("motionCategory", "")).strip()
    if category not in MOTION_PROFILE_CATEGORIES:
        raise ValueError("motionCategory 不在允許清單")

    try:
        score = int(profile.get("motionScore", 3))
    except (TypeError, ValueError):
        score = 3
    score = max(1, min(5, score))
    description = str(profile.get("description", profile.get("note", "")))[:2000]
    usage_description = str(profile.get("usageDescription", ""))[:4000]
    agent_usage = profile.get("agentUsage", [])
    if not isinstance(agent_usage, list):
        agent_usage = []
    agent_usage = [str(item).strip()[:500] for item in agent_usage if str(item).strip()]

    return {
        "source": source,
        "motionCategory": category,
        "motionScore": score,
        "description": description,
        "usageDescription": usage_description,
        "agentUsage": agent_usage,
        "note": description,
        "updatedAt": str(profile.get("updatedAt", ""))[:64] or _now_iso(),
    }


def _normalize_motion_mining_entry(entry):
    if not isinstance(entry, dict):
        raise ValueError("entry 必須是物件")

    source = str(entry.get("source", "")).strip()
    if not source or source != os.path.basename(source) or not source.lower().endswith(".vrma"):
        raise ValueError("source 必須是單一 .vrma 檔名")

    status = str(entry.get("status", "described")).strip() or "described"
    if status not in {"described", "classified"}:
        raise ValueError("status 必須是 described 或 classified")

    try:
        sample_time = round(float(entry.get("sampleTime", 0)), 3)
    except (TypeError, ValueError):
        sample_time = 0.0
    sample_time = max(0.0, sample_time)

    category = entry.get("category")
    if category is not None:
        category = str(category).strip()
        if category and category not in MOTION_PROFILE_CATEGORIES:
            raise ValueError("category 不在允許清單")
        category = category or None

    agent_usage = entry.get("agentUsage", [])
    if not isinstance(agent_usage, list):
        agent_usage = []
    agent_usage = [str(item).strip()[:500] for item in agent_usage if str(item).strip()]

    suggestion = entry.get("suggestion", {})
    if not isinstance(suggestion, dict):
        suggestion = {}

    return {
        "id": str(entry.get("id", "")).strip()[:80],
        "source": source,
        "sampleTime": sample_time,
        "status": status,
        "motionDescription": str(entry.get("motionDescription", ""))[:4000],
        "usageDescription": str(entry.get("usageDescription", ""))[:4000],
        "agentUsage": agent_usage,
        "category": category,
        "classificationSource": str(entry.get("classificationSource", "pending_llm"))[:80],
        "descriptionSource": str(entry.get("descriptionSource", "human"))[:80],
        "suggestion": suggestion,
        "createdAt": str(entry.get("createdAt", ""))[:64] or _now_iso(),
        "updatedAt": _now_iso(),
    }


def _next_mining_entry_id(entries, prefix):
    marker = f"{prefix}_"
    used = []
    for entry in entries:
        entry_id = str(entry.get("id", ""))
        if entry_id.startswith(marker):
            try:
                used.append(int(entry_id[len(marker):]))
            except ValueError:
                pass
    return f"{prefix}_{max(used, default=0) + 1:03d}"


def _upsert_motion_mining_entry(entries, entry):
    for index, existing in enumerate(entries):
        same_source_time = (
            existing.get("source") == entry["source"]
            and round(float(existing.get("sampleTime", 0)), 3) == entry["sampleTime"]
            and existing.get("status") == entry["status"]
        )
        same_id_and_source = (
            entry["id"]
            and existing.get("id") == entry["id"]
            and existing.get("source") == entry["source"]
        )
        if same_source_time or same_id_and_source:
            merged = {**existing, **entry}
            if same_source_time and existing.get("id"):
                merged["id"] = existing["id"]
            if not merged.get("id"):
                merged["id"] = _next_mining_entry_id(entries, entry["status"])
            entries[index] = merged
            return merged

    if not entry["id"] or any(item.get("id") == entry["id"] for item in entries):
        entry["id"] = _next_mining_entry_id(entries, entry["status"])
    entries.append(entry)
    return entry

@app.route('/')
def index():
    return app.send_static_file('index.html')


@app.route('/demo.php')
def serve_php():
    try:
        # Check if release demo.php exists, otherwise use the root one
        php_file = BASE_DIR / "dist" / "releases" / "v0.1.0" / "demo.php"
        if not php_file.is_file():
            php_file = BASE_DIR / "demo.php"
            cwd = BASE_DIR
        else:
            cwd = php_file.parent
        res = subprocess.run(
            ['php', str(php_file)],
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8'
        )
        if res.returncode == 0:
            return res.stdout
        else:
            return f"PHP Execution Error:<pre>{res.stderr}</pre>", 500
    except Exception as e:
        return f"Failed to run PHP: {str(e)}", 500


@app.route('/js/vendor/<path:filepath>')
def serve_vendor(filepath):
    filename = os.path.basename(filepath)
    vendor_path = BASE_DIR / "vendor" / filename
    if vendor_path.is_file():
        return send_from_directory(vendor_path.parent, vendor_path.name)
    return "File not found", 404


@app.route('/motions/<path:filepath>')
def serve_motions(filepath):
    filename = os.path.basename(filepath)

    local_direct = LOCAL_VRMA_SAMPLE_DIR / filename
    if local_direct.is_file():
        return send_from_directory(LOCAL_VRMA_SAMPLE_DIR, filename)

    examples_direct = VRMA_SAMPLE_DIR / filename
    if examples_direct.is_file():
        return send_from_directory(VRMA_SAMPLE_DIR, filename)

    if LOCAL_VRMA_SAMPLE_DIR.exists():
        for path in LOCAL_VRMA_SAMPLE_DIR.rglob(filename):
            if path.is_file():
                return send_from_directory(path.parent, path.name)

    if VRMA_SAMPLE_DIR.exists():
        for path in VRMA_SAMPLE_DIR.rglob(filename):
            if path.is_file():
                return send_from_directory(path.parent, path.name)

    full_static_path = Path(app.static_folder) / "motions" / filepath
    if full_static_path.is_file():
        return send_from_directory(full_static_path.parent, full_static_path.name)

    return "File not found", 404


@app.route('/api/vrma-samples', methods=['GET'])
def vrma_samples():
    return jsonify({
        "ok": True,
        "base": "examples/m6_7_vrma_samples",
        "localBase": "local_assets/vrma",
        "samples": _list_vrma_samples(),
    })


@app.route('/api/motion-profiles', methods=['GET', 'POST'])
def motion_profiles():
    if request.method == 'GET':
        document = _load_motion_profile_document()
        return jsonify({
            "ok": True,
            "schemaVersion": document["schemaVersion"],
            "updatedAt": document["updatedAt"],
            "profiles": document["profiles"],
        })

    data = request.get_json() or {}
    try:
        profile = _normalize_motion_profile(data.get("profile"))
    except ValueError as exc:
        return jsonify({ "ok": False, "error": str(exc) }), 400

    document = _load_motion_profile_document()
    document["schemaVersion"] = 1
    document["updatedAt"] = _now_iso()
    document.setdefault("profiles", {})[profile["source"]] = profile
    _write_motion_profile_document(document)

    return jsonify({
        "ok": True,
        "profile": profile,
        "profiles": document["profiles"],
        "path": "examples/m6_7_vrma_samples/review/motion_profiles.json",
    })


@app.route('/api/motion-mining-log', methods=['GET', 'POST'])
def motion_mining_log():
    if request.method == 'GET':
        entries = _load_motion_mining_entries()
        return jsonify({
            "ok": True,
            "entries": entries,
            "path": "examples/m6_7_vrma_samples/review/mining_log.json",
        })

    data = request.get_json() or {}
    try:
        entry = _normalize_motion_mining_entry(data.get("entry"))
    except ValueError as exc:
        return jsonify({ "ok": False, "error": str(exc) }), 400

    entries = _load_motion_mining_entries()
    saved_entry = _upsert_motion_mining_entry(entries, entry)
    _write_motion_mining_entries(entries)

    return jsonify({
        "ok": True,
        "entry": saved_entry,
        "entries": entries,
        "path": "examples/m6_7_vrma_samples/review/mining_log.json",
    })

@app.route('/api/llm', methods=['POST'])
def llm_proxy():
    # 接收並清理前端輸入，限制 1000 字元
    data = request.get_json() or {}
    message = str(data.get("message", "")).strip()[:1000]

    # 保護點 2：空字串回傳 error schema
    if not message:
        return jsonify({
            "intent": "error",
            "text": "請先輸入訊息。",
            "emotion": "sorrow",
            "motion": "shake_head"
        })

    # 優先解析 Context Digest (Phase 12.5)
    context_digest = data.get("contextDigest", {})
    if context_digest:
        selected_feature = context_digest.get("selectedFeature", "none")
        active_element = context_digest.get("activeElement", "none")
        active_panel = context_digest.get("activePanel", "none")
        last_intent = context_digest.get("lastIntent", "none")
        center = context_digest.get("mapCenter", [120.6, 24.1])
        validation_errors = context_digest.get("validationErrors", [])

        # 將 validationErrors 對應回相容格式
        address_invalid = any(k in validation_errors for k in ["reportAddress", "address"])
        email_invalid = any(k in validation_errors for k in ["reportEmail", "email"])
        validation_state = {
            "reportAddress": { "valid": not address_invalid },
            "reportEmail": { "valid": not email_invalid }
        }
        form_state = {
            "reportEmail": "",
            "reportAddress": ""
        }

        # 模擬上一筆執行工具歷史
        last_tool_result = None
        if last_intent in ["download_report", "query_pipe", "query_cctv"]:
            last_tool_result = {
                "tool": last_intent,
                "result": {
                    "data": {
                        "depth": 1.8,
                        "status": "online"
                    }
                }
            }
    else:
        # 向下相容傳統格式 (Phase 9A, 10A, 11)
        memory = data.get("memory", [])
        last_tool_result = None
        for item in memory:
            if item.get("type") == "tool_result":
                last_tool_result = item
                break
        spatial_context = data.get("spatialContext", {})
        selected_feature = spatial_context.get("selectedFeature", "none")
        center = spatial_context.get("mapCenter", [120.6, 24.1])
        dom_context = data.get("domContext", {}) or {}
        validation_state = dom_context.get("validationState", {}) or {}
        form_state = dom_context.get("formState", {}) or {}

    # 坐標格式安全校驗與轉換
    if not isinstance(center, list) or len(center) != 2:
        center = [120.6, 24.1]
    try:
        lng = float(center[0])
        lat = float(center[1])
    except (ValueError, TypeError):
        lng, lat = 120.6, 24.1

    # 空間至百分比對應 (供 Mock GIS Panel 使用)
    if abs(lng - 120.65) < 0.01 and abs(lat - 24.15) < 0.01:
        x, y = 65, 45
    elif abs(lng - 120.63) < 0.01 and abs(lat - 24.16) < 0.01:
        x, y = 30, 60
    else:
        x, y = 50, 50

    # A. 表單輔助 (為什麼不能送出？)
    message_lower = message.lower()
    if any(k in message_lower for k in ["不能送出", "無法送出", "校驗失敗", "欄位校驗"]):
        address_state = validation_state.get("reportAddress", {})
        email_state = validation_state.get("reportEmail", {})

        email_val = form_state.get("reportEmail", "")
        address_val = form_state.get("reportAddress", "")

        if address_state and not address_state.get("valid", True):
            return jsonify({
                "intent": "warning",
                "text": "維護地址欄位是必填的喔，請先在地址欄位輸入地址。",
                "emotion": "angry",
                "motion": "warning"
            })
        elif email_state and not email_state.get("valid", True):
            if not email_val:
                return jsonify({
                    "intent": "warning",
                    "text": "聯絡信箱欄位是必填的喔，請輸入電子信箱。",
                    "emotion": "angry",
                    "motion": "warning"
                })
            else:
                return jsonify({
                    "intent": "warning",
                    "text": f"聯絡信箱格式不對，您填的是 '{email_val}'，請補上完整網域（例如 abc@example.com）。",
                    "emotion": "angry",
                    "motion": "warning"
                })
        else:
            return jsonify({
                "intent": "success",
                "text": "目前回報單的欄位看起來都是正確填寫的喔！如果有遇到其他問題，請告訴我。",
                "emotion": "joy",
                "motion": "wave"
            })

    # B. 下載報告與 UI 指引
    if "下載" in message_lower:
        if selected_feature != "none":
            return jsonify({
                "intent": "download_report",
                "confidence": 0.98,
                "text": "好的，我立刻為您下載當前選取物件的維護報告...",
                "tool": "download_report",
                "args": { "featureId": selected_feature },
                "afterText": "我已經幫您下載完成囉～"
            })
        else:
            return jsonify({
                "intent": "warning",
                "text": "目前沒有選取地圖物件，請先在左側點選要下載的管線或監視器。",
                "emotion": "sorrow",
                "motion": "warning"
            })
    elif any(k in message_lower for k in ["成果在哪", "下載按鈕"]):
        return jsonify({
            "intent": "success",
            "text": "在網頁的右上方有一個「📥 下載報表」按鈕，我已經在畫面頂部幫您標示出來囉！",
            "emotion": "joy",
            "motion": "wave"
        })

    # C. 地圖 + DOM 混合推理 (這個可以匯出嗎？)
    if any(k in message_lower for k in ["匯出", "可以匯出嗎"]):
        if selected_feature == "PIPE-008":
            return jsonify({
                "intent": "success",
                "text": "可以，目前選取的是管線物件 PIPE-008（sewer 圖層），右側的「資料匯出面板」已就緒，您可以直接點選「匯出物件」按鈕進行匯出。",
                "emotion": "joy",
                "motion": "wave"
            })
        elif selected_feature == "CCTV-042":
            return jsonify({
                "intent": "success",
                "text": "可以，目前選取的是監視器設備 CCTV-042（monitoring 圖層），右側的「資料匯出面板」已就緒，您可以點選「匯出物件」按鈕以 CSV 或 GeoJSON 匯出。",
                "emotion": "joy",
                "motion": "wave"
            })
        else:
            return jsonify({
                "intent": "warning",
                "text": "目前沒有選取地圖上的任何物件喔。請先點選地圖上的管線或監視器，然後使用右側的「資料匯出面板」進行匯出。",
                "emotion": "sorrow",
                "motion": "warning"
            })

    # 1. 空間臨近查詢優先
    message_lower = message.lower()
    if any(k in message_lower for k in ["附近", "這附近", "這區"]):
        if any(k in message_lower for k in ["管線", "pipe"]):
            return jsonify({
                "intent": "searching",
                "text": f"好的，我以目前地圖中心坐標 [{lng}, {lat}] 為您搜尋附近的管線...",
                "emotion": "fun",
                "motion": "presenting",
                "tool": "query_pipe",
                "args": { "x": x, "y": y },
                "afterText": "已經搜尋中心座標附近的管線，{summary}"
            })
        if any(k in message_lower for k in ["監視器", "cctv", "camera"]):
            return jsonify({
                "intent": "searching",
                "text": f"好的，我以目前地圖中心坐標 [{lng}, {lat}] 讀取附近的監視器影像...",
                "emotion": "fun",
                "motion": "presenting",
                "tool": "query_cctv",
                "args": { "x": x, "y": y },
                "afterText": "已經載入中心座標附近的監視器，{summary}"
            })

    # 2. 處理與對話歷史或空間選取物件相關的代名詞詢問
    # a. 詢問管線深度
    if any(k in message_lower for k in ["多深", "深度", "它有多深"]):
        # 優先從歷史對話解析
        if last_tool_result and last_tool_result.get("tool") == "query_pipe":
            depth = last_tool_result.get("result", {}).get("data", {}).get("depth", 1.8)
            return jsonify({
                "intent": "success",
                "text": f"這條管線的深度為 {depth} 公尺。",
                "emotion": "joy",
                "motion": "wave"
            })
        # 空間選取物件 Fallback
        elif selected_feature == "PIPE-008":
            return jsonify({
                "intent": "success",
                "text": "根據地圖目前的選取項目，管線 PIPE-008 的深度為 1.8 公尺。",
                "emotion": "joy",
                "motion": "wave"
            })

    # b. 詢問監視器狀態
    if any(k in message_lower for k in ["狀態", "影像狀態", "連線狀態"]):
        # 優先從歷史對話解析
        if last_tool_result and last_tool_result.get("tool") == "query_cctv":
            status = last_tool_result.get("result", {}).get("data", {}).get("status", "online")
            return jsonify({
                "intent": "success",
                "text": f"這台監視器的連線狀態是 {status}。",
                "emotion": "joy",
                "motion": "wave"
            })
        # 空間選取物件 Fallback
        elif selected_feature == "CCTV-042":
            return jsonify({
                "intent": "success",
                "text": "目前地圖選取的監視器 CCTV-042 連線狀態為 online。",
                "emotion": "joy",
                "motion": "wave"
            })

    # 判斷是否觸發 GIS 管線查詢 (Phase 6 & 7)
    if any(keyword in message.lower() for keyword in ["管線", "查詢", "地圖", "gis", "search", "query"]):
        return jsonify({
            "intent": "searching",
            "text": "我幫您查詢附近管線...",
            "emotion": "fun",
            "motion": "presenting",
            "tool": "query_pipe",
            "args": {
                "x": 65,
                "y": 45
            },
            "afterText": "地圖查詢完成，{summary}"
        })

    # 判斷是否觸發 CCTV 監視器查詢 (Phase 7)
    if any(keyword in message.lower() for keyword in ["監視器", "監控", "cctv", "camera"]):
        return jsonify({
            "intent": "searching",
            "text": "正在讀取附近監視器即時影像...",
            "emotion": "fun",
            "motion": "presenting",
            "tool": "query_cctv",
            "args": {
                "x": 30,
                "y": 60
            },
            "afterText": "監視器連線成功"
        })

    # 最小版：回傳固定 JSON schema
    response_data = {
        "intent": "success",
        "text": "羽山哥，LLM Connector 已成功接上！",
        "emotion": "joy",
        "motion": "wave"
    }
    return jsonify(response_data)


@app.route('/alicia-runtime.js')
def serve_runtime():
    release_path = BASE_DIR / "dist" / "releases" / "v0.1.0" / "alicia-runtime.js"
    if release_path.is_file():
        return send_from_directory(release_path.parent, release_path.name)
    return "File not found", 404


@app.route('/manifests/<path:filepath>')
def serve_manifests(filepath):
    release_path = BASE_DIR / "dist" / "releases" / "v0.1.0" / "manifests" / filepath
    if release_path.is_file():
        return send_from_directory(release_path.parent, release_path.name)
    return "File not found", 404


if __name__ == '__main__':
    # 保護點 1：限制本機 127.0.0.1，關閉對外綁定
    app.run(host='127.0.0.1', port=8765, debug=True)
