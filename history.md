# My VRM Mascot — 開發歷程

## 2026-06-18

- 新增 M20.4 World-Grounded Orientation Adapter 設計規格：
  - 新增 `docs/superpowers/specs/2026-06-18-m20-4-world-grounded-orientation-adapter.md`，定義 MotionBERT 保四肢、GVHMR/WHAM 補 world-grounded root/yaw/footContact 的低風險融合路線。
  - 明確 Phase 1 只做共同 world-motion contract、fixture-first tests、`AliciaWorldMotionAdapter` / `AliciaWorldMotionFusion` 與 GVHMR/WHAM subprocess stub，不要求本機先安裝重型研究模型。
  - 紀錄 GVHMR 靜態相機 `-s` 路徑與 WHAM contact-aware trajectory refinement 作為後續 Phase 2/3 的實驗依據。

- 完成 M20.4 Phase 1 World Motion Contract：
  - 新增 `js/AliciaWorldMotionAdapter.js`，正規化 GVHMR/WHAM/fixture world-motion 輸出，統一 `bodyYawDegrees`、`rootTranslation`、`footContact`、`confidence` 與 nearest-frame lookup。
  - 新增 `js/AliciaWorldMotionFusion.js`，先以非侵入方式把 world yaw、root translation 與 footContact metadata 融合進 Alicia pose payload；缺少或低信心 world motion 時會保留原 MotionBERT limb pose。
  - 新增 `scripts/gvhmr_lift.py` / `scripts/wham_lift.py` experimental stub，支援 fixture JSON 與 typed `missing_dependency` 回應，讓 Phase 1 不需要先建 GVHMR/WHAM conda env。
  - 新增 `scratch/test_alicia_world_motion_adapter.mjs`、`scratch/test_alicia_world_motion_fusion.mjs`、`scratch/test_world_motion_cli_stubs.mjs` 鎖定共同 contract、fusion 行為與 CLI stub。

- 推進 M20.4 Phase 2A GVHMR Adapter 邊界：
  - 新增 `docs/superpowers/plans/2026-06-18-m20-4-gvhmr-adapter-phase2a.md`，把本階段限定在 GVHMR checkout / demo command / static-camera / typed failure contract，不先猜 raw output parser。
  - `scripts/gvhmr_lift.py` 新增 `--gvhmr-root`、`--python-exe`、`--dry-run`，可組出官方 `tools/demo/demo.py --video=... -s` 命令；缺少 checkout、缺影片、dry-run、provider 失敗與 parser 尚未完成都會回非崩潰 JSON。
  - 擴充 `scratch/test_world_motion_cli_stubs.mjs`，鎖定 fixture 模式不退化、GVHMR dry-run command 形狀與 `-s` 靜態相機旗標。
  - 以本機 `micromamba` 建立 ignored 的 `conda_vm/gvhmr/env`，目前為 Python 3.10.20 base env；完整 GVHMR requirements / checkpoints 尚未安裝。

- 推進 M20.4 Phase 2B GVHMR 本機 bootstrap：
  - 新增 `scripts/gvhmr_env_check.py` 與 `scratch/test_gvhmr_env_check.mjs`，可檢查 `conda_vm/gvhmr/env`、GVHMR checkout、demo script、requirements、Python imports 與 checkpoint / SMPL body model 缺口。
  - 新增 `scripts/gvhmr_requirements_audit.py` 與 `scratch/test_gvhmr_requirements_audit.mjs`，在 pip install 前先掃出 Windows / CUDA 相容性風險。
  - 已 clone 官方 GVHMR 到 ignored `conda_vm/gvhmr/GVHMR`，目前 commit `6ec3ca3`；`gvhmr_lift.py --dry-run` 已可對官方 sample `docs/example_video/tennis.mp4` 組出絕對路徑 demo command。
  - 暫停直接安裝官方 `requirements.txt`：其中 `pytorch3d` 指向 `linux_x86_64.whl`，Windows env 不能安裝；`torch==2.3.0+cu121` / `torchvision==0.18.0+cu121` 也不適合公司 RTX 5060 Ti / CUDA 12.8 路線。
  - 目前 readiness：repo / demo / requirements / Python 3.10 env 已就緒；缺 `torch` / `cv2` imports、GVHMR/HMR2/ViTPose/YOLO checkpoints，以及 SMPL / SMPLX body model 權重。

- 安裝 GVHMR Windows/CUDA 12.8 conda env 主體依賴：
  - 在 ignored `conda_vm/gvhmr/env` 內安裝 `torch==2.11.0+cu128`、`torchvision==0.26.0+cu128`，CUDA smoke test 可看到 RTX 5060 Ti、CUDA 12.8、compute capability `(12, 0)`，並可完成 GPU matmul。
  - 安裝 GVHMR 主要 requirements：`numpy==1.23.5`、`timm==0.9.12`、`lightning==2.3.0`、Hydra、OpenCV、AV、Ultralytics、SMPLX、Wis3D、PyCOLMAP、`cython_bbox`、`lapx`、Jupyter 等；`chumpy==0.70` 需用 `--no-build-isolation` 才能避開舊 setup.py 的 build env 問題。
  - `pip check` 乾淨，核心 import smoke test 已過：`torch` / `torchvision` / `cv2` / `ultralytics` / `smplx` / `pycolmap` / `cython_bbox` / `lap` / `hmr4d`。
  - `scripts/gvhmr_env_check.py` 追加預設檢查 `pytorch3d` / `hmr4d`，並輸出 `missingImports`；目前真正剩餘 Python blocker 是 Windows 沒有可直接安裝的 `pytorch3d`。
  - 實跑 `gvhmr_lift.py` 官方 sample 會乾淨回 `provider_failed`，stderr 指向 `ModuleNotFoundError: No module named 'pytorch3d'`；另外仍缺 GVHMR/HMR2/ViTPose/YOLO checkpoints 與 SMPL / SMPLX body model 權重。

