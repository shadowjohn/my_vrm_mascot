# Alicia / GVHMR / VRMA 開發經驗談

## 人物角度與動作對齊筆記

### 1. 先確認「角色朝向」再看骨頭

GVHMR、VRMA、VRM runtime 之間最常出錯的不是單一骨頭，而是整個角色的 forward 軸不一致。

先看：

- 影片人物面向哪裡
- GVHMR 骨架 forward 是 `+Z` 還是 `-Z`
- Alicia VRM 實際正面在 Three.js 裡是朝哪個方向
- 預覽相機是不是又把畫面轉了 180 度

如果 forward 沒先對齊，後面調大腿、膝蓋、腳尖都會越修越亂。

### 2. 左右腳判斷不要只看畫面左右

影片畫面左右、相機左右、人體左右、VRM 骨頭左右是四件事。

判斷左右腳時優先使用來源骨架的語意：

- `leftUpperLeg / leftLowerLeg / leftFoot / leftToes`
- `rightUpperLeg / rightLowerLeg / rightFoot / rightToes`

不要用「畫面左邊那隻腳」當成 left foot。側面影片或鏡像影片很容易反。

### 3. 腳部要分三層處理

單純把大腿、小腿方向轉成 quaternion 不夠穩。比較好用的拆法：

1. 大腿：主要跟 hip → knee
2. 小腿：主要跟 knee → ankle
3. 腳掌 / 腳尖：用 ankle → toe 或 toe proxy 補方向

腳掌落地時要額外做：

- foot contact
- foot flatten
- heel-to-toe roll limit
- ground height clamp

不然很容易變成「腳尖芭蕾走路」。

### 4. Alicia 的身形不是 SMPL 真人比例

GVHMR 的 SMPL 結果即使很準，直接套到 Alicia 仍可能怪，因為 Alicia 是二次元比例：

- 腿長比例不同
- 腳掌大小不同
- 髖、胸、肩比例不同
- 裙裝與袖子會放大視覺錯位

所以「骨架正確」不等於「Alicia 看起來正確」。

最有效的做法是：

- GVHMR 負責世界座標與身體大方向
- Blender / IK 負責鎖腳與腳尖
- runtime pose_json 負責 Alicia 可播放格式

### 5. 脊椎不要完全照抄

真人骨架的腹部前傾或後仰套到 Alicia 會被服裝與身形放大。

實作上脊椎可以比來源骨架更保守：

- chest / spine twist 可降低權重
- 後仰角度要 clamp
- 角色看起來「挺肚子走路」時，通常是 spine/chest pitch 太忠實

### 6. 手型用 preset，比逐指硬追穩

影片手指常有遮擋、糊掉、解析度不足。

目前最划算策略：

- GVHMR / body retarget 管全身
- MediaPipe Hands 或手部偵測補 hand pose layer
- 依信心值套 `open / relaxed / fist / point`
- `relaxed` 應該是半握拳，不是刺掌
- 半握拳時拇指也要折進去

逐指精準可以之後做，但現階段 preset 視覺收益最高。

### 7. VRMA -> pose_json 的坑

VRMA 轉 pose_json 時要小心 rest pose 與局部座標：

- 原始 VRMA 可能背對螢幕，需要展示端旋轉 180 度
- 第一幀若手突然上舉，通常是 converter/rest space 錯
- 雙腳交叉或腳掌重疊，多半是 hips / leg local rotation 沒用官方 VRM rest pose 還原
- 上臂往上或往下反了，通常是 local axis 沒轉對

修正方向：以官方 VRMA runtime 展示為基準，pose_json 轉出結果要先在 `demo_vrma_vs_pose_json.html` 對照。

### 8. 最小驗證流程

遇到新動作先不要馬上修一堆骨頭。

建議流程：

1. 原影片 / 原 VRMA 播放
2. GVHMR 側視骨架
3. Alicia pose_json 結果
4. 三者同時間點對照
5. 先修 forward / mirror
6. 再修腳
7. 再修 spine
8. 最後才修手指

這樣比較不會把一個座標系問題誤判成十幾根骨頭都錯。
