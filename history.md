# My VRM Mascot — 開發歷程

## 2026-06-16

- 從 `D:\mytools\my_yolo_train_tool\my_vrm_mascot` 拆成獨立專案，移到 `D:\mytools\my_vrm_mascot`。
- 同步搬移 Alicia / VRM mascot 相關 `scratch` 測試與 `docs/superpowers` 規格、計畫文件。
- 新增獨立專案用的 `requirements.txt` 與 `.gitignore`，讓後續不需要依附 YOLO 訓練工具環境。
- 釐清資料狀態：repo 內實體 VRMA 是 11 支；172 是 motion profile / manifest 層的採礦資料，第三方外部 VRMA binary 未簽入。
- 調整 git 基底策略：VRM / VRMA binary 改為 local-only；git 只保留程式碼、測試、規格、manifest、motion profile、semantic registry 與衍生報表。
- 新增本機 VRMA 還原規則：建議放在 `local_assets/vrma/`，並讓 `/api/vrma-samples` 同時掃 legacy sample 目錄與 local assets 目錄。
- 完成 local VRMA restore 驗證：`local_assets/vrma/` 已還原 11 支 demo VRMA；`server._list_vrma_samples()` 回報 local 11、總樣本 22。
- 驗證通過：全套 `scratch/test_*.mjs`、`scratch/test_motion_profile_api.py`、`python -m py_compile server.py`、`git diff --check`、`git diff --cached --check`。
- 核准 M18 / M19 切法：M18 先做 HTTP-first 本機 Alicia Skill Bridge，M19 再處理 3wa online demo、SSE 或 WebSocket。
- 新增 M18 設計範圍：`/api/alicia/actions`、`/api/alicia/actions/next`、`/api/alicia/actions/:id/result`、in-memory queue、runtime polling、`performIntent` / `act` mapping 與測試；排除 WebSocket、SSE、Motion Mine、線上部署與 local VRMA binary 管理。
- 新增 Alicia release/deploy 設計方向：本機 repo 是唯一開發來源，3wa 或其他部署主機只吃版本化 release build，`current` 指向穩定版，專案只引用 `current/alicia-runtime.js`，客製化以 adapter 完成。
- v0.1.0 release package 定義為 runtime、approved assets、manifests、usage docs、skill interface 與 adapter examples；排除 `scratch/`、測試、Motion Mine、local assets、cache、logs 與大量內部 superpowers specs。
- 補強 release 鎖點：`build_release.bat vX.Y.Z` 固定輸出到 `dist/releases/vX.Y.Z/`，`release.json.version` 不含 `v`，且 `asset_manifest.json` 的每個 VRMA 必須列出 `licenseStatus`、`source`、`distributable`。
- 實作 `build_release.bat vX.Y.Z` 與 `scripts/build_release.ps1`，打包 Alicia Runtime 到 `dist/releases/vX.Y.Z/`，包含 runtime、approved assets、manifests、skill docs、usage docs、adapter examples、`release.json` 與 `asset_manifest.json`。
- 新增 `scratch/test_release_build.mjs`，用實際產出的 `dist/releases/v0.0.0/` 驗證 release 結構、`release.json.version`、VRMA 授權欄位，以及排除 `scratch/`、`local_assets/`、內部 specs 與 Motion Mine workbench。
- 新增 v0.1.2 Alicia Showcase Pack：由 172 筆 `motion_profiles.json` 人工描述與 `semantic_motion_registry.json` 產生 `showcase_motion_pack.json`、`showcase_events.json` 與報表，挑出 28 筆 mined showcase motions。
- `demo.php` 改成優先讀 `showcase_events.json`，讓 Director 先展示採礦成果；沒有 showcase pack 時才 fallback 到原本 semantic motion catalog。
- release build 會複製 `demo.php`、showcase manifests 與 `motions/showcase/` 精選 VRMA，並在 `asset_manifest.json` 保留 `approved` / `research_preview` / `distributable` 欄位，不假裝未驗證素材已授權。
- 新增 v0.1.3 Alicia Showcase 空間感修正：`VrmMascot` 公開 shared Three.js scene API，`demo.php` 的 toy room / props 改掛同一個 scene、共用 camera/depth/lighting，避免四周物件像 overlay 浮在畫面前方。
- 新增 v0.1.4 Alicia Showcase 近距離互動修正：低物件使用 `crouch_touch` 蹲下伸手，ScenePropLayer 提供 touch recoil / contact flash，GazeDirector 讓頭部追蹤互動物件並支援滑鼠暫時接管視線。
- 新增 v0.1.5 Alicia Showcase 蹲姿辨識度修正：加深 `crouch_touch` hips 下沉、腿部彎曲與上身前傾，並拉長蹲姿停留，避免看起來只是微微彎腰。
- 新增 v0.1.6 Alicia Showcase 對白/動作解耦修正：Director 對白改走 `dispatch('talking')` 且不帶 motion，避免 `performIntent()` preset motion 覆蓋 `crouch_touch` / kick / point 等 demo 專用互動動作。
- 新增 v0.1.7 Alicia Showcase 蹲姿安全修正：`crouch_touch` 改成半蹲伸手，降低 hips 下沉與腿部 rotation，避免沒有 IK / foot locking 時出現骨架折疊；測試加入腿部角度上限。