- 整理 `conda_vm` 可重建環境腳本：
  - `.gitignore` 改成繼續忽略 `conda_vm` 內的 env / cloned repo / binary / 權重，但允許追蹤 `*_build_conda_env.bat` 與 `*_requirements.txt`。
  - 新增 `micromamba_build_conda_env.bat`、`motionBERT_build_conda_env.bat`、`gvhmr_build_conda_env.bat`、`server_build_conda_env.bat` 與對應 requirements，讓新機器可從 `conda_vm` 入口重建 portable micromamba、MotionBERT、GVHMR、server env。
  - `run_server.bat` 現在優先使用 `conda_vm/server/env/python.exe` 執行 `server.py`，沒有 server env 時會提示先跑 `conda_vm/server_build_conda_env.bat` 並 fallback 系統 Python。
  - 已建立 ignored 的 `conda_vm/server/env`，server import smoke test 可載入 Flask、yt-dlp、MediaPipe、OpenCV、NumPy 與 `server.py`；`pip check` 乾淨。
  - 新增 `scratch/test_conda_env_build_assets.mjs`，鎖定 build assets 存在、可被 git 追蹤，且實際 env 路徑仍保持 ignored。

- 改用 server conda env 管理本機 server 啟停：
  - 新增 `scripts/stop_server.py`，以 Python 查 `netstat -ano` 找出指定 port 的 LISTENING PID，並用 `taskkill /F` 停止；支援 `--dry-run` 方便測試。
  - `stop_server.bat` 現在與 `run_server.bat` 一樣優先使用 `conda_vm/server/env/python.exe`，缺 env 時提示先跑 `conda_vm/server_build_conda_env.bat` 並 fallback 系統 Python。
  - 擴充 `scratch/test_conda_env_build_assets.mjs` 並新增 `scratch/test_stop_server_script.mjs`，鎖定 run/stop 都使用 server env，且 stop script 可安全 dry-run。

- 完成 Windows / CUDA 12.8 / RTX 5060 Ti 的 PyTorch3D source build 實測：
  - 先查 upstream 狀態：`facebookresearch/pytorch3d#1689` 的 Windows `long -> int64_t` 修補在目前 main 已不需要；`#1970` 仍是 CUDA 12.8 / RTX 50 系列編譯風險；`#2037` 是 modern packaging 修補但不是本次 CUDA crash 主因；第三方 MiroPsota index 有 `pt2.11.0cu128` wheel，但本次優先走本機 source build。
  - `conda_vm/gvhmr/env` 以 `torch==2.11.0+cu128`、CUDA 12.8、RTX 5060 Ti `sm_120`，從 `facebookresearch/pytorch3d` main commit `7f8a8a1` 成功編出並安裝 `pytorch3d 0.7.9`。
  - 踩雷紀錄：VS2026 / MSVC `14.51.36231` 會讓 `nvcc` 在 `cudafe++` 階段以 `0xC0000005 ACCESS_VIOLATION` 失敗；改用 VS2022 Community / MSVC `14.44.35207` 後可通過 67 個 extension object、link 與 install。
  - 成功參數：`DISTUTILS_USE_SDK=1`、`CUDA_HOME=C:\cuda\12.8`、`CUDA_PATH=C:\cuda\12.8`、`FORCE_CUDA=1`、`TORCH_CUDA_ARCH_LIST=12.0`、`NVCC_FLAGS=-allow-unsupported-compiler`、`MAX_JOBS=4`。
  - 驗證通過：`pytorch3d._C.cp310-win_amd64.pyd` 可 import，CUDA `pytorch3d.ops.knn_points()` 在 5060 Ti 上回傳 finite tensor；`scripts/gvhmr_env_check.py` 的 `torch` / `cv2` / `pytorch3d` / `hmr4d` imports 已全綠，剩 GVHMR/HMR2/ViTPose/YOLO checkpoints 與 SMPL/SMPLX body model 權重未補。

- 建立公司電腦 MotionBERT 本機環境：
  - 以 portable `micromamba` 建立 `conda_vm/motionBERT/env` prefix env，Python 3.10.20，並補上 MotionBERT sidecar 所需的 PyTorch、NumPy、PyYAML、EasyDict 等依賴。
  - 下載官方 Hugging Face `FT_MB_lite_MB_ft_h36m_global_lite/best_epoch.bin` checkpoint 到 MotionBERT 預設路徑，讓 `server.py` 的 real MotionBERT readiness checks 可找到 env、repo、config、checkpoint 與 sidecar。
  - 公司 RTX 5060 Ti 是 `sm_120`，`torch+cu118` 會出架構不相容警告；改用 `torch 2.11.0+cu128` 後，CUDA tensor matmul 與 `scripts/motionbert_lift.py` sample smoke test 均可用 `device: cuda` 完成。

- 修正 Workbench 首頁入口漏掛 Motion Capture Lab：`index.html` 與相容入口 `portal.html` 的首屏按鈕與 Motion Mining 卡片都加入 `motion_capture_lab.html`，並擴充 `scratch/test_workbench_portal.mjs` 鎖定入口 contract。

