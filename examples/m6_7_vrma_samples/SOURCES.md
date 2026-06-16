# M6.7 VRMA Motion Mining Sources

這個目錄保存 Alicia Motion Mine 使用的 VRMA 採礦樣本，以及人工描述後產出的 semantic motion 資料。

目前總量：

| 類型 | 數量 |
|------|------|
| git 內實體 VRMA binary | 0 |
| 本機 demo VRMA（可選還原） | 11 |
| motion profile 覆蓋的 VRMA 名稱 | 172 |
| 內建 demo samples（local-only） | 11 |
| DavinciDreams/3dchat samples（manifest/profile only） | 152 |
| test157t samples（manifest/profile only） | 9 |
| motion profiles | 172 |
| 已有人類描述 profiles | 172 |
| mining log entries | 173 |

## 使用原則

- `review/motion_profiles.json` 與 `review/mining_log.json` 是本專案人工整理出的描述資料，保留並簽入版本庫。
- 第三方 VRMA binary 只作為本機採礦與研究用途；若要重新散佈、包進產品、或公開部署，必須再次確認上游授權。
- 目前 git 內不簽入任何 VRMA binary，只保留 `source_manifest.json`、人工描述與衍生 semantic motion 資料。
- 本機還原位置建議使用 `local_assets/vrma/`；該目錄由 `.gitignore` 排除。
- 每批外部來源都保留 `source_manifest.json`，包含來源 URL、上游路徑、檔案大小與 sha256。
- 目前 semantic motion 資料層不直接進正式 runtime；正式播放仍需後續 Runtime Playback 階段再接。

## Source Summary

| 來源 | 數量 | 來源 URL | 授權狀態 | 備註 |
|------|------|----------|----------|------|
| tk256ailab/vrm-viewer VRMA | 11 | https://github.com/tk256ailab/vrm-viewer/tree/main/VRMA | README 記錄為 MIT | local-only demo sample，用於 baseline 與初期 importer 測試 |
| DavinciDreams/3dchat batch 1 | 41 | https://github.com/DavinciDreams/3dchat | local mining only, license not verified | agent-friendly 表情、指向、思考、警告、成功等姿勢 |
| DavinciDreams/3dchat batch 2 | 35 | https://github.com/DavinciDreams/3dchat | local mining only, license not verified | future/reject 與 locomotion 類樣本，補資料分布 |
| DavinciDreams/3dchat batch 3 | 44 | https://github.com/DavinciDreams/3dchat | local mining only, license not verified | locomotion / dance / full-body 類樣本，用於未來 hips、weight shift、dance pipeline |
| DavinciDreams/3dchat batch 4 | 32 | https://github.com/DavinciDreams/3dchat | local mining only, license not verified | object interaction、combat-like negative samples、performance samples |
| test157t/VRM-Assets-Pack-For-Silly-Tavern | 9 | https://github.com/test157t/VRM-Assets-Pack-For-Silly-Tavern | local mining only, license not verified | greeting、hello、peace sign、show full body 等補充樣本 |

## Local Demo File List

These file names are documented for local restore only. The `.vrma` binaries
are intentionally not committed.

- `Angry.vrma`
- `Blush.vrma`
- `Clapping.vrma`
- `Goodbye.vrma`
- `Jump.vrma`
- `LookAround.vrma`
- `Relax.vrma`
- `Sad.vrma`
- `Sleepy.vrma`
- `Surprised.vrma`
- `Thinking.vrma`

## Source Manifests

```text
external/davinci_3dchat/source_manifest.json
external/davinci_3dchat_batch2/source_manifest.json
external/davinci_3dchat_batch3/source_manifest.json
external/davinci_3dchat_batch4/source_manifest.json
external/test157t/source_manifest.json
```

DavinciDreams/3dchat manifest 目前記錄上游 commit：

```text
25f22f42f3f2d3f92a979e9710a2d5cf4d0f7d00
```

## Review Data

```text
review/motion_profiles.json
```

`motion_profiles.json` 是最重要的人類理解資料，目前 172 筆皆已填寫描述。主要欄位：

- `motionCategory`
- `motionScore`
- `description`
- `usageDescription`
- `agentUsage`

目前主分類統計：

| 分類 | 數量 |
|------|------|
| point | 50 |
| warning | 47 |
| present | 28 |
| think | 23 |
| candidate_future | 11 |
| success | 7 |
| reject | 6 |

```text
review/mining_log.json
```

`mining_log.json` 保存 173 筆採礦紀錄，用於追溯候選、淘汰、future candidate 與後續報表。

## Derived Semantic Data

以下檔案由人工描述資料衍生，原則是不覆寫原始 profiles：

```text
review/motion_text_reclass_report.json
review/pose_style_recipes.json
review/pose_style_recipe_report.md
review/semantic_motion_library.json
review/semantic_motion_library_report.md
review/semantic_motion_registry.json
review/semantic_motion_registry_report.md
```

目前 semantic motion 種子：

- `come_here`
- `point_target`
- `cross_no`
- `thinking_chin`
- `angry_hands_waist`
- `shy_head_touch`
- `wave_goodbye`
- `look_around`
- `victory_pose`
- `hands_up_surrender`
