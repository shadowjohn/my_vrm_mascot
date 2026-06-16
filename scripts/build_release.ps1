param(
    [Parameter(Position = 0)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[release] $Message"
}

function Fail {
    param([string]$Message)
    Write-Error $Message
    exit 1
}

function Run-Command {
    param(
        [string]$FilePath,
        [string[]]$Arguments
    )
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        Fail "Command failed: $FilePath $($Arguments -join ' ')"
    }
}

function Ensure-Dir {
    param([string]$Path)
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Copy-FileToRelease {
    param(
        [string]$Source,
        [string]$Destination
    )
    if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
        Fail "Missing required file: $Source"
    }
    Ensure-Dir (Split-Path -Parent $Destination)
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Write-Utf8NoBom {
    param(
        [string]$Path,
        [string]$Content
    )
    Ensure-Dir (Split-Path -Parent $Path)
    [System.IO.File]::WriteAllText((Resolve-Path -LiteralPath (Split-Path -Parent $Path)).Path + [System.IO.Path]::DirectorySeparatorChar + (Split-Path -Leaf $Path), $Content, [System.Text.UTF8Encoding]::new($false))
}

function Add-Asset {
    param(
        [System.Collections.Generic.List[object]]$Assets,
        [string]$Path,
        [string]$Type,
        [string]$LicenseStatus,
        [bool]$Distributable,
        [string]$Source
    )
    $Assets.Add([ordered]@{
        path = $Path.Replace('\', '/')
        type = $Type
        licenseStatus = $LicenseStatus
        distributable = $Distributable
        source = $Source
    }) | Out-Null
}

function ConvertTo-JsonFile {
    param(
        [string]$Path,
        [object]$Value,
        [int]$Depth = 8
    )
    $json = $Value | ConvertTo-Json -Depth $Depth
    Write-Utf8NoBom -Path $Path -Content ($json + "`n")
}

function Find-VrmaAssetSource {
    param([string]$Name)
    $candidateSources = @(
        (Join-Path $Root "local_assets\vrma\$Name"),
        (Join-Path $Root "examples\m6_7_vrma_samples\$Name")
    )
    foreach ($candidate in $candidateSources) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return $candidate
        }
    }

    $localVrmaRoot = Join-Path $Root 'local_assets\vrma'
    if (Test-Path -LiteralPath $localVrmaRoot -PathType Container) {
        $found = Get-ChildItem -LiteralPath $localVrmaRoot -Recurse -File -Filter '*.vrma' |
            Where-Object { $_.Name -eq $Name } |
            Select-Object -First 1
        if ($found) {
            return $found.FullName
        }
    }

    return $null
}

function Get-ProfileSummary {
    param([string]$ProfilePath)
    if (-not (Test-Path -LiteralPath $ProfilePath -PathType Leaf)) {
        return [ordered]@{
            schemaVersion = 1
            profileCount = 0
            categoryCounts = [ordered]@{}
        }
    }

    $document = Get-Content -Raw -LiteralPath $ProfilePath | ConvertFrom-Json
    $profiles = @($document.profiles.PSObject.Properties | ForEach-Object { $_.Value })
    $categoryCounts = [ordered]@{}
    foreach ($profile in $profiles) {
        $category = [string]$profile.motionCategory
        if ([string]::IsNullOrWhiteSpace($category)) {
            $category = "unknown"
        }
        if (-not $categoryCounts.Contains($category)) {
            $categoryCounts[$category] = 0
        }
        $categoryCounts[$category] += 1
    }

    return [ordered]@{
        schemaVersion = 1
        profileCount = $profiles.Count
        categoryCounts = $categoryCounts
    }
}