- 修正 Motion Capture Lab Alicia preview 小腿 retarget 角度：
  - 根因是 `AliciaMotionPreviewAdapter.legOffsets()` 的 lower leg lateral rotation 仍沿用全腿 / 大腿方向，遇到膝蓋在外、腳踝回內的姿勢時，小腿會繼續往外甩。
  - lower leg 現在用 `knee -> ankle` segment 的 x 方向決定左右旋轉，缺少 knee landmark 時才 fallback 全腿向量；新增 `bent_knee_shin_trace` regression，鎖定小腿會跟 shin segment 回內。
  - 再收斂腿部 lateral retarget 係數與角度上限，避免寬腳踝 skeleton 在 Alicia preview 中被放大成過度劈腿；`leg_spread_trace` 現在鎖定上腿可見開腿但不可 over-abduct、小腿 lateral rotation 也有上限。
  - 依實機 preview 視覺再將腿部 lateral stance 係數與 clamp 下修 10%，讓 Alicia 開腳程度更接近裙裝角色可接受範圍。

- 新增 Alicia body-proportion skeleton retarget layer：
  - 新增 `js/AliciaSkeletonRetargeter.js`，把來源影片 / MotionBERT skeleton 視為動作意圖，先正規化成 Alicia-local 身材比例骨架，再交給 `AliciaMotionPreviewAdapter` 產生 preview bones。
  - retargeter 使用 Alicia rig profile 的骨長，並以 two-bone chain 保留 wrist / ankle endpoint 意圖與 elbow / knee bend plane，避免拍攝者身高、腿長、手長或 skeleton scale 漂移直接放大到 Alicia。
  - `AliciaMotionPreviewAdapter` 現在只用 raw source hips 保留 root 位移，手腳 rotation 改吃 Alicia-normalized landmarks；upper arm Y twist 改左右鏡像，讓左右手基準 pose 對稱。
  - 新增 `scratch/test_alicia_skeleton_retargeter.mjs`，並擴充 `scratch/test_motion_clip_exporter.mjs`，鎖定高個子 / 矮個子 / 長手長腿來源 retarget 後骨長與 preview rotation 都會收斂。

- 新增 Alicia body orientation / yaw estimator：
  - 新增 `js/AliciaBodyOrientationEstimator.js`，以肩寬/髖寬投影、左右肩 / 髖 z order、臉部可見度與腳踝 z order 推估 `facing`、`yawDegrees` 與 `confidence`。
  - Motion Capture Lab preview 現在會在 `normalizeSkeletonToAlicia()` 前先估 body yaw，將側身 source skeleton 反向旋回 Alicia front space 做 limb retarget，再把 yaw 加到 Alicia hips/root rotation。
  - 新增 `scratch/test_alicia_body_orientation_estimator.mjs`，並補強 retargeter / preview exporter regression，鎖定側身走路不再把前後腳誤解成大幅左右開腳，且 Alicia root 會真的轉向。

- 強化 Motion Capture Lab Skeleton extraction 進度回饋：
  - `Extract Skeleton From Video` 現在會顯示進度條、目前階段、細節 log 與成功 / 失敗收尾狀態；等待後端單次 API 回應期間以 client-side heartbeat 標示 MediaPipe extraction、MotionBERT depth lift 與等待結果。
  - 回應後會顯示實際 skeleton frame count、pose mode、depth source 與 lead foot 等細節，避免長時間抽取時不知道流程卡在哪一步。

- 修正 Alicia 大腿 / 膝蓋 retarget 對齊：
  - `AliciaMotionPreviewAdapter.legOffsets()` 現在有 knee chain 時會讓 upper leg lateral rotation 主要跟 `hips -> knee`，只有在 knee 與 ankle 同方向時才讓 `hips -> ankle` 補少量 stance。
  - 新增 `knee_dominant_leg_trace` regression，鎖定腳踝外伸但膝蓋往內/靠身體時，大腿不會被 ankle endpoint 拉成過度外開，小腿仍跟 `knee -> ankle` 方向。

- 新增 Motion Capture Lab Pose Copier 同步主線：
  - 右側預覽改為 `Alicia Pose Copier Preview`，新增 `Pose Copier / Walk Extractor` 模式；Pose Copier 會在影片 scrub、seek 與播放中同步目前 skeleton frame 到 Alicia 單幀姿勢，不再只依賴 walk loop preview。
  - `AliciaMotionPreviewAdapter` 新增 `previewPoseAtTimeMs()`，可找最近 skeleton frame 並產生 Alicia 單幀 retarget pose；`MotionController` 新增 `holdCustomPose()`，用 `custom_pose` 狀態維持該姿勢而不播放動畫時間軸。
  - 保留原本 Walk Extractor 的 `walk_style_v1` 匯出與 preview，下一階段可在 Pose Copier 基礎上接 `Record Synced Pose Clip -> Smooth / Normalize -> Export Alicia Motion Clip`。

- 修正 M21.0 3D lifted skeleton 對齊後 Alicia preview 手臂仍不跟的問題：
  - 根因在 `AliciaMotionPreviewAdapter` 的 skeleton trace retarget，而不是 MotionBERT；原本手/肘越往上，upper arm `z` offset 反而把 Alicia 往自然下垂方向推，且沒有輸出 shoulder 軌。
  - `joint_chain_preview` 現在會輸出 `leftShoulder/rightShoulder` keyframe，並把 arm elevation / lateral reach 轉成上舉方向的 upperArm offset，讓抬手到頭旁邊的 skeleton trace 能反映到右側 Alicia preview。
  - 新增 regression case `raised_arm_trace`，鎖定手腕抬高時左右 upper arm quaternion 會跨離 down-pose 方向，避免右側再次退回 generic walk / 手臂不跟的狀態。

