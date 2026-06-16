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