if ([string]::IsNullOrWhiteSpace($Version) -or $Version -notmatch '^v\d+\.\d+\.\d+$') {
    Fail "Usage: build_release.bat vX.Y.Z"
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Resolve-Path -LiteralPath (Join-Path $ScriptDir '..')
Set-Location $Root

$VersionNumber = $Version.Substring(1)
$ReleaseRoot = Join-Path $Root "dist\releases\$Version"

if (Test-Path -LiteralPath $ReleaseRoot) {
    Fail "Release directory already exists: $ReleaseRoot"
}

Write-Step "Running verification"
$oldVerifyPhase = $env:ALICIA_RELEASE_VERIFY_PHASE
$env:ALICIA_RELEASE_VERIFY_PHASE = '1'
try {
    $tests = Get-ChildItem -LiteralPath (Join-Path $Root 'scratch') -Filter 'test_*.mjs' | Sort-Object Name
    foreach ($test in $tests) {
        Write-Step "node $($test.FullName)"
        Run-Command -FilePath 'node' -Arguments @($test.FullName)
    }
    Run-Command -FilePath 'python' -Arguments @('.\scratch\test_motion_profile_api.py')
    Run-Command -FilePath 'python' -Arguments @('-m', 'py_compile', '.\server.py')
    Run-Command -FilePath 'git' -Arguments @('diff', '--check')
    Run-Command -FilePath 'git' -Arguments @('diff', '--cached', '--check')
}
finally {
    if ($null -eq $oldVerifyPhase) {
        Remove-Item Env:\ALICIA_RELEASE_VERIFY_PHASE -ErrorAction SilentlyContinue
    } else {
        $env:ALICIA_RELEASE_VERIFY_PHASE = $oldVerifyPhase
    }
}

Write-Step "Creating $ReleaseRoot"
Ensure-Dir $ReleaseRoot
foreach ($dir in @('js', 'js\vendor', 'models', 'motions', 'motions\poses', 'motions\showcase', 'manifests', 'skills', 'examples', 'docs')) {
    Ensure-Dir (Join-Path $ReleaseRoot $dir)
}

$assets = [System.Collections.Generic.List[object]]::new()

$runtimeFiles = @(
    'ActingBridge.js',
    'ActingPolicy.js',
    'ActionQueue.js',
    'ConversationMemory.js',
    'DomContext.js',
    'ExpressionController.js',
    'ExpressionProfiles.js',
    'LookAtController.js',
    'MascotStateMachine.js',
    'MotionClips.js',
    'MotionController.js',
    'PolicyGate.js',
    'PoseDirector.js',
    'SemanticMotionPicker.js',
    'SpatialContext.js',
    'ToolRegistry.js',
    'VrmMascot.js'
)

foreach ($file in $runtimeFiles) {
    $source = Join-Path $Root "js\$file"
    $dest = Join-Path $ReleaseRoot "js\$file"
    Copy-FileToRelease -Source $source -Destination $dest
    Add-Asset -Assets $assets -Path "js/$file" -Type 'js' -LicenseStatus 'project' -Distributable $true -Source 'my_vrm_mascot'
}

foreach ($file in @('three.min.js', 'three-vrm.min.js', 'GLTFLoader.js', 'OrbitControls.js')) {
    $source = Join-Path $Root "vendor\$file"
    $dest = Join-Path $ReleaseRoot "js\vendor\$file"
    Copy-FileToRelease -Source $source -Destination $dest
    Add-Asset -Assets $assets -Path "js/vendor/$file" -Type 'vendor_js' -LicenseStatus 'approved' -Distributable $true -Source 'vendored-runtime'
}

foreach ($file in @('default.json', 'alicia_solid.json')) {
    $source = Join-Path $Root "motions\poses\$file"
    $dest = Join-Path $ReleaseRoot "motions\poses\$file"
    Copy-FileToRelease -Source $source -Destination $dest
    Add-Asset -Assets $assets -Path "motions/poses/$file" -Type 'pose_preset' -LicenseStatus 'project' -Distributable $true -Source 'my_vrm_mascot'
}

$smokeDance = Join-Path $Root 'motions\smoke_dance.json'
if (Test-Path -LiteralPath $smokeDance -PathType Leaf) {
    Copy-FileToRelease -Source $smokeDance -Destination (Join-Path $ReleaseRoot 'motions\smoke_dance.json')
    Add-Asset -Assets $assets -Path 'motions/smoke_dance.json' -Type 'motion_json' -LicenseStatus 'project' -Distributable $true -Source 'my_vrm_mascot'
}

$modelPath = Join-Path $Root 'models\mascot.vrm'
if (Test-Path -LiteralPath $modelPath -PathType Leaf) {
    Copy-FileToRelease -Source $modelPath -Destination (Join-Path $ReleaseRoot 'models\mascot.vrm')
    Add-Asset -Assets $assets -Path 'models/mascot.vrm' -Type 'vrm' -LicenseStatus 'approved' -Distributable $true -Source 'local-approved'
}

$approvedVrmaNames = @(
    'Angry.vrma',
    'Blush.vrma',
    'Clapping.vrma',
    'Goodbye.vrma',
    'Jump.vrma',
    'LookAround.vrma',
    'Relax.vrma',
    'Sad.vrma',
    'Sleepy.vrma',
    'Surprised.vrma',
    'Thinking.vrma'
)

foreach ($name in $approvedVrmaNames) {
    $source = Find-VrmaAssetSource -Name $name
    if ($source) {
        Copy-FileToRelease -Source $source -Destination (Join-Path $ReleaseRoot "motions\$name")
        Add-Asset -Assets $assets -Path "motions/$name" -Type 'vrma' -LicenseStatus 'approved' -Distributable $true -Source 'tk256ailab/vrm-viewer'
    }
}

$showcasePackPath = Join-Path $Root 'examples\m6_7_vrma_samples\review\showcase_motion_pack.json'
$showcaseEventsPath = Join-Path $Root 'examples\m6_7_vrma_samples\review\showcase_events.json'
if (Test-Path -LiteralPath $showcasePackPath -PathType Leaf) {
    Copy-FileToRelease -Source $showcasePackPath -Destination (Join-Path $ReleaseRoot 'manifests\showcase_motion_pack.json')
    $showcasePack = Get-Content -Raw -LiteralPath $showcasePackPath | ConvertFrom-Json
    foreach ($motion in @($showcasePack.motions)) {
        $sourceMotion = [string]$motion.sourceMotion
        $releasePath = [string]$motion.releasePath
        if ([string]::IsNullOrWhiteSpace($sourceMotion) -or [string]::IsNullOrWhiteSpace($releasePath)) {
            continue
        }
        $source = Find-VrmaAssetSource -Name $sourceMotion
        if (-not $source) {
            Fail "Missing showcase VRMA source: $sourceMotion"
        }
        Copy-FileToRelease -Source $source -Destination (Join-Path $ReleaseRoot $releasePath.Replace('/', '\'))
        Add-Asset `
            -Assets $assets `
            -Path $releasePath `
            -Type 'vrma' `
            -LicenseStatus ([string]$motion.licenseStatus) `
            -Distributable ([bool]$motion.distributable) `
            -Source ([string]$motion.sourceProvider)
    }
}
if (Test-Path -LiteralPath $showcaseEventsPath -PathType Leaf) {
    Copy-FileToRelease -Source $showcaseEventsPath -Destination (Join-Path $ReleaseRoot 'manifests\showcase_events.json')
}

Copy-FileToRelease `
    -Source (Join-Path $Root 'examples\m6_7_vrma_samples\review\semantic_motion_library.json') `
    -Destination (Join-Path $ReleaseRoot 'manifests\semantic_motion_library.json')
Copy-FileToRelease `
    -Source (Join-Path $Root 'examples\m6_7_vrma_samples\review\semantic_motion_registry.json') `
    -Destination (Join-Path $ReleaseRoot 'manifests\semantic_motion_registry.json')

$profileSummary = Get-ProfileSummary -ProfilePath (Join-Path $Root 'examples\m6_7_vrma_samples\review\motion_profiles.json')
ConvertTo-JsonFile -Path (Join-Path $ReleaseRoot 'manifests\motion_profiles.summary.json') -Value $profileSummary

$sourceManifest = [ordered]@{
    schemaVersion = 1
    sources = @(
        [ordered]@{
            name = 'my_vrm_mascot'
            type = 'project'
            url = 'https://github.com/shadowjohn/my_vrm_mascot'
            licenseStatus = 'project'
        },
        [ordered]@{
            name = 'tk256ailab/vrm-viewer VRMA'
            type = 'third_party_motion'
            url = 'https://github.com/tk256ailab/vrm-viewer/tree/main/VRMA'
            licenseStatus = 'approved'
            note = 'README records MIT license. Only approved demo VRMA files are copied.'
        },
        [ordered]@{
            name = 'Alicia local motion mining corpus'
            type = 'local_research_motion'
            url = 'local_assets/vrma'
            licenseStatus = 'research_preview'
            note = 'Curated showcase motions may be copied for local/showcase evaluation. Verify upstream license before broad redistribution.'
        }
    )
}
ConvertTo-JsonFile -Path (Join-Path $ReleaseRoot 'manifests\source_manifest.json') -Value $sourceManifest

$demoPage = Join-Path $Root 'demo.php'
if (Test-Path -LiteralPath $demoPage -PathType Leaf) {
    Copy-FileToRelease -Source $demoPage -Destination (Join-Path $ReleaseRoot 'demo.php')
    Add-Asset -Assets $assets -Path 'demo.php' -Type 'demo_page' -LicenseStatus 'project' -Distributable $true -Source 'my_vrm_mascot'
}

$runtimeEntry = @'
import { VrmMascot } from './js/VrmMascot.js';

export { VrmMascot };

export async function createAliciaMascot(container, options = {}) {
  const mascot = new VrmMascot(container, options);
  const modelUrl = options.modelUrl === undefined ? './models/mascot.vrm' : options.modelUrl;
  if (modelUrl) {
    await mascot.load(modelUrl);
  }
  return mascot;
}

if (typeof window !== 'undefined') {
  window.AliciaRuntime = {
    VrmMascot,
    createAliciaMascot,
  };
}
'@
Write-Utf8NoBom -Path (Join-Path $ReleaseRoot 'alicia-runtime.js') -Content ($runtimeEntry + "`n")
Add-Asset -Assets $assets -Path 'alicia-runtime.js' -Type 'runtime_entry' -LicenseStatus 'project' -Distributable $true -Source 'my_vrm_mascot'

$skillSchema = [ordered]@{
    '$schema' = 'https://json-schema.org/draft/2020-12/schema'
    title = 'Alicia Skill Bridge Action'
    type = 'object'
    required = @('intent', 'source')
    properties = [ordered]@{
        intent = [ordered]@{ type = 'string'; minLength = 1 }
        source = [ordered]@{ type = 'string'; minLength = 1 }
        message = [ordered]@{ type = 'string' }
        emotion = [ordered]@{ type = 'string' }
        semanticMotionId = [ordered]@{ type = 'string' }
        priority = [ordered]@{ type = 'string'; enum = @('low', 'normal', 'high'); default = 'normal' }
        trace = [ordered]@{ type = 'object'; additionalProperties = $true }
    }
    additionalProperties = $false
}
ConvertTo-JsonFile -Path (Join-Path $ReleaseRoot 'skills\alicia-skill-bridge.schema.json') -Value $skillSchema

$skillDoc = @'
# Alicia Skill

Alicia Runtime accepts high-level actions through the Alicia Skill Bridge schema.

Required fields:

- `intent`
- `source`

Optional fields:

- `message`
- `emotion`
- `semanticMotionId`
- `priority`
- `trace`

Projects should send actions through their adapter layer rather than modifying Alicia core.
'@
Write-Utf8NoBom -Path (Join-Path $ReleaseRoot 'skills\alicia-skill.md') -Content ($skillDoc + "`n")

$skillExamples = @'
# Alicia Skill Examples

```json
{
  "intent": "thinking",
  "emotion": "focused",
  "semanticMotionId": "thinking_chin",
  "message": "正在分析資料",
  "source": "codex",
  "priority": "normal",
  "trace": {
    "task": "runtime_binding"
  }
}
```
'@
Write-Utf8NoBom -Path (Join-Path $ReleaseRoot 'skills\alicia-skill.examples.md') -Content ($skillExamples + "`n")

$adapterExample = @'
export function createStepThreeAdapter(alicia) {
  return {
    onStepStart(stepName) {
      alicia?.performIntent?.({
        intent: 'thinking',
        text: `正在處理 ${stepName}`,
        source: 'step_three_adapter',
      });
    },
    onStepDone(stepName) {
      alicia?.performIntent?.({
        intent: 'success',
        text: `${stepName} 完成`,
        source: 'step_three_adapter',
      });
    },
  };
}
'@
Write-Utf8NoBom -Path (Join-Path $ReleaseRoot 'examples\step_threejs_adapter.example.js') -Content ($adapterExample + "`n")

$basicEmbed = @'
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <title>Alicia Runtime Basic Embed</title>
  <style>
    html, body, #alicia-stage { width: 100%; height: 100%; margin: 0; background: #111827; }
  </style>
</head>
<body>
  <div id="alicia-stage"></div>
  <script src="../js/vendor/three.min.js"></script>
  <script src="../js/vendor/GLTFLoader.js"></script>
  <script src="../js/vendor/OrbitControls.js"></script>
  <script src="../js/vendor/three-vrm.min.js"></script>
  <script type="module">
    import { createAliciaMascot } from '../alicia-runtime.js';
    const mascot = await createAliciaMascot(document.getElementById('alicia-stage'));
    mascot.performIntent({ intent: 'greeting', source: 'basic_embed' });
  </script>
</body>
</html>
'@
Write-Utf8NoBom -Path (Join-Path $ReleaseRoot 'examples\basic_embed.html') -Content ($basicEmbed + "`n")

$usage = @'
# Alicia Runtime Usage

Reference the stable runtime entry from your deployed `current` path:

```html
<script type="module" src="/assets/alicia/current/alicia-runtime.js"></script>
```

Host projects should configure behavior through an adapter and keep Alicia core files unchanged.
'@
Write-Utf8NoBom -Path (Join-Path $ReleaseRoot 'docs\usage.md') -Content ($usage + "`n")

$releaseNotes = @'
# Alicia Runtime {{version}}

- Ships Alicia Runtime entrypoint.
- Includes approved runtime JS, manifests, skill schema, docs, and adapter examples.
- Includes a curated Alicia Showcase Pack generated from the local motion mining corpus.
- Keeps Motion Mine, tests, scratch files, and local assets out of the release package.
'@.Replace('{{version}}', $Version)
Write-Utf8NoBom -Path (Join-Path $ReleaseRoot 'docs\release-notes.md') -Content ($releaseNotes + "`n")

$assetPolicy = @'
# Alicia Runtime Asset Policy

Release packages include only approved distributable assets.

General local mining assets are not copied directly. The release builder may copy the curated Showcase Pack into `motions/showcase/`; those files keep their explicit `licenseStatus` and `distributable` flags in `manifests/asset_manifest.json`.
'@
Write-Utf8NoBom -Path (Join-Path $ReleaseRoot 'docs\asset-policy.md') -Content ($assetPolicy + "`n")

$readme = @'
# Alicia Runtime {{version}}

Entry:

```text
alicia-runtime.js
```

See:

- `docs/usage.md`
- `docs/asset-policy.md`
- `skills/alicia-skill.md`
- `examples/basic_embed.html`
'@.Replace('{{version}}', $Version)
Write-Utf8NoBom -Path (Join-Path $ReleaseRoot 'README.md') -Content ($readme + "`n")

$containsThirdPartyAssets = @($assets | Where-Object { $_.source -notin @('my_vrm_mascot', 'local-approved') }).Count -gt 0
ConvertTo-JsonFile -Path (Join-Path $ReleaseRoot 'manifests\asset_manifest.json') -Value ([ordered]@{
    schemaVersion = 1
    assets = @($assets)
})

$releaseJson = [ordered]@{
    name = 'Alicia Runtime'
    version = $VersionNumber
    entry = 'alicia-runtime.js'
    usage = 'docs/usage.md'
    skill = 'skills/alicia-skill.md'
    skillSchema = 'skills/alicia-skill-bridge.schema.json'
    examples = @(
        'examples/basic_embed.html',
        'examples/step_threejs_adapter.example.js'
    )
    builtAt = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
    sourceRepo = 'https://github.com/shadowjohn/my_vrm_mascot'
    containsThirdPartyAssets = $containsThirdPartyAssets
    assetPolicy = 'docs/asset-policy.md'
}
ConvertTo-JsonFile -Path (Join-Path $ReleaseRoot 'release.json') -Value $releaseJson

Write-Step "Built $ReleaseRoot"
Write-Step "Deploy by copying this version directory to the approved host release root, then update current after smoke testing."