- 修正 Alicia 手在人物前方時仍停在身側：
  - `AliciaMotionPreviewAdapter.armOffsets()` 現在會把 wrist / forearm 的 near-camera z 與 cross-body reach 納入上臂前伸與側掛解除；當手腕已在人物前方但 elbow 仍接近身側時，上臂也會離開自然下垂姿勢。
  - 前伸補償只套在低位 / 胸前手勢，避免破壞既有手靠近頭部時 upper arm 側向旋轉被中和的修正。
  - 新增 `front_hand_cross_body_trace` regression，鎖定右手在身體前方時 Alicia right upper arm 會跟出來，lower arm 仍維持向 hand pose 彎曲。

- 修正 Alicia 左前臂彎折方向不對：
  - `AliciaMotionPreviewAdapter.armOffsets()` 的 lower arm side roll 不再對 `elbow -> wrist` 的 x 方向取絕對值，改成保留內折 / 外伸方向，避免左手往頭側或身側彎時被套成同一個固定 roll。
  - 新增 `left_forearm_direction_trace` regression，鎖定同一個左 elbow 位置下，wrist 在內側與外側時 Alicia leftLowerArm 會產生相反側向彎折。

- 修正 Alicia 低位側伸手前臂過度下折：
  - 針對影片 `xc-YZjU4xOs` 約 1.87s 的側伸手姿勢，`leftShoulder -> leftElbow -> leftWrist` 接近同方向往外延伸時，Alicia 原本會把 lower arm bend 放大成明顯下垂。
  - `AliciaMotionPreviewAdapter.armOffsets()` 現在只在手低於肩、上臂與前臂同方向往外側延伸時降低 elbow flex，保留頭上彎手與胸前跨身手的彎折。
  - 新增 `side_reach_lower_arm_trace` regression，鎖定低位側伸手會維持較接近伸直的前臂角度。

- 修正 Alicia 手交叉無法跟上 skeleton：
  - 針對影片 `Ko1zDenQA7Y` 約 6.27s 的雙手交叉姿勢，skeleton 的 wrist 已跨過 chest center，但 Alicia upper arm 仍留在身體兩側。
  - 根因是 `AliciaMotionPreviewAdapter.armOffsets()` 用固定 left/right x 方向判斷 cross-body reach，遇到影片 / normalized skeleton 的左右座標方向相反時會把同側伸手當交叉、真正交叉手反而沒有 across-body 補償。
  - cross-body reach 現改用 shoulder 相對 torso center 的實際位置判斷，不再依賴 hard-coded side；新增 `crossed_arm_trace` regression，鎖定 wrist 跨胸時 upper arm 會比同側 wrist 更往胸前收。
- 針對 `https://www.youtube.com/shorts/fRcWSuVjjfc` 修正 Alicia skeleton trace 精準度：
  - 實測該片 real MotionBERT 可產生 92-frame `3d_lifted` trace，但 `depthConfidence/frontBackConfidence` 只有約 0.07，因此前後腳/前後手不適合硬做高信心判斷。
  - 新增 bent-hand-near-head regression：當 wrist 已高過 shoulder、elbow 仍低於 shoulder 時，forearm raise 也會中和 Alicia upperArm 的 down-pose 側向旋轉，改善手靠頭/彎手動作。
  - `torsoOffsets` 改用 chest-to-hips screen angle 估 torso roll，並新增 `hips` rotation keyframe，讓斜身 skeleton trace 能驅動 Alicia hips/spine/chest，不再只有手腳動、身體仍直挺。

- 新增 M21.0 real MotionBERT 3D Lift 整合：
  - 在 `conda_vm/motionBERT/` 建立本機 MotionBERT PoC 環境，改用 CUDA 11.8 PyTorch，並下載官方 `FT_MB_lite_MB_ft_h36m_global_lite/best_epoch.bin` checkpoint。
  - 新增 `scripts/motionbert_lift.py` sidecar，將 Alicia canonical 2D skeleton sequence 轉為 H36M 17-joint input，載入 MotionBERT checkpoint 後輸出 3D lifted z，不產生影片、不做 VRM bone retarget。
  - `/api/capture/video/skeleton` 的 `enable3dLift` 改為先嘗試 real MotionBERT；成功時標示 `depthSource: "motionbert"` 與 `MotionBert3DLiftSubprocess`，非 strict 模式不可用時才明確 fallback 到 `motionbert_poc`，strict 模式則回 503。
  - `walk_style_v1.metadata.motionBert` 保留 real/fallback 狀態，右側 Walk Style Summary 新增 MotionBERT 欄位，讓實際是否使用真 BERT 一眼可辨。
  - 中間 Skeleton Analysis 新增 `2D / 3D` 雙模式：2D 保留原平面分析，3D 模式以 canvas 投影 MotionBERT lifted skeleton，可用滑桿或拖曳旋轉，並用黃色/藍色深度顏色顯示 near/far。
  - 新增 MotionBERT mini summary 與 `Show MotionBERT 3D Skeleton` debug panel，顯示 Lead Foot、Depth Confidence、Viewpoint 與目前 frame 的 lifted joint `{x,y,z}` JSON，方便確認影片 -> 2D pose -> 3D lift -> WalkStyleExtractor 鏈路。

