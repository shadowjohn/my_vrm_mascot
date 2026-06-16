# My VRM Mascot — 開發歷程

## 2026-06-16

- 從 `D:\mytools\my_yolo_train_tool\my_vrm_mascot` 拆成獨立專案，移到 `D:\mytools\my_vrm_mascot`。
- 同步搬移 Alicia / VRM mascot 相關 `scratch` 測試與 `docs/superpowers` 規格、計畫文件。
- 新增獨立專案用的 `requirements.txt` 與 `.gitignore`，讓後續不需要依附 YOLO 訓練工具環境。
- 釐清資料狀態：repo 內實體 VRMA 是 11 支；172 是 motion profile / manifest 層的採礦資料，第三方外部 VRMA binary 未簽入。
- 調整 git 基底策略：VRM / VRMA binary 改為 local-only；git 只保留程式碼、測試、規格、manifest、motion profile、semantic registry 與衍生報表。
- 新增本機 VRMA 還原規則：建議放在 `local_assets/vrma/`，並讓 `/api/vrma-samples` 同時掃 legacy sample 目錄與 local assets 目錄。
