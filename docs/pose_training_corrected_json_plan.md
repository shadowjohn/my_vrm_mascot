# Pose Training Corrected JSON Plan

## 目標

`pose_training_lab.html` 先作為 GVHMR 與 Alicia 的姿勢校正台。校正資料先不要直接寫回 DB，也不要急著輸出 VRMA；先輸出一份完整 corrected JSON，確認「少量人工校正影格 -> 整段姿勢補正」這條路穩定。

## Ponytail 版流程

1. 從 `data.html` 或手動載入一筆 GVHMR 結果。
2. 使用影格拉桿挑選需要校正的 frame。
3. 手動調整全域對齊與骨頭偏移。
4. 儲存幾個關鍵校正影格。
5. 未校正影格用前後校正點線性推論；只有單邊資料時套最近點。
6. 下載 `gvhmr_alicia_corrected_pose_json_v1`，每格包含：
   - 原始 GVHMR landmarks
   - 該格套用的 calibration
   - 該格套用的 boneOffsets
   - correction mode

## 目前先不做

- 不寫回 SQLite。
- 不直接覆蓋原始 `pose_json`。
- 不做 VRMA export。
- 不做完整時間軸剪輯器。

等 corrected JSON 連續播放確認自然後，再接 DB 寫回與 bake/export。