- 新增 M21.0 MotionBERT 3D Lift PoC sidecar：
  - 保留 M20.3 Walk Style Extractor 主線，不做 MotionBERT -> VRM bone retarget；MotionBERT PoC 只負責補 Z 軸語意，供 WalkStyleExtractor 判斷前後腳與 depth confidence。
  - `/api/capture/video/skeleton` 新增 `enable3dLift: true` 路徑，會在 2D/MediaPipe pose sequence 後套用 `MotionBert3DLiftPoc` metadata，輸出 `poseMode: "3d_lifted"`、`depthSource: "motionbert_poc"`、`viewpoint`、`frontBackConfidence` 與 `leadFoot`。
  - `WalkStyleExtractor` 若 sequence 有 z / 3D lift metadata，會用 ankle/knee z 推估 lead foot 與 `frontBackConfidence`；沒有可用深度時維持 2D heuristic fallback。`confidence` 保留既有 `overall/legs/arms`，並新增 `trackingConfidence/depthConfidence`。
  - `walk_style_v1` export 以 additive 欄位保留相容性：新增 `poseMode`、`viewpoint`、`frontBackConfidence`、`leadFoot` 與 `metadata.poseMode/depthSource`，不輸出逐骨頭 mocap。
  - Skeleton Canvas 的深度 badge 從 `front/back` 改成 `near/far + %`，低於 0.6 顯示 `uncertain`；右側 Summary 補 `Pose Mode`、`Depth Source` 與 `Lead Foot`。

- 修正 M20.3.9 Walk Style Preview 來源不透明：
  - 根因是 `motion_capture_lab.html` 雖然在 preview 前把 extract 出來的 `previewFrames` 掛到 `walk_style_v1`，但 `AliciaMotionPreviewAdapter.previewClip()` 對 `walk_style_v1` 會先走 `AliciaWalkGenerator`，導致右側看起來像 generic Alicia walk，而不是目前 extract skeleton 的 trace。
  - `AliciaMotionPreviewAdapter` 改成 `walk_style_v1 + previewFrames` 時優先播放 extracted skeleton trace，沒有 frame 時才 fallback 到 Alicia Walk Generator；正式 export 仍保持 `walk_style_v1`，不把 skeleton frames 寫進 runtime style JSON。
  - 右側 Walk Style Summary 新增 `Preview Source`，preview 後會明確顯示 `Extracted skeleton trace` 或 `Alicia walk generator`，避免把參數化生成誤認成影片逐格 retarget。
  - 擴充 `scratch/test_walk_style_extractor.mjs` 與 `scratch/test_motion_capture_lab.mjs`，鎖定 skeleton trace 優先序與 UI source label。

- 新增 M20.3.8 Motion Capture Lab 新版 Walk Style Extractor 介面：
  - `motion_capture_lab.html` 改成新版三步驟工作流：`Input Source`、`Walk Cycle Analysis`、`Alicia Walk Preview`，主畫面正式呈現為 Walk Style Extractor，不再以 Full Mocap / Motion Clip 為主敘事。
  - 左側保留 YouTube URL、Skeleton JSON、影片預覽、影片資訊與單段 Capture Range；進階的 Video file / Webcam / VRMA / source type 收進 `Advanced Debug`，讓主要流程更乾淨。
  - 中間新增 `Walk Parameters (Extracted)` 面板，直接顯示 `stride`、`cadence`、`armSwing`、`hipBob`、`bounce`、`bodyLean`、loop range 與 confidence，並把 phase marker 表單降為 debug 區塊。
  - 右側新增 Walk Style Summary、preview speed、refresh preview、`Export Walk Style (walk_style_v1)` 與 collapsible JSON viewer；`previewSpeed` 會作為 Alicia Walk Generator 的預覽倍率，不改寫正式 export 參數。
  - 擴充 `scratch/test_motion_capture_lab.mjs` 鎖定新版 UI contract、面板資料同步函式與 preview controls，並保留既有 YouTube / range / skeleton / Alicia preview 流程測試。

## 2026-06-17

- 新增 M20.3.7 Walk Style Extractor 轉向：
  - 將 M20.3 主線從「Video Skeleton Motion Trainer / 逐骨頭 retarget」收斂成「Walk Style Extractor」：正式輸出改為 `walk_style_v1`，不再把 shoulder / wrist / ankle 等點硬轉成 VRM 骨頭角度。
  - 新增 `js/WalkStyleExtractor.js`，從 Pose Sequence、Cycle Detector 與 Phase markers 估算 `stride`、`cadence`、`armSwing`、`hipBob`、`bounce`、`bodyLean` 與 confidence，保留對低品質影片、遮擋、腳看不清楚、鏡頭角度不同的容錯。
  - 新增 `js/AliciaWalkGenerator.js`，由 `walk_style_v1.parameters` 生成 Alicia-style procedural custom animation；`AliciaMotionPreviewAdapter` 支援 `walk_style_v1` 並回報 `walk_style_generator`。
  - `motion_capture_lab.html` 的正式 export/preview 改走 `walk_style_v1` / Alicia Walk Generator；既有 `motion_clip_v1` 與 joint-chain retarget 保留為 legacy/debug，不再作為 M20.3 的主產品承諾。
  - 新增 `scratch/test_walk_style_extractor.mjs`，並調整 `scratch/test_motion_capture_lab.mjs`，鎖定 Walk Style contract、Alicia generator 行為與 lab page 主線。

