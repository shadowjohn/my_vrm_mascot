# VRM Mascot — 可互動 3D 吉祥物

Phase 1 MVP：載入 VRM 模型，實現 idle / blink / mouse look / wave / dance 等互動。

## 快速開始

```bash
cd /d D:\mytools\my_vrm_mascot
run_server.bat

# 開啟瀏覽器
# http://127.0.0.1:8765/
```

如果是第一次在新環境啟動，先安裝本專案自己的最小後端相依：

```bash
python -m pip install -r requirements.txt
```

> **注意**：ES Module 需要 HTTP server，不支援 `file://` 協定。

正式首頁是 Workbench / Portal：

```text
http://127.0.0.1:8765/
```

原本 Agent Runtime 主展示：

```text
http://127.0.0.1:8765/mascot_runtime.html
```

開啟 Alicia Motion Mine：

```text
http://127.0.0.1:8765/motion_template_lab.html
```

## 目錄結構

```
./
  index.html                  # Workbench 正式入口 / Alicia Motion Studio
  mascot_runtime.html         # 原 Agent Runtime + VRM 主展示頁
  portal.html                 # Workbench 相容入口
  run_server.bat              # 啟動本機 server.py
  open_portal.bat             # 開啟正式 Workbench 首頁
  stop_server.bat             # 停止 8765 本機服務
  js/
    VrmMascot.js              # 主控制器（Three.js + VRM）
    MotionController.js       # 動作控制器（natural pose / idle / semantic motions / clip playback）
    MotionClips.js            # 短動作 clip 定義（wave/victory/warning_nod/shake_head/dance_short/punch_short）
    ExpressionProfiles.js     # 語意表情 profile 定義（neutral/happy/thinking/surprised/sad/angry）
    ActingBridge.js           # Conversation / runtime event -> mascot.act(state) bridge
    ActingPolicy.js           # Semantic acting state -> expression + clip + gaze 的演出策略
    ExpressionController.js   # 眨眼 + 表情控制
    MascotStateMachine.js     # 狀態機（dispatch / do / say / emote）
    LookAtController.js       # 滑鼠注視（EMA 平滑）
  css/
    mascot.css                # 深色主題 + glassmorphism
  vendor/                     # Three.js r149 + three-vrm 0.6.7（離線化）
  models/                     # VRM 模型
  motions/                    # Phase 2 用：VRMA / FBX 動畫檔
```

## API

### 基本用法

```javascript
const mascot = new VrmMascot(document.getElementById('container'));
await mascot.load('models/mascot.vrm');
```

### 狀態機 — dispatch（主要 API，與 LLM intent 對齊）

```javascript
// 支援直接傳入物件格式 (與 LLM 輸出意圖對接)
mascot.dispatch({ type: 'do',    name: 'wave' });
mascot.dispatch({ type: 'say',   text: '部署完成了！', emotion: 'joy', motion: 'wave' });
mascot.dispatch({ type: 'emote', name: 'happy', duration: 2000 });
mascot.dispatch({ type: 'lookAt', target: 'mouse' });
mascot.dispatch({ type: 'reset' });

// 也支援方法參數呼叫：
mascot.dispatch('talking', { text: '你好', emotion: 'joy', motion: 'wave' });
```

### 代理意圖對接 — Agent Bridge (Phase 4)

為方便對接 LLM 代理（如 OpenAI、Gemini、Claude），可以利用 `performIntent` API 發送抽象的高階意圖，系統會自動轉譯為預置動作序列：

```javascript
// 執行成功意圖 (使用預設文字、表情與動作)
mascot.performIntent('success');

// 執行思考意圖 (覆蓋文字)
mascot.performIntent({
  intent: 'thinking',
  text: '讓我想想，怎麼寫程式才最優美...'
});

// 意圖參數完全覆蓋 (Override)
mascot.performIntent({
  intent: 'success',
  text: '我們成功搞定 Agent Bridge 了！',
  emotion: 'fun',
  motion: 'dance_short'
});

// 未知意圖防錯自動 Fallback (自動降級為 explain 並輸出控制台 Warning 警告)
mascot.performIntent({
  intent: 'unknown_action_name',
  text: '這是一個未定義的意圖，但安全防護會將其降級並照常說明。'
});
```

### 行為佇列 — ActionQueue (Phase 3)

