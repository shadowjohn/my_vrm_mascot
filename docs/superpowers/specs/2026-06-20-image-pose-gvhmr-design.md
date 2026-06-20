# Image Pose Lab: Single Image -> Alicia Pose

## 目標

新增 `image_pose_lab.html`，讓使用者貼上一張圖片後，Alicia 可以仿出該圖片中的單張靜態姿勢。

第一版走 GVHMR 路線，重用目前已驗證的 Blender IK bake，不重新做一套圖片姿勢 retarget。

## 第一版 Pipeline

```text
image
-> still.mp4
-> GVHMR world motion
-> alicia_intermediate_landmarks.json
-> scripts/gvhmr_to_alicia_blender_bake.py
-> alicia_image_pose.json
-> image_pose_lab.html preview
```

## 頁面行為

- 使用者可貼上圖片或選擇本機圖片。
- 頁面顯示原圖預覽。
- 按下「產生 Alicia 姿勢」後，後端把圖片轉成短 still video，再跑現有 GVHMR。
- 成功後顯示三欄對照：
  - 原圖
  - GVHMR 側視骨架
  - Alicia 靜態 pose
- 可下載結果 JSON，之後可再接 `pose_training_lab.html` 做人工校正。

## 後端行為

- 新增最小 API：
  - 接收一張圖片。
  - 建立臨時輸出資料夾。
  - 用 ffmpeg 產 1 秒 still mp4。
  - 呼叫現有 GVHMR runner。
  - 呼叫 Blender bake 腳本產 Alicia pose JSON。
- 輸出資料沿用 `conda_vm/gvhmr/GVHMR/outputs/demo` 類似結構，方便 `demo.html` 的載入邏輯重用。

## 不做

- 不做批次圖片。
- 不做圖片生成動畫，只輸出單張 static pose。
- 不新增 RTMPose / MediaPipe / 其他圖片 pose 模型。
- 不在第一版做完整手指或表情。

## 驗收

- 貼一張全身人物圖後，可以得到 Alicia 靜態姿勢。
- 原圖、GVHMR 骨架、Alicia 可以在同頁對照。
- 產出的 JSON 可重新載入重現。
- 既有 `demo.html` / GVHMR bake 測試不被破壞。

## 已接受的取捨

- 每張圖都跑 GVHMR，速度較慢，但可換到目前最準、最一致的 pipeline。
- 單張圖的深度仍可能不如影片，但第一版優先驗證產品手感。