- 新增 M20.3.6 Motion Capture Lab joint-chain retarget：
  - 釐清目前精度瓶頸已從 video-to-skeleton 轉到 skeleton-to-VRM retarget；原本 3D preview 只用 shoulder-wrist、hips-ankle endpoint 估 Euler 角度，側身、手腳前後交錯時會失真很大。
  - `server.py` 的 MediaPipe canonical conversion 新增 optional `leftElbow`、`rightElbow`、`leftKnee`、`rightKnee`，不破壞既有 9-point skeleton schema，但新抽影片可保留二段肢體資訊。
  - `motion_capture_lab.html` 的 Skeleton Canvas 會畫 elbow/knee 二段骨架；Alicia preview status 會顯示 `joint_chain_preview` 或 `endpoint_preview`，方便判斷目前是不是用到新資料。
  - `AliciaMotionPreviewAdapter` 改成優先以 shoulder-elbow-wrist、hips-knee-ankle joint-chain 推 upper/lower arm/leg，並保留舊 endpoint fallback 給舊 skeleton JSON。
  - 擴充 `scratch/test_video_skeleton_api.py`、`scratch/test_motion_capture_lab.mjs`、`scratch/test_motion_clip_exporter.mjs`，鎖定 elbow/knee 輸出、Canvas 二段骨架，以及 elbow/knee 變化會實際改變 3D custom animation quaternion。

- 新增 M20.3.5 Motion Capture Lab skeleton depth cue：
  - 中間 Skeleton Cycle Canvas 改成帶深度語意的 2.5D 檢視：越靠近 camera 的點/骨段越暖色、越大、越不透明；越遠的點/骨段越冷色、越淡。
  - 新增手腕與腳踝的 `front` / `back` / `level` badge，分別以 wrist vs shoulder、ankle vs hips 的 z 差判斷，讓 range 調整時能快速看出手腳在人物前方或後方。
  - 擴充 `scratch/test_motion_capture_lab.mjs` 鎖定 depth helper、depth marker、front/back badge 與 canvas renderer contract。

- 修正 M20.3.4 Motion Capture Lab Alicia preview 固定不變：
  - 根因是 `AliciaMotionPreviewAdapter.previewClip()` 只呼叫內建 `motion.play('walk_cycle')`，完全沒有使用 `motion_clip_v1.keyPoses`；因此 range、phase 與 export JSON 有變，但右側 3D preview 永遠播放同一套固定程序步態。
  - `AliciaMotionPreviewAdapter` 改成優先將 `keyPoses` 轉成 `motion.playCustom(...)` 可播放的 custom animation，包含 hips position、torso、arms 與 legs 的粗略 retarget；沒有 custom runtime 時才 fallback 內建 walk cycle。
  - `Preview Walk Cycle` 按鈕改成每次都從目前 UI 重新 `exportCurrentClip({ silent: true })`，避免沿用舊的 `state.clip` cache，造成調整 start/end/phase 後 preview 還是舊片段。
  - 進一步修正手臂高舉漏失：preview now 會在暫時 clip 附上 loop 區間內的 dense skeleton frames，不只吃 8 個 phase key poses；手腕高於肩膀、離肩膀越遠時會更明顯推動 upper arm rotation，讓影片中手舉起來能反映到 Alicia 3D preview。
  - 擴充 `scratch/test_motion_clip_exporter.mjs` 與 `scratch/test_motion_capture_lab.mjs`，鎖定 custom preview adapter 與 preview 重新 export 行為。

- 新增 M20.3.3 Motion Capture Lab 單段影片範圍抽取：
  - `motion_capture_lab.html` 新增 Capture Range 控制面板，支援 start/end range slider、毫秒輸入，以及用目前播放位置快速設定起點/終點。
  - `Extract Skeleton From Video` 會把 `startMs/endMs` 一起送到 `/api/capture/video/skeleton`，只抽該單段走路片段；抽完後既有 cycle range 會落在該段 skeleton 的首尾時間。
  - 中間 Skeleton Cycle 欄位縮小，`skeletonPreviewCanvas` 高度下修，讓左側影片選段與右側 export 成為主要操作區。
  - `server.py` 新增影片範圍驗證與 OpenCV seek：`endMs <= startMs` 會在進 extractor 前回 400，MediaPipe 只處理指定時間區間。
  - 擴充 `scratch/test_motion_capture_lab.mjs` 與 `scratch/test_video_skeleton_api.py`，鎖定 UI contract、range 參數送出與 invalid range 防護。

- 新增 M20.3.2 Motion Capture Lab video-to-skeleton extractor：
  - 修正 YouTube 來源 UX 斷點：使用者不需要自備 Skeleton JSON，`motion_capture_lab.html` 新增 `Extract Skeleton From Video`，會把目前 YouTube cache 影片送到 `/api/capture/video/skeleton`，回傳後直接灌入既有 Skeleton Cycle / Motion Clip export 流程。
  - `server.py` 新增本機影片 URL resolver、MediaPipe/OpenCV skeleton extractor、canonical landmarks mapping 與 `/api/capture/video/skeleton`；目前先支援 `capture/youtube/*.mp4`，本機 browser blob 影片待後續 upload endpoint。
  - `requirements.txt` 補齊並 pin `numpy`、OpenCV、MediaPipe、JAX/ML dtypes，避免姿態偵測依賴把既有 TensorFlow/Scipy 環境拉壞。
  - 新增 `scratch/test_video_skeleton_api.py`，擴充 `scratch/test_motion_capture_lab.mjs`，並用 `local_assets/capture/youtube/LVqSKQtfU8M.mp4` smoke 驗證實際可抽出 65 個 skeleton frames。
  - 修正 Skeleton Preview 判讀誤差：Canvas 原本永遠畫第一格，會與左側影片播放時間不同步；現在依 `videoPreview.currentTime` 選最近的 skeleton frame，並加上骨架連線與 frame time 標示，避免把不同時間點拿來比較。

