# My VRM Mascot — 開發歷程

## 2026-06-17

- 新增 v0.1.11 Alicia Showcase 程序步態修正：`walk` / `walk_cycle` 改走 MotionController 內建 procedural gait，公開展示不再依賴 raw Mixamo walking VRMA 直接播放。
- 保留 v0.1.10 的 Mixamo VRMA retarget alias 修正作為研究與 Motion Mine 能力，但 `AliciaStageWalker.moveTo()` 不再預載 `walk_cycle` VRMA，避免 raw retarget 座標差異造成骨架扭曲。
- 新增 regression test：確認 `walk_cycle` 不啟動 VRMA mixer，且 upper/lower legs 與 feet 會隨時間變化，避免回到只有 scene root 位移的滑步狀態。
- 新增 v0.1.12 Alicia Showcase runtime lower-body lock：非 locomotion VRMA 只 retarget 上半身，`punch_short` / warning / wave / presenting 不再讓 raw VRMA 的 hips、legs、feet track 把腳帶飛。
- 新增 regression test：`walk_cycle` 仍可保留 Mixamo leg tracks，`punch_short` 會濾掉 hips / legs / feet，只保留 spine / arms。
- 新增 v0.1.13 Alicia Showcase safe runtime motion：核心語意動作不再透過 `getVrmaUrlForName()` 解析 raw VRMA，`demo.php` 的 custom showcase 動作也移除 `vrmaMap` 直播放，統一使用程序 pose / MotionClips / safe custom animation。
- 明確切開素材層與演出層：raw VRMA 只留給 Motion Mine / Lab 預覽與後續 recipe 生產，不直接接公開 demo runtime，避免手臂跑到背後或下半身偶發失控。
- 新增 v0.1.14 Alicia StageWalker 面向修正：`moveTo()` 接受互動物件 `faceWorld`，移動時以目標物件方向決定 root yaw，並用 shortest-angle interpolation 平滑轉身。
- 3D root 位移改以 `distance3d` 觸發 `walk_cycle`，避免短距離場景位移只有 root 平移、腳沒有步態。
- 新增 v0.1.15 Alicia StageWalker 倒退走修正：`facingRotationFor()` 改用 `rootBaseRotationY + atan2(dx, dz)` 的完整 2D 目標向量 yaw，補上目標在角色後方時的 180 度轉向。
- 3D walk 啟動門檻降低到 `distance3d > 0.006`，減少短距離 root 位移但腳不動的觀感。
- 新增 v0.1.16 Alicia StageWalker 起步轉身修正：walking 模式下 rotation 先行、position 延後，避免轉身與位移同時開始時仍像背對目標倒退滑行。

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
- 接續 antigravity 的 v0.1.8 Alicia Showcase VRMA playback 研究：`MotionController` 增加 VRMA 載入、retarget、AnimationMixer 播放與 walk speed 推估；`AliciaStageWalker` 會先 preload `walk_cycle` 再開始位移，修正第一次走路時動畫未 ready 導致的滑步。
- 新增 v0.1.9 Alicia Showcase smoke mode：`demo.php?noAuto=1` / `?manual=1` 可停用自動 Director，方便單獨驗證走路、VRMA preload 與場景 root 位移同步；預設展示行為不變。
- 新增 v0.1.10 Alicia Showcase Mixamo retarget 修正：支援 `mixamorig:RightUpLeg` 與 `mixamorigRightUpLeg` 這類 node name alias，避免 retargeted walk clip 變成 0 tracks，讓 legs / feet tracks 能實際驅動 Alicia 腳步。