讓角色可以排程連續行為，例如：`看向滑鼠` -> `招手說話` -> `開心跳躍`：

```javascript
mascot.enqueue([
  { type: 'lookAt', target: 'mouse' },
  { type: 'wait', duration: 500 },
  {
    type: 'say',
    text: '羽山哥，動畫與排程佇列載入成功！',
    emotion: 'joy',
    motion: 'wave',
    timeout: 6000 // Timeout Guard 防護 (毫秒)
  },
  { type: 'do', name: 'happy', timeout: 3000 }
]);

// 中斷並清空佇列
mascot.clearQueue();
```

### 便捷 API

```javascript
mascot.state.do('wave');
mascot.state.say('你好');
mascot.state.emote('happy');
mascot.state.lookAt('mouse');
mascot.state.reset();
```

### 子系統直接存取

```javascript
mascot.motion.play('dance_short');   // MotionController
mascot.motion.playClip('victory');    // Short Motion Clips
mascot.setExpression('happy', { intensity: 0.8, duration: 1200 }); // Expression Layer
mascot.clearExpression();
mascot.act('success');          // Acting Policy: happy + victory + mouse gaze
mascot.motion.playCustom(animData, { loop: true }); // 播放自訂 JSON 動畫
mascot.expression.set('joy', 0.8);  // ExpressionController
mascot.lookAt.setTarget('none');     // LookAtController
mascot.resetCamera();                // 重置 3D 視角
```

### 語意姿勢綁定 — PoseDirector (Phase M1)

Agent Runtime 不直接碰骨架，改透過語意姿勢 API 交給 VRM 表現層：

```javascript
mascot.poseForState('running');              // presenting
mascot.poseForIntentResult('done', intent);  // wave
```

`updateIntentTrace()` 會把 tool trace 更新餵給 ActingBridge；再由 `ActingPolicy.js`、`PoseDirector.js` 與底層 controllers 決定實際表演：
`pending/thinking`、`running/presenting`、`done/success`、`blocked/warning`、`failed/error`。

MotionController 會在 VRM 載入後立即套用 Natural Pose；所有內建程序式動作都建立在這個自然站姿上，再疊加呼吸、展示、警告或揮手動作，避免回到模型 bind/rest pose 的 T-Pose。

M2 Idle Micro Motion 只強化待機層：idle 會疊加胸口/脊椎/重心分層呼吸、肩膀放鬆、前臂與手腕微擺；LookAt `none` 時會加小幅頭部 drift，目標注視時不啟用這個漂移。

M3 Short Motion Clips 把短動作集中在 `MotionClips.js`：`wave`、`victory`、`warning_nod`、`shake_head`、`dance_short`、`punch_short` 都是短、可預期、可恢復的 clip。`MotionController.play(name)` 會自動路由 clip name，`playClip(name)` 可直接播放；clip 結束後會回到 idle 並重套 Natural Pose，避免殘留骨骼偏移。

M4 Expression Layer 把語意表情集中在 `ExpressionProfiles.js`，目前提供 `neutral`、`happy`、`thinking`、`surprised`、`sad`、`angry`。Expression layer 只控制 VRM blendshape 權重與 blink 疊加，不寫骨架 rotation / position；因此可和 `MotionController.playClip('victory')` 這類短動作同時存在。

M5 Attention & Acting Policy 把演出決策集中在 `ActingPolicy.js`：`success -> happy + victory + mouse`、`running -> thinking + presenting + point`、`blocked -> angry + warning_nod + mouse`。這層只產生 policy result，實際執行仍交給 Expression / Motion / LookAt controllers，且不進 `contextDigest`。

M6 Conversation Acting Bridge 讓 `ActingBridge.js` 接收 tool trace 與 talking lifecycle 事件，依 priority 裁決目前 acting state，並只呼叫 `mascot.act(state)`；runtime 仍持續更新 trace，expression / clip / gaze / pose 的細節留在 `ActingPolicy.js`、`PoseDirector.js` 與底層 controllers。

M6.7 Motion Template Importer 提供獨立開發工具 `motion_template_lab.html`：載入 Alicia 與本機 `.vrma`，取樣第一幀或指定時間點的 upper-body humanoid rotation，匯出可貼回 Character Inspector 的 NaturalPose preset JSON。這個 lab 不進 production runtime、不改 Agent、不寫 `contextDigest`。