- 新增 M20.3.1 Motion Capture Lab YouTube 來源：
  - `motion_capture_lab.html` 新增 YouTube URL source，輸入網址後呼叫本機 `/api/capture/youtube`，成功後把回傳的 local video URL 接回既有 `videoPreview` 流程。
  - `server.py` 新增 YouTube URL validation、`yt-dlp` 本機下載 wrapper、`local_assets/capture/youtube/` cache 與 `/capture/youtube/<filename>` 安全檔案 route；下載素材維持 local-only，不進 git。
  - 新增 `scratch/test_youtube_capture_api.py`，並擴充 `scratch/test_motion_capture_lab.mjs` 鎖定 UI/API contract 與 video source cleanup 行為。

- 新增 M20.3 Motion Capture Lab：
  - 建立 `motion_capture_lab.html` lab-only 捕捉頁，串接 Video/Webcam/Skeleton JSON/VRMA 來源入口、Skeleton Preview、Cycle Detection、Alicia Preview 與 Motion Clip export；頁面保持 body no-scroll、三欄面板內部捲動，避免中間預覽高度誤判。
  - 新增 Motion Capture 資料契約與 adapter：`MotionCaptureTypes`、`SkeletonSequenceAdapter`、`PoseEstimatorAdapters`、`MotionCycleDetector`、`MotionClipExporter`、`AliciaMotionPreviewAdapter`，先完成 deterministic Skeleton JSON -> Cycle Detection -> Key Pose Extraction -> `motion_clip_v1` -> Alicia Preview adapter 路徑。
  - 新增 `motions/capture_samples/walk_reference_001.json` 作為 9-frame walk reference sample，支援 Contact/Down/Passing/Up 八相位 seed 與 `walk_cycle_001` export。
  - Alicia preview 維持 optional：VRM binary 仍是 local-only，不簽入 repo；頁面會先檢查 `models/mascot.vrm`，缺本機模型時停用 preview 並保留 Skeleton JSON export 完整可用。
  - 修正 lab source 切換時的 webcam stream cleanup：重新啟動 webcam 或切換到 video file 前會停止既有 `MediaStreamTrack`，避免攝影機在頁面 session 中殘留啟用。
  - 補齊 M20.3 regression tests：資料契約、Skeleton JSON adapter、pose estimator adapter registry、cycle detector、motion clip exporter、preview adapter 與 lab page contract；測試涵蓋 malformed input、missing model fallback、retarget hint fallback、missing frame marker 與 sample -> seed -> export 行為。

- 新增 M20.2 Motion Quality Tuner：
  - 擴充 `HumanMotionLayer.configure()`，加入 `motionIntensity`、`breathingAmplitude`、`weightShiftAmplitude`、`shoulderRelax`、`headDrift`、`gestureEase`、`gestureDuration`、`idleAsymmetry` 等可選參數，預設倍率維持 1，未啟用 humanization 時不改 production default。
  - 強化 idle overlay：Level 1 呼吸連動 spine/chest/hips/shoulders，Level 2 加入重心轉移、head/neck drift 與左右肩/手腕/hips 的不對稱微動，避免站姿完全鏡像死僵。
  - 重做 `touch_face` 與 `stretch` 手勢 envelope，改成 anticipation / action / recovery 三段式，並讓 stretch 串起胸口、肩膀與頭部連動。
  - 在 `pose_training_lab.html` 新增 Motion Quality Tuner panel，可即時調整 motion intensity、呼吸、重心、肩頸、頭部、手勢 easing/時長與 idle asymmetry；Stop Playground 仍走 `disableHumanization()` 回復原 idle 管線。
  - 修正 `pose_training_lab.html` 初始 preview camera framing：Lab 載入 VRM 後會覆寫成更低、更遠的全身視角，避免沿用 core 預設近距離相機時只看到頭頂，並讓 Alicia 盡量落在畫面中央。
  - 修正 Pose Training Lab layout：鎖定 `html/body` 為 viewport 高度並關閉 document-level scroll，讓左右面板各自滾動，中間 WebGL stage 不再被右側內容撐高而誤判人物位置。
  - 新增 Pose Training Lab Click-to-Select Bone：在 Lab canvas 點擊 Alicia 身體部位時，會將對應骨骼 world position 投影為熱區並自動切換右側 `boneSelect` 與骨骼 slider；此功能只作用於 Lab，不修改 `VrmMascot` core public API。
  - 擴充 `scratch/test_human_motion_layer.mjs` 與 `scratch/test_pose_training_lab.mjs`，驗證調參倍率、idle 不對稱、gesture phase、stretch 連動與 lab UI contract。

- 新增 M21 Scene Object Interaction Demo Adapter：
  - 新增 `js/SceneObjectAdapter.js`，提供 `registerObject()`、`listObjects()`、`getObject()` 與 `perform()`，支援 deterministic listing、duplicate guard、replace、unknown object / unknown verb 安全回傳，以及 callback dispatcher。
  - 升級 `demo.php` 的 Alicia Scene Playground，註冊 `cake`、`release_box`、`warning_probe` 三個 3D prop 物件，並加入 DOM-only `asset_manifest_panel` 與 `terminal_panel`，先在 demo 層驗證 object + verb 語意模型。
  - 將 toy card click flow 改成先呼叫 `sceneObjectAdapter.perform()`，再映射到既有 `AutoDirector.runEvent()` story beat；若 adapter 無法解析則 fallback 原本 topic 行為。
  - 新增 `focus` 的 demo-only focus-only 分支，只做 scene focus / gaze，不觸發完整演出；蛋糕完整生日演出改以 `eventId: birthday_cake` 明確鎖定，避免一般 inspect/focus 誤觸發 celebration。
  - 鎖定 Adapter Contract：`SceneObjectAdapter` 是 demo-first contract，不依賴 STEP、不修改 `VrmMascot` core；`perform()` 失敗一律回 `{ ok: false }`，`focus` 作為低風險共通 verb，`birthday_cake` 以 `eventId` 明確綁定 story beat，避免後續 topic 分歧。
  - 新增 `scratch/test_scene_object_adapter.mjs`，並擴充 `scratch/test_showcase_pack.mjs`，確認 demo 引入 adapter、註冊至少三個物件、卡片點擊走 `adapter.perform()`、cake celebrate 對應 birthday cake story beat，且不修改 `VrmMascot` core default behavior。

