# GVHMR -> Alicia Blender IK Bake

## 目標

把 GVHMR 的 SMPL world motion 轉成 Alicia 可直接播放的 motion JSON，避免只靠前端 quaternion 猜骨頭方向。

## Pipeline

```text
GVHMR hmr4d_results.pt
-> alicia_intermediate_landmarks.json
-> scripts/gvhmr_to_alicia_blender_bake.py
-> alicia_blender_bake_motion.json
-> demo.html / MotionController.playCustom()
```

## 關鍵實作

- 用 Blender 匯入 `models/mascot.vrm`，讀 Alicia 真實 rest direction。
- 腿部交給 Blender IK：`leftLowerLeg/rightLowerLeg` 加 IK，target 鎖 ankle，pole 鎖 knee。
- VRM foot 方向用 `foot -> toe`，不要用 `ankle -> foot`；後者會把腳掌當小腿延伸，造成尖踩。
- IK 解完後，`leftFoot/rightFoot/leftToes/rightToes` 採樣 Blender local pose，讓鞋底維持自然 rest。
- `hips` 只做 root yaw，torso pitch 交給 `spine/chest`，避免脊椎前傾被 hips 吃掉。
- GVHMR 沒 toe 時，用 foot mesh/ankle proxy 補 `leftToe/rightToe`，再做 toe forward 與 contact flatten。

## 重烘焙指令

```powershell
$root = 'D:\mytools\my_vrm_mascot'
$blender = 'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe'
$model = Join-Path $root 'models\mascot.vrm'
$demoRoot = Join-Path $root 'conda_vm\gvhmr\GVHMR\outputs\demo'

Get-ChildItem -LiteralPath $demoRoot -Directory |
  Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'alicia_intermediate_landmarks.json') } |
  ForEach-Object {
    & $blender -b --python (Join-Path $root 'scripts\gvhmr_to_alicia_blender_bake.py') -- `
      --input-json (Join-Path $_.FullName 'alicia_intermediate_landmarks.json') `
      --output-json (Join-Path $_.FullName 'alicia_blender_bake_motion.json') `
      --model $model `
      --fps 30
  }
```

## 驗證

```powershell
python scratch\test_gvhmr_blender_bake.py
node scratch\test_gvhmr_json_demo.mjs
python -m py_compile scripts\gvhmr_to_alicia_blender_bake.py
```