M6.7.5～M6.13 讓 `motion_template_lab.html` 從 importer 升級成 Alicia Motion Mine：

- Motion-first 採礦：先定義整支 VRMA 的主分類，再釘選值得保留的 moment。
- Description-first 資料：人工撰寫「動作描述 / 用途描述 / Agent 用途」，分類可留給後續 LLM 或規則分析。
- Text Mining Classifier：由文字描述產出 `motion_text_reclass_report.json`，不改原始資料。
- Pose Style Recipe Generator：由描述萃取 `pose_style_recipes.json` 與 `pose_style_recipe_report.md`。
- Semantic Motion Library：整理出 `semantic_motion_library.json`，目前有 10 組 semantic motion 種子。
- Semantic Motion Picker / Registry / Variant Selector：可從 intent/trigger 選出 semantic motion，再找 preferred variant。
- Semantic Motion Preview Bridge：只在 Lab 內安全預覽 variant 對應的 VRMA，不接正式 Acting runtime。

v0.1.2 Alicia Showcase Pack 把採礦資料接到公開展示層：

- `scratch/generate_showcase_pack.mjs` 會讀取 172 筆 `motion_profiles.json` 人工描述與 semantic registry。
- 輸出 `showcase_motion_pack.json`、`showcase_events.json` 與 `showcase_motion_pack_report.md`。
- `demo.php` 優先使用 `showcase_events.json` 作為 Director 事件來源，沒有 showcase pack 時才 fallback 到原本 semantic motion catalog。
- release build 會把精選 VRMA 複製到 `motions/showcase/`；未驗證來源會標為 `research_preview`，不當成 approved asset。

v0.1.3 修正 Showcase Demo 的空間感：

- `VrmMascot.getSceneContext()` / `addSceneObject()` / `removeSceneObject()` 讓外部展示物件可掛進 Alicia 原本的 Three.js scene。
- `demo.php` 的 toy room / props 會優先使用 shared scene，共用 camera、depth、lighting；overlay renderer 只保留作 fallback。
- demo 物件改成落在 Alicia 周圍與地面深度上，避免看起來像浮在畫面前方的 2D UI。

v0.1.4 強化近距離物件互動：

- 新增 `crouch_touch` 展示動作，低物件互動時 Alicia 會蹲下並伸手觸摸。
- ScenePropLayer 加入 touch recoil / contact flash，物件被碰到時會有短暫受力回饋。
- GazeDirector 會讓頭部追蹤目前互動物件；使用者移動滑鼠時短暫改看滑鼠，停止後回到物件。

v0.1.5 修正 `crouch_touch` 蹲姿辨識度：

- 將 hips 下沉幅度從小幅示意提高到可視蹲姿，並加大膝蓋彎曲與上身前傾。
- 延長蹲姿停留時間，讓使用者能清楚看到靠近、蹲下、碰觸、站回來的節奏。

v0.1.6 修正 demo 對白蓋掉互動動作：

- Showcase Director 改用 `dispatch('talking')` 播對白，不再用 `performIntent()` 的 preset motion。
- 對白只負責文字、表情與嘴型，身體動作由 `event.animation` 單獨控制，避免 `wave` / `warning` 覆蓋 `crouch_touch`。

v0.1.7 修正 `crouch_touch` 骨架折疊：

- 將深蹲改成安全半蹲伸手，保留靠近、下降、觸摸、站回來的節奏。
- 移除高風險的大角度腿部折疊；在沒有 IK / foot locking 前，腿部 rotation 只允許小幅輔助。
- 測試新增 `crouch_touch` 腿部角度上限，避免展示頁再次出現骨折感。

v0.1.8 修正走路滑步與 VRMA 播放時序：

- Antigravity 方向已接上 VRMA playback：`MotionController` 可載入 VRMA、retarget humanoid tracks，並用 `AnimationMixer` 播放。
- `AliciaStageWalker.moveTo()` 改成先 preload `walk_cycle`，等 `davinci2_walking.vrma` ready 後才開始位移。
- `runEvent()` 會 await walker travel duration，避免場景位移、對白、後續互動動作彼此蓋掉。
- demo 加入 TTS 開關；預設仍關閉，不影響既有展示。

