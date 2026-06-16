# Alicia Release Deploy Design

## Summary

This design defines how Alicia Runtime is packaged and deployed after local development. The local repository remains the only development source. 3wa.tw or any other host receives only versioned release builds.

The immediate target is a repeatable `build_release.bat v0.1.0` workflow. The script implementation comes later; this spec locks the package boundary first.

## Core Rules

1. `D:\mytools\my_vrm_mascot` is the only development workspace.
2. Deployment hosts consume release builds only.
3. Releases use immutable version directories.
4. `current` points to the stable version.
5. Projects reference only `current/alicia-runtime.js`.
6. Project customization lives in adapters, not in Alicia core.

These rules prevent ad-hoc host edits, local assets leaking into releases, and downstream projects copying their own divergent mascot bundles.

## Local Release Flow

```text
Windows local repo
  -> git clone / pull my_vrm_mascot
  -> restore approved local assets
  -> run tests
  -> build release v0.1.0
  -> upload release directory to host
  -> update current to point at v0.1.0
```

Planned command:

```bat
build_release.bat v0.1.0
```

The script should create a local release output directory such as:

```text
dist/alicia/releases/v0.1.0/
```

The deploy step copies that directory to the approved public asset root on the host.

## Host Layout

Use a versioned public asset layout:

```text
<public-assets-root>/alicia/
├─ releases/
│  └─ v0.1.0/
│     ├─ js/
│     ├─ models/
│     ├─ motions/
│     ├─ manifests/
│     ├─ skills/
│     ├─ examples/
│     ├─ docs/
│     ├─ alicia-runtime.js
│     ├─ release.json
│     └─ README.md
├─ current -> releases/v0.1.0
└─ README.md
```

The exact server filesystem path is deployment-private and should not be documented in public usage docs. Public documentation should refer only to the web-visible asset URL and the `current/` contract.

## Release Package Contract

A release package is:

```text
runtime + assets + manifests + usage docs + skill interface + adapter examples
```

Directory contract for `v0.1.0`:

```text
v0.1.0/
├─ js/
├─ models/
├─ motions/
├─ manifests/
├─ skills/
│  ├─ alicia-skill-bridge.schema.json
│  ├─ alicia-skill.examples.md
│  └─ alicia-skill.md
├─ examples/
│  ├─ step_threejs_adapter.example.js
│  └─ basic_embed.html
├─ docs/
│  ├─ usage.md
│  ├─ release-notes.md
│  └─ asset-policy.md
├─ alicia-runtime.js
├─ release.json
└─ README.md
```

### Include

- Runtime entry: `alicia-runtime.js`.
- Runtime modules needed by the entry.
- Approved runtime JS under `js/`.
- Approved model assets under `models/`, such as `models/mascot.vrm` when license and release policy allow it.
- Approved motion assets under `motions/`; for `v0.1.0`, include only free or explicitly approved VRMA files.
- Runtime manifests under `manifests/`, including semantic motion, registry, profile summaries, and release asset metadata.
- Usage docs and release notes.
- Skill contract docs and schema.
- Adapter examples.

### Exclude

- `scratch/`.
- Test files.
- `docs/superpowers/specs/` and large internal design history.
- Motion Mine workbench.
- Mining scratch data, cache, and logs.
- `local_assets/`.
- Unverified third-party VRMA binaries.
- Personal IDE settings and environment files.

## Manifests

`manifests/` separates metadata from physical motion binaries.

Recommended files:

```text
manifests/
├─ semantic_motion_library.json
├─ semantic_motion_registry.json
├─ motion_profiles.summary.json
├─ asset_manifest.json
└─ source_manifest.json
```

Rules:

- Manifests may reference source motion names even when physical VRMA files are not included.
- `asset_manifest.json` lists every file physically included in the release package.
- `source_manifest.json` records upstream sources and license notes for included third-party assets.
- Release builds must not infer asset inclusion from local mining folders.

## Runtime Entry

Downstream projects reference only:

```html
<script type="module" src="/assets/alicia/current/alicia-runtime.js"></script>
```

The actual public URL prefix can vary by host. The stable contract is:

```text
current/alicia-runtime.js
```

Projects must not import files directly from `releases/v0.1.0/` unless they intentionally pin a version for testing.

