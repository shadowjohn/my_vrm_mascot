# Semantic Motion Library Report

Phase: M6.8 Semantic Motion Library
Generated: 2026-06-16T01:41:32.803+08:00
Source: pose_style_recipes.json

## Summary

- Motions: 10
- Runtime ready: 9

## Category Counts

- guide: 1
- point: 1
- warning: 2
- thinking: 2
- social: 1
- attention: 1
- success: 1
- surprised: 1

## Motions

### 招手靠近 / 跟我來 (come_here)

- Category: guide
- Confidence: 0.7
- Runtime ready: true
- Intent tags: guide, come_here, follow_me, attention
- Meanings: 過來 / 跟上 / 往這裡 / 請看這邊
- Triggers: 引導使用者查看指定位置 / 呼叫使用者注意某個目標 / 帶使用者往下一步操作
- Recipes: come_here
- Source motions: 2
- Summary: 手部向自己方向連續招手，像是在請對方靠近或跟上。

### 指向目標 / 看這裡 (point_target)

- Category: point
- Confidence: 0.8
- Runtime ready: true
- Intent tags: point, target, show_result, spatial_reference
- Meanings: 看這裡 / 目標在這裡 / 指向 / 提示位置
- Triggers: 指向地圖目標 / 提示使用者查看查詢結果 / 強調畫面中的指定位置
- Recipes: point_target
- Source motions: 5
- Summary: 手臂伸出並指向目標方向，用於提示使用者看向指定位置。

### 交叉制止 / 不可以 (cross_no)

- Category: warning
- Confidence: 0.96
- Runtime ready: true
- Intent tags: deny, reject, stop, not_allowed
- Meanings: 不行 / 停止 / 禁止 / 拒絕
- Triggers: 政策阻擋 / 使用者操作不合法 / 工具結果有風險
- Recipes: cross_no
- Source motions: 15
- Summary: 雙手在身前交叉或阻擋，語意接近否定、禁止與制止。

### 托腮思考 / 分析中 (thinking_chin)

- Category: thinking
- Confidence: 0.81
- Runtime ready: true
- Intent tags: thinking, analyzing, waiting, reasoning
- Meanings: 思考中 / 分析中 / 稍等一下 / 正在確認
- Triggers: 等待 LLM 回覆 / 等待工具結果 / 正在分析資料
- Recipes: thinking_chin
- Source motions: 6
- Summary: 手部靠近下巴或臉側，頭部微低，呈現思考與分析中的狀態。

### 插腰生氣 / 有態度提醒 (angry_hands_waist)

- Category: warning
- Confidence: 0.91
- Runtime ready: true
- Intent tags: warning, attitude, strict_reminder, frustrated
- Meanings: 不可以喔 / 你又來了 / 請注意 / 有點生氣
- Triggers: 使用者重複犯錯 / 需要強烈提醒 / 限制或異常狀態
- Recipes: angry_hands_waist
- Source motions: 5
- Summary: 雙手插腰並帶有頭部晃動或身體前壓，呈現有態度的提醒。

### 害羞摸頭 / 不好意思 (shy_head_touch)

- Category: thinking
- Confidence: 0.67
- Runtime ready: false
- Intent tags: shy, apology, uncertain, minor_error
- Meanings: 不好意思 / 有點害羞 / 我想一下 / 剛剛可能不太對
- Triggers: 回覆不確定 / 小錯誤後修正 / 需要柔和道歉
- Recipes: shy_head_touch
- Source motions: 1
- Summary: 手摸後腦或臉側，帶有害羞、不好意思或小失誤後的反應。

### 揮手告別 / 打招呼 (wave_goodbye)

- Category: social
- Confidence: 0.9
- Runtime ready: true
- Intent tags: greeting, farewell, hello, goodbye
- Meanings: 你好 / 再見 / 嗨 / 下次見
- Triggers: 使用者進入頁面 / 對話結束 / 任務完成後友善收尾
- Recipes: wave_goodbye
- Source motions: 12
- Summary: 手部向外揮動，可用於打招呼、歡迎或告別。

### 左右觀察 / 搜尋中 (look_around)

- Category: attention
- Confidence: 0.89
- Runtime ready: true
- Intent tags: scan, look_around, searching, spatial_awareness
- Meanings: 找找看 / 我看看周圍 / 正在搜尋 / 確認附近狀況
- Triggers: 搜尋地圖目標 / 檢查周遭物件 / 等待空間上下文
- Recipes: look_around
- Source motions: 10
- Summary: 頭部或上半身左右查看，像是在尋找、觀察或確認周遭狀況。

### 勝利完成 / 做到了 (victory_pose)

- Category: success
- Confidence: 0.76
- Runtime ready: true
- Intent tags: success, done, celebrate, completed
- Meanings: 完成了 / 成功 / 做到了 / 太好了
- Triggers: 工具執行成功 / 下載完成 / 查詢完成
- Recipes: victory_pose
- Source motions: 3
- Summary: 帶有完成、勝利或開心語意的姿勢，適合工具成功後的短演出。

### 舉手投降 / 嚇一跳 (hands_up_surrender)

- Category: surprised
- Confidence: 0.95
- Runtime ready: true
- Intent tags: surprised, surrender, pause, unexpected
- Meanings: 嚇一跳 / 先等等 / 我投降 / 這有點意外
- Triggers: 非預期錯誤 / 使用者提出難題 / 需要暫停確認
- Recipes: hands_up_surrender
- Source motions: 9
- Summary: 雙手上舉，語意可能是投降、驚訝、暫停或被嚇到。