v0.1.9 補強 Showcase smoke 驗證入口：

- `demo.php?noAuto=1` 或 `demo.php?manual=1` 會停用自動 Director，方便單獨測試 `AliciaStageWalker.moveTo()`、VRMA preload 與走路同步。
- 預設 `demo.php` 行為不變，仍會自動播放 showcase events。

v0.1.10 修正 Mixamo VRMA 腿部 retarget：

- `davinci2_walking.vrma` 的原始 track 使用 `mixamorigRightUpLeg`，但 VRMA humanoid map 使用 `mixamorig:RightUpLeg`；舊版對不上時 retargeted clip 會變成 0 tracks。
- `MotionController` 現在會用 normalized node alias 比對 VRMA bone map，讓 hips、upper/lower leg、foot tracks 能正確進入 retargeted clip。
- 新增 regression test，避免 Mixamo 冒號命名差異再次讓走路動畫只剩場景 root 位移。

v0.1.11 修正公開展示滑步觀感：

- 保留 VRMA retarget / preload 能力給 Motion Mine 與研究素材，但 `walk` / `walk_cycle` 在公開 showcase 中改走程序步態。
- 程序步態每幀套 Natural Pose，再疊加大腿、小腿、腳掌、hips 與手臂擺動，避免只移動 scene root 造成滑行感。
- `AliciaStageWalker.moveTo()` 不再為 `walk_cycle` 預載 raw Mixamo VRMA，避免 rest-pose / coordinate mismatch 讓公開展示走路變成扭曲骨架。
- 新增 regression test：`walk_cycle` 不啟動 VRMA mixer，且 upper/lower legs 與 feet 會隨時間改變。

v0.1.12 修正非走路 VRMA 腿部飛天：

- `retargetVrmaClip()` 預設只允許上半身 track 進入 runtime；hips / legs / feet 只在 `walk` / `run` / locomotion 類型保留。
- `punch_short`、`warning`、`wave`、`presenting` 等語意動作不再吃 raw VRMA 的下半身資料，避免拳頭或手勢動作把 Alicia 雙腳帶飛。
- 新增 regression test：同一份 Mixamo-like clip 在 `walk_cycle` 可保留腿部 track，在 `punch_short` 必須濾掉 hips / legs / feet。

v0.1.13 修正公開 showcase raw VRMA 直播放殘留：

- 核心語意動作 `idle / think / presenting / warning / wave / victory / warning_nod / shake_head / dance_short / punch_short` 不再從 `getVrmaUrlForName()` 解析 raw VRMA，統一走程序 pose / MotionClips。
- `demo.php` 的 `playCustomAnimation()` 移除 `vrmaMap` 直播放，`kick_forward / crouch_touch / shy_wave / point_right` 等 showcase 動作改走本地安全 custom animation。
- raw VRMA 保留在 Motion Mine / Lab / Preview Bridge 當素材來源，不再直接接正式 showcase runtime，避免手臂轉到背後或腳部偶發飛起。

v0.1.14 修正行走面向與短距離滑步：

- `AliciaStageWalker.moveTo()` 新增 `faceWorld` 選項，Director 會把目前互動物件的 world position 傳入，讓 Alicia 移動時朝向目標物件。
- 場景 root 旋轉改用 shortest-angle interpolation，避免轉身走遠路或背對目標。
- 3D 場景下改以實際 `distance3d` 判斷是否啟動 `walk_cycle`，短距離但可見的 root 位移也會播放步態，不再只是平移。

v0.1.15 修正倒退走：

- `facingRotationFor()` 改用完整目標向量 `rootBaseRotationY + atan2(dx, dz)`，處理目標在角色後方時的 180 度轉向。
- 移動旋轉仍走 shortest-angle interpolation，讓 Alicia 正面朝移動/互動物件方向接近，不再背面倒退走。
- 3D walk 啟動門檻再降到 `distance3d > 0.006`，降低短距離可見位移但腳不動的機率。

v0.1.16 修正起步背對滑行：

- `animateSceneRoot()` 在 walking 模式下拆成轉身與位移兩個進度：前段先快速轉向，主要 root 位移延後到轉身後開始。
- 走路 rotation 在前 32% duration 完成，position 在 18% duration 後才開始主要前進，避免剛起步看起來仍在倒退滑行。