- 新增 M20.1.7 Scene Playground Integration 官方展示頁整合：
  - 升級 `demo.php`，在 Alicia 載入後自動啟用進階 Level 4 擬人化行為（眨眼、呼吸微動、重心位移與自動手勢）。
  - 在 `ScenePropLayer` 中加入程序化 `birthdayCake` 互助道具，包括粉紅蛋糕體、白色奶油層、黃色蠟燭及具備隨機抖動/縮放動畫效果的 `Flame` 火焰網格（MeshBasicMaterial）。
  - 於 `ToyRoomStory` 中新增 `birthday_cake` 生日慶祝事件（Chapter 6），並在 `AutoDirector.runEvent()` 中實作專屬腳本演出序列（gaze look-at -> thinking 表情 -> 觸發 touch_face 手勢 -> 觸發 stretch 手勢 -> 成功喜悅表情與吹蠟燭對白）。
  - 於 HUD 面板中央上方新增精美的 `toy-card cake` 按鈕，點擊可直接觸發慶祝劇情。
  - 將前端自動導演 `AutoDirectorLite` 整合進 `demo.php` 背景動畫循環，於劇本序列執行期間（`isExecuting`）自動暫停排程器，並在手勢觸發時重設冷卻時間（`notifyManualGesture`），確保自然無衝突的活人感演出。
  - 擴充 `scratch/test_showcase_pack.mjs` 自動化整合測試，驗證 `AutoDirectorLite` 引入、Level 4 擬人化調用、蛋糕道具構造與火焰動畫查詢、生日劇本與手勢序列、以及確保未修改任何 core production defaults。

- 新增 M20.1.6 Auto Director Lite 模擬自動導演：
  - 新增 `js/AutoDirectorLite.js` 模組，作為純前端的自動導演排程器，負責管理手勢觸發間隔（Touch Face 90秒、Stretch 180秒）、冷卻時間（8秒）、觸發資格校驗與 Tie-breaker（兩者皆到期時 Stretch 優先且重設 Touch Face）等邏輯。
  - 升級 `pose_training_lab.html`，在擬人化行為遊樂場中加入「啟動自動導演」勾選框，並提供即時 HUD 狀態監測面板，顯示運行狀態、觸發資格、上次動作、倒數計時及冷卻時間。
  - 串接遊樂場控制邏輯，停止遊樂場預覽時自動停用自動導演並清空所有計時器；手動測試手勢時通知排程器以重設計時與冷卻時間。
  - 新增 `scratch/test_auto_director_lite.mjs` 自動化測試，驗證不同擬人化層級、各項觸發資格條件、冷卻時間限制、Tie-breaker 優先權重與重設行為；同步擴展 `scratch/test_pose_training_lab.mjs` 確保 HTML 頁面包含自動導演 DOM 元素及相關腳本契約。

- 新增 M20.1.5 Human Motion Playground 擬人化行為遊樂場：
  - 新增 `js/HumanMotionLayer.js` 模組，掌管呼吸微動（Level 1）、重心位移（Level 2）及可手動觸發的摸臉（Level 3）與伸展（Level 4）手勢。
  - 調整 `MotionController.js`，使內建程式化呼吸微動可受 `#idleMicroMotionEnabled` 控制，避免與擬人化行為層疊加。
  - 調整 `VrmMascot.js`，引入 `HumanMotionLayer` 並提供 `enableHumanization()`、`disableHumanization()` 與 `triggerGesture()` 頂層 API。
  - 升級 `pose_training_lab.html`，於右側控制面板加入「擬人化行為遊樂場 (Playground)」區塊，包含 L0-L4 模擬層級切換、眨眼/呼吸/重心/摸臉/伸展狀態指示燈，以及手動測試手勢與停止預覽功能。
  - 新增全套自動化測試 `scratch/test_human_motion_layer.mjs`，驗證各擬人層級下的骨骼位移行為與動作/VRMA 限制；同步升級 `scratch/test_pose_training_lab.mjs` 確保 DOM 與 API 連接契約完整。

- 新增 M20.1 Pose Training Lab 姿勢微調與評分系統：
  - 新增 Pose Library，並將首個自然站姿種子檔案存入 `motions/poses/standing/stand_relaxed_001.json`。
  - 實作本機 Pose Library API (`GET /api/pose-library` 與 `POST /api/pose-library`)，具備自動遞迴掃描目錄、自動生成/重寫 `pose_library_manifest.json`、安全 Slug ID、合法分類與路徑防穿越校驗功能。
  - 新增 `pose_training_lab.html` 工具，整合 VrmMascot (Three.js/GLTFLoader/OrbitControls/three-vrm) 提供即時 3D 模型預覽、關節角度與 Hips 位移調整滑桿、鏡像模式、Static QA 姿勢檢核、擬人化層級設定及 Runtime QA 欄位預覽。
  - 建立全套自動化驗證測試：包含 `scratch/test_pose_library.mjs` (校驗 Preset 格式與 MotionController 相容性)、`scratch/test_pose_training_lab.mjs` (校驗網頁 DOM 與 API 連接契約) 以及 `scratch/test_pose_library_api.py` (校驗 GET/POST、不合法分類與路徑穿越防護)。
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