## Adapter Rule

Projects customize Alicia through adapters:

```text
project page
  -> project adapter
  -> current/alicia-runtime.js
  -> Alicia core
```

Adapter examples belong in:

```text
examples/
├─ step_threejs_adapter.example.js
└─ basic_embed.html
```

Adapters may:

- Map project-specific events into Alicia Skill Bridge actions.
- Provide host app context.
- Configure endpoint URLs.
- Configure UI mount points.

Adapters must not:

- Patch Alicia core files.
- Copy runtime internals into host projects.
- Edit release package files in place.
- Reference local-only assets.

## release.json

Every release must include `release.json`.

Example:

```json
{
  "name": "Alicia Runtime",
  "version": "0.1.0",
  "entry": "alicia-runtime.js",
  "usage": "docs/usage.md",
  "skill": "skills/alicia-skill.md",
  "skillSchema": "skills/alicia-skill-bridge.schema.json",
  "examples": [
    "examples/basic_embed.html",
    "examples/step_threejs_adapter.example.js"
  ],
  "builtAt": "2026-06-16",
  "sourceRepo": "https://github.com/shadowjohn/my_vrm_mascot",
  "containsThirdPartyAssets": true,
  "assetPolicy": "docs/asset-policy.md"
}
```

Rules:

- `version` must match the release directory name without the leading `v`.
- `entry` must point to `alicia-runtime.js`.
- `containsThirdPartyAssets` must be accurate for the package.
- `examples` must list files that exist in the package.
- `assetPolicy` must explain what assets are included and what remains local-only.

## build_release.bat Contract

Planned usage:

```bat
build_release.bat v0.1.0
```

Responsibilities:

1. Validate the version string.
2. Refuse to overwrite an existing release directory unless an explicit force flag is later added.
3. Run required verification commands.
4. Create the release directory.
5. Copy only allowlisted runtime files.
6. Copy only approved assets.
7. Generate or copy manifests.
8. Generate `release.json`.
9. Print the output path and next deploy command hints.

Required verification before packaging:

```powershell
$tests = Get-ChildItem -LiteralPath .\scratch -Filter test_*.mjs | Sort-Object Name
foreach ($test in $tests) {
  node $test.FullName
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
python .\scratch\test_motion_profile_api.py
python -m py_compile .\server.py
git diff --check
```

The build script should fail fast if any verification command fails.

## Version and current Policy

- Each release directory is immutable after upload.
- Rollback means changing `current` back to an older release.
- Projects should use `current/` for stable production usage.
- QA or canary pages may pin a specific `releases/vX.Y.Z/` path.
- `current` should be updated only after smoke testing the uploaded release.

On Linux hosts, `current` should be a symlink:

```text
current -> releases/v0.1.0
```

If symlink is not available, use an equivalent host-level alias or copy-on-release rule, but the public contract must still be `current/`.

## Asset Policy

Release assets must be explicitly approved.

`v0.1.0` should include:

- `models/mascot.vrm` only when the model license allows release distribution.
- `motions/*.vrma` only when each file is free, approved, and listed in `asset_manifest.json`.
- `manifests/*.json` for semantic metadata.

`v0.1.0` must not include:

- `local_assets/`.
- Unverified external VRMA files.
- Mining-only source folders.
- Cached render or generated debug output.

When an asset is useful but not releasable, keep its profile or manifest metadata if allowed, but do not include the binary.

## M18 / M19 Relationship

M18 Alicia Skill Bridge defines the runtime action contract.

The release package must ship:

- `skills/alicia-skill-bridge.schema.json`
- `skills/alicia-skill.md`
- `skills/alicia-skill.examples.md`

M19 Online Demo Bridge consumes release packages only. It should not deploy from raw local workspace folders.

## Acceptance Criteria

- The release/deploy boundary is documented before build script implementation.
- Local repo is the only development source.
- Host deployments consume only versioned release builds.
- `current/alicia-runtime.js` is the only stable project import contract.
- Release package contents are explicit.
- Internal design specs, tests, scratch files, Motion Mine workbench, cache, and local assets are excluded.
- Skill interface docs and adapter examples are included in releases.
- The exact deployment filesystem path stays out of public docs.