目前資料集狀態：

| 項目 | 數量 |
|------|------|
| git 內實體 VRMA binary | 0 |
| 本機 demo VRMA（可選還原） | 11 |
| motion profile 覆蓋的 VRMA 名稱 | 172 |
| motion profiles | 172 |
| 已有人類描述 profiles | 172 |
| mining log entries | 173 |
| pose style recipes | 10 |
| semantic motions | 10 |

VRMA binary 維持 local mining only，目前 git 內只保留 manifest 與衍生描述資料；若要重新預覽樣本，需依 `examples/m6_7_vrma_samples/SOURCES.md` 與 `docs/local-vrma-setup.md` 重新取回來源檔並再次確認授權。

資料位置：

```text
examples/m6_7_vrma_samples/
  SOURCES.md                       # VRMA 來源與授權狀態總表
  README.md                        # local-only demo sample 來源
  external/**/source_manifest.json # 外部礦區批次 manifest
  review/
    motion_profiles.json           # 172 筆人工描述與主分類
    mining_log.json                 # 採礦紀錄
    motion_text_reclass_report.json
    pose_style_recipes.json
    pose_style_recipe_report.md
    semantic_motion_library.json
    semantic_motion_library_report.md
    semantic_motion_registry.json
    semantic_motion_registry_report.md
```

Base pose preset 會依模型載入：

- `models/mascot.vrm` -> `motions/poses/alicia_solid.json`
- 未知或上傳模型 -> `motions/poses/default.json`
- Character Inspector 的本機設定只在有 localStorage preset 時覆蓋模型預設。

## 可用動作

| 名稱 | 說明 | 持續時間 |
|------|------|---------|
| `idle` | 呼吸微動（預設） | 持續 |
| `wave` | 右手短揮手 clip | 1.2s |
| `victory` | 短勝利 YA clip | 1.0s |
| `warning_nod` | 警示點頭 clip | 0.9s |
| `shake_head` | 否定式上身搖動 clip | 0.8s |
| `dance_short` | 短舞彩蛋 clip | 1.6s |
| `punch_short` | 輕吐槽短拳 clip | 0.7s |
| `think` | 托下巴沉思（已修正方向） | 3.0s |
| `happy` | 雙手舉高跳躍（已修正方向） | 2.0s |
| `presenting` | 伸手介紹面板 | 3.2s |
| `warning` | 警示姿勢 | 2.4s |
| `custom_animation` / `custom` | 播放自訂 JSON 動作 | 視動畫檔而定 |

## 可用表情

| 名稱 | VRM Preset |
|------|-----------|
| `happy` / `joy` | joy |
| `thinking` | fun + sorrow |
| `surprised` | fun |
| `sad` / `sorrow` | sorrow |
| `angry` | angry |
| `fun` | fun |

## 升級策略

VRM 版本相關 API 集中在 `VrmMascot.js` 的 `_vrm*` helper：

| Helper | 0.6.7 | 3.x (Phase 2) |
|--------|-------|---------------|
| `_vrmFromGltf()` | `VRM.from(gltf)` | `VRMLoaderPlugin` |
| `_getBlendShapeProxy()` | `blendShapeProxy` | `expressionManager` |
| `_getBoneNode()` | `getBoneNode()` | `getNormalizedBoneNode()` |
| `_vrmUpdate()` | `vrm.update(dt)` | `vrm.update(dt)` |
| `_vrmDispose()` | `VRMUtils.deepDispose()` | `VRMUtils.deepDispose()` |

升級時只改這 5 個 method，其餘模組不動。

## 與 my_yolo_train_tool 的關係

本專案已獨立在 `D:\mytools\my_vrm_mascot`，不再放在 `my_yolo_train_tool` 子目錄內。兩邊可以各自開發、測試與提交。

| 專案 | 責任 | 技術 |
|------|------|------|
| `my_yolo_train_tool` | 影片→骨架→motion draft | YOLO / Python |
| `my_vrm_mascot` | 可互動吉祥物 runtime | Three.js / ES Module |

兩者完全獨立運作。未來動作管線：
```
影片 → YOLO Pose → pose_record.json → pose_vrm_mapper → 手修 → .vrma → D:\mytools\my_vrm_mascot
```

## 作者

羽山 (https://3wa.tw)
