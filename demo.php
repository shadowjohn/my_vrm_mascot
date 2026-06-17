<?php
declare(strict_types=1);

function alicia_read_json(string $path): array
{
    if (!is_file($path)) {
        return [
            'ok' => false,
            'data' => null,
            'error' => 'file_missing',
        ];
    }

    $raw = file_get_contents($path);
    if ($raw === false) {
        return [
            'ok' => false,
            'data' => null,
            'error' => 'read_failed',
        ];
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return [
            'ok' => false,
            'data' => null,
            'error' => 'invalid_json',
        ];
    }

    return [
        'ok' => true,
        'data' => $data,
        'error' => null,
    ];
}

function h(mixed $value): string
{
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

$root = __DIR__;
$releaseJson = alicia_read_json($root . '/release.json');
$assetManifest = alicia_read_json($root . '/manifests/asset_manifest.json');
$semanticMotionLibrary = alicia_read_json($root . '/manifests/semantic_motion_library.json');
$showcaseMotionPack = alicia_read_json($root . '/manifests/showcase_motion_pack.json');
$showcaseEventsJson = alicia_read_json($root . '/manifests/showcase_events.json');
$skillSchema = alicia_read_json($root . '/skills/alicia-skill-bridge.schema.json');

$release = is_array($releaseJson['data']) ? $releaseJson['data'] : [];
$assets = is_array($assetManifest['data']['assets'] ?? null) ? $assetManifest['data']['assets'] : [];
$semanticMotions = is_array($semanticMotionLibrary['data']['motions'] ?? null)
    ? $semanticMotionLibrary['data']['motions']
    : [];
$showcaseMotions = is_array($showcaseMotionPack['data']['motions'] ?? null)
    ? $showcaseMotionPack['data']['motions']
    : [];
$showcaseEvents = is_array($showcaseEventsJson['data']['events'] ?? null)
    ? $showcaseEventsJson['data']['events']
    : [];
$schemaRequired = is_array($skillSchema['data']['required'] ?? null) ? $skillSchema['data']['required'] : [];
$motionAssets = array_values(array_filter($assets, static function (array $asset): bool {
    $path = (string)($asset['path'] ?? '');
    $type = (string)($asset['type'] ?? '');
    return str_starts_with($path, 'motions/')
        && in_array($type, ['vrma', 'motion_json'], true);
}));
$motionCatalog = array_values(array_map(static function (array $motion): array {
    return [
        'id' => (string)($motion['id'] ?? ''),
        'category' => (string)($motion['category'] ?? ''),
        'displayName' => (string)($motion['displayName'] ?? ''),
        'runtimeReady' => (bool)($motion['runtimeReady'] ?? false),
        'intentTags' => is_array($motion['intentTags'] ?? null) ? array_values($motion['intentTags']) : [],
    ];
}, $semanticMotions));
$runtimeReadyMotionCount = count(array_filter(
    $motionCatalog,
    static fn (array $motion): bool => (bool)($motion['runtimeReady'] ?? false)
));

$runtimeFileOk = is_file($root . '/alicia-runtime.js');
$modelFileOk = is_file($root . '/models/mascot.vrm');
$skillSchemaOk = $skillSchema['ok']
    && in_array('intent', $schemaRequired, true)
    && in_array('source', $schemaRequired, true);

$serverChecks = [
    'Runtime Entry' => $runtimeFileOk,
    'Mascot VRM' => $modelFileOk,
    'Release JSON' => $releaseJson['ok'],
    'Asset Manifest' => $assetManifest['ok'],
    'Semantic Motions' => $semanticMotionLibrary['ok'],
    'Showcase Pack' => $showcaseMotionPack['ok'] && $showcaseEventsJson['ok'],
    'Skill Schema' => $skillSchemaOk,
];
?>
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Alicia Scene Playground v<?= h($release['version'] ?? 'unknown') ?></title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #10131a;
      --panel: #181d27;
      --panel-2: #202735;
      --line: #30394a;
      --text: #eef2f8;
      --muted: #9ba7b8;
      --ok: #46d483;
      --warn: #f4bd50;
      --fail: #ff6b7a;
      --accent: #63b3ff;
      --accent-2: #8fd17c;
      --hot: #ff7a7a;
      --glass: rgba(16, 19, 26, 0.72);
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      width: 100%;
      min-height: 100%;
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }

    body {
      display: grid;
      grid-template-columns: minmax(360px, 1fr) minmax(320px, 420px);
      min-height: 100vh;
    }

    @media (min-width: 861px) {
      html,
      body {
        height: 100%;
        overflow: hidden;
      }

      #alicia-stage {
        height: 100vh;
      }
    }

    #alicia-stage {
      position: relative;
      min-height: 100vh;
      background: #0e1525;
      overflow: hidden;
    }

    #alicia-stage canvas {
      display: block;
    }

    #alicia-stage > canvas:not(.prop-canvas) {
      position: absolute;
      inset: 0;
      z-index: 1;
    }

    .prop-canvas {
      position: absolute;
      inset: 0;
      z-index: 3;
      width: 100% !important;
      height: 100% !important;
      pointer-events: none;
    }

    .floor-foreground {
      position: absolute;
      left: -8%;
      right: -8%;
      bottom: -4%;
      z-index: 4;
      height: 24%;
      pointer-events: none;
      background:
        linear-gradient(180deg, rgba(14, 21, 37, 0), rgba(14, 21, 37, 0.34) 48%, rgba(14, 21, 37, 0.74)),
        repeating-linear-gradient(90deg, rgba(174, 216, 255, 0.035) 0 1px, transparent 1px 82px);
      transform: perspective(900px) rotateX(58deg);
      transform-origin: center bottom;
      opacity: 0.82;
    }

    .toy-room {
      position: absolute;
      inset: 0;
      z-index: 2;
      pointer-events: none;
      overflow: hidden;
      perspective: 900px;
    }

    #alicia-stage[data-scene-mode="shared"] .toy-room-back-wall,
    #alicia-stage[data-scene-mode="shared"] .toy-room-floor,
    #alicia-stage[data-scene-mode="shared"] .room-path {
      opacity: 0.08;
    }

    #alicia-stage[data-scene-mode="shared"] .floor-foreground {
      height: 18%;
      opacity: 0.36;
    }

    #alicia-stage[data-scene-mode="shared"] .toy-card {
      width: auto;
      min-width: 76px;
      padding: 4px 6px;
      border-color: rgba(174, 216, 255, 0.08);
      background: rgba(14, 21, 37, 0.16);
      box-shadow: none;
      backdrop-filter: none;
      opacity: 0.22;
      transform: translateY(0) scale(0.86);
    }

    #alicia-stage[data-scene-mode="shared"] .toy-card small,
    #alicia-stage[data-scene-mode="shared"] .toy-card .chip {
      display: none;
    }

    #alicia-stage[data-scene-mode="shared"] .toy-card[data-active="true"] {
      border-color: rgba(99, 179, 255, 0.42);
      background: rgba(16, 28, 44, 0.28);
      opacity: 0.58;
      transform: translateY(-2px) scale(0.9);
    }

    .toy-room-back-wall {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 39%;
      height: 28%;
      border-bottom: 1px solid rgba(190, 220, 255, 0.18);
      background:
        linear-gradient(180deg, rgba(99, 179, 255, 0.04), rgba(16, 22, 34, 0)),
        repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 92px);
      opacity: 0.82;
    }

    .toy-room-floor {
      position: absolute;
      left: -14%;
      right: -14%;
      bottom: -17%;
      height: 52%;
      transform-origin: center bottom;
      transform: rotateX(64deg);
      border-top: 1px solid rgba(190, 220, 255, 0.16);
      background:
        radial-gradient(ellipse at center, rgba(99, 179, 255, 0.12), rgba(99, 179, 255, 0) 62%),
        repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.045) 0 1px, transparent 1px 42px),
        repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 74px);
    }

    .room-path {
      position: absolute;
      left: 15%;
      right: 15%;
      bottom: 10%;
      height: 33%;
      border: 1px dashed rgba(174, 216, 255, 0.24);
      border-radius: 50%;
      transform: rotateX(58deg);
      transform-origin: center bottom;
      opacity: 0.66;
    }

    .alicia-shadow {
      position: absolute;
      left: 50%;
      bottom: 13%;
      width: 190px;
      height: 52px;
      border-radius: 50%;
      background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.34), rgba(0, 0, 0, 0));
      transform: translate(-50%, 0);
      transition: transform 1150ms cubic-bezier(.2,.82,.22,1), opacity 180ms ease;
      opacity: 0.72;
    }

    .footprint-layer {
      position: absolute;
      inset: 0;
    }

    .footprint {
      position: absolute;
      width: 28px;
      height: 10px;
      border-radius: 50%;
      background: rgba(174, 216, 255, 0.2);
      transform: translate(-50%, -50%) rotate(var(--rot, 0deg));
      animation: footprint-fade 2600ms ease forwards;
    }

    @keyframes footprint-fade {
      0% { opacity: 0.78; }
      55% { opacity: 0.42; }
      100% { opacity: 0; }
    }

    .scene-hud {
      position: absolute;
      top: 18px;
      left: 18px;
      z-index: 4;
      display: grid;
      gap: 8px;
      max-width: min(360px, calc(100% - 36px));
      pointer-events: none;
    }

    .scene-title {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      padding: 8px 10px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      background: var(--glass);
      color: #eaf3ff;
      font-size: 13px;
      font-weight: 800;
      backdrop-filter: blur(10px);
    }

    .story-beat {
      width: fit-content;
      max-width: 100%;
      padding: 7px 9px;
      border: 1px solid rgba(143, 209, 124, 0.24);
      border-radius: 8px;
      background: rgba(19, 36, 28, 0.78);
      color: #cdecc8;
      font-size: 12px;
      font-weight: 800;
      backdrop-filter: blur(10px);
    }

    .scene-directive {
      width: fit-content;
      max-width: 100%;
      padding: 8px 10px;
      border: 1px solid rgba(99, 179, 255, 0.22);
      border-radius: 8px;
      background: rgba(20, 31, 48, 0.82);
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
      backdrop-filter: blur(10px);
    }

    .toy-card {
      position: absolute;
      z-index: 5;
      width: 132px;
      padding: 7px 8px;
      border: 1px solid rgba(174, 216, 255, 0.16);
      border-radius: 8px;
      background: rgba(14, 21, 37, 0.58);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
      backdrop-filter: blur(10px);
      cursor: pointer;
      opacity: 0.7;
      transform: perspective(560px) rotateX(54deg) scale(0.94);
      transform-origin: center bottom;
      transition: border-color 160ms ease, background 160ms ease, transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
    }

    .toy-card:hover,
    .toy-card[data-active="true"] {
      border-color: rgba(99, 179, 255, 0.7);
      background: rgba(31, 43, 64, 0.72);
      opacity: 0.94;
      transform: perspective(560px) rotateX(48deg) translateY(-3px) scale(1);
      box-shadow: 0 16px 42px rgba(0, 0, 0, 0.34), 0 0 28px rgba(99, 179, 255, 0.13);
    }

    .toy-card[data-tone="hot"][data-active="true"] {
      border-color: rgba(255, 122, 122, 0.74);
      box-shadow: 0 16px 42px rgba(0, 0, 0, 0.34), 0 0 30px rgba(255, 122, 122, 0.16);
    }

    .toy-card strong {
      display: block;
      color: var(--text);
      font-size: 12px;
      line-height: 1.3;
    }

    .toy-card small {
      display: block;
      margin-top: 4px;
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 10px;
      line-height: 1.35;
    }

    .toy-card .chip {
      display: inline-flex;
      margin-top: 8px;
      padding: 3px 7px;
      border-radius: 999px;
      background: rgba(70, 212, 131, 0.14);
      color: var(--ok);
      font-size: 11px;
      font-weight: 800;
    }

    .toy-card[data-tone="hot"] .chip {
      background: rgba(255, 122, 122, 0.14);
      color: var(--hot);
    }

    .toy-card.release {
      bottom: 90px;
      left: 64px;
    }

    .toy-card.assets {
      bottom: 90px;
      right: 76px;
    }

    .toy-card.motion {
      bottom: 206px;
      left: 172px;
    }

    .toy-card.target {
      bottom: 206px;
      right: 126px;
    }

    .toy-card.cake {
      bottom: 310px;
      left: 50%;
      transform: translateX(-50%);
    }

    .patrol-marker {
      position: absolute;
      z-index: 3;
      left: 50%;
      bottom: 26%;
      width: 150px;
      height: 46px;
      border: 1px solid rgba(99, 179, 255, 0.22);
      border-radius: 50%;
      background: radial-gradient(ellipse at center, rgba(99, 179, 255, 0.16), rgba(99, 179, 255, 0));
      transform: translate(-50%, 0);
      transition: left 520ms ease, bottom 520ms ease, border-color 180ms ease;
      pointer-events: none;
    }

    .patrol-marker[data-tone="hot"] {
      border-color: rgba(255, 122, 122, 0.34);
      background: radial-gradient(ellipse at center, rgba(255, 122, 122, 0.16), rgba(255, 122, 122, 0));
    }

    #speech-bubble {
      position: absolute;
      top: clamp(72px, 18vh, 150px);
      left: 50%;
      width: max-content;
      max-width: min(420px, calc(100% - 48px));
      padding: 14px 18px;
      border: 2px solid #1b2430;
      border-radius: 24px;
      background: #fffdf8;
      color: #1b2430;
      font-size: 16px;
      font-weight: 650;
      line-height: 1.45;
      text-align: center;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.3);
      opacity: 0;
      transform: translate(-50%, -10px) scale(0.98);
      transform-origin: 50% calc(100% + 18px);
      transition: opacity 180ms ease, transform 180ms ease;
      pointer-events: none;
      z-index: 7;
    }

    #speech-bubble::after {
      content: "";
      position: absolute;
      left: 50%;
      bottom: -10px;
      width: 18px;
      height: 18px;
      border-right: 2px solid #1b2430;
      border-bottom: 2px solid #1b2430;
      background: #fffdf8;
      transform: translateX(-50%) rotate(45deg);
      transform-origin: center;
    }

    #speech-bubble[data-visible="true"] {
      opacity: 1;
      transform: translate(-50%, 0) scale(1);
    }

    .side {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-height: 100vh;
      padding: 18px;
      background: #141922;
      border-left: 1px solid var(--line);
      overflow-y: auto;
    }

    .title {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 4px;
    }

    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
    }

    .version {
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 12px;
      white-space: nowrap;
    }

    .panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      overflow: hidden;
    }

    .panel h2 {
      margin: 0;
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      background: var(--panel-2);
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      color: #d8e2f0;
    }

    .rows {
      display: grid;
    }

    .row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: center;
      min-height: 40px;
      padding: 9px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      color: var(--muted);
      font-size: 14px;
    }

    .row:last-child {
      border-bottom: 0;
    }

    .value {
      color: var(--text);
      text-align: right;
      overflow-wrap: anywhere;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      min-width: 72px;
      justify-content: center;
      padding: 4px 8px;
      border-radius: 999px;
      background: rgba(244, 189, 80, 0.16);
      color: var(--warn);
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 12px;
      font-weight: 700;
    }

    .badge[data-state="ok"] {
      background: rgba(70, 212, 131, 0.15);
      color: var(--ok);
    }

    .badge[data-state="fail"] {
      background: rgba(255, 107, 122, 0.16);
      color: var(--fail);
    }

    .actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      padding: 14px;
    }

    button {
      min-height: 42px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      background: #253044;
      color: var(--text);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
    }

    button:hover:not(:disabled) {
      background: #2d3a52;
      border-color: rgba(99, 179, 255, 0.52);
      transform: translateY(-1px);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }

    .primary {
      background: #264969;
    }

    .success {
      background: #285138;
    }

    .warning {
      background: #594321;
    }

    .director-status {
      display: grid;
      gap: 8px;
      padding: 14px;
    }

    .director-focus {
      min-height: 48px;
      padding: 10px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.035);
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
    }

    .motion-showcase {
      display: grid;
      gap: 10px;
      padding: 14px;
    }

    .motion-meter {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }

    .motion-stat {
      min-width: 0;
      padding: 9px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.035);
    }

    .motion-stat span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.3;
    }

    .motion-stat strong {
      display: block;
      margin-top: 3px;
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 15px;
      overflow-wrap: anywhere;
    }

    .motion-active {
      min-height: 58px;
      padding: 10px;
      border: 1px solid rgba(99, 179, 255, 0.18);
      border-radius: 8px;
      background: rgba(99, 179, 255, 0.07);
      color: #dcecff;
      font-size: 13px;
      line-height: 1.45;
    }

    .motion-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      max-height: 104px;
      overflow: auto;
      padding-right: 2px;
    }

    .motion-pill {
      min-height: 0;
      padding: 6px 8px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.055);
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 11px;
      line-height: 1.2;
      white-space: nowrap;
    }

    .motion-pill[data-ready="true"] {
      color: #dff7e8;
      border-color: rgba(70, 212, 131, 0.28);
      background: rgba(70, 212, 131, 0.1);
    }

    .motion-pill[data-active="true"] {
      color: #eaf3ff;
      border-color: rgba(99, 179, 255, 0.68);
      background: rgba(99, 179, 255, 0.18);
    }

    .log {
      min-height: 90px;
      max-height: 170px;
      overflow: auto;
      padding: 12px 14px;
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
    }

    @media (max-width: 860px) {
      body {
        grid-template-columns: 1fr;
      }

      #alicia-stage {
        min-height: 58vh;
      }

      .scene-hud {
        top: 12px;
        left: 12px;
      }

      .scene-directive {
        display: none;
      }

      .toy-card {
        width: 146px;
        padding: 8px;
      }

      .toy-card.release {
        top: 72px;
        left: 12px;
      }

      .toy-card.assets {
        top: 72px;
        right: 12px;
      }

      .toy-card.motion {
        display: none;
      }

      .toy-card.target {
        bottom: 72px;
        right: 12px;
      }

      #speech-bubble {
        top: clamp(54px, 13vh, 88px);
        max-width: min(320px, calc(100% - 28px));
        padding: 12px 15px;
        font-size: 14px;
        border-radius: 22px;
      }

      .side {
        min-height: auto;
        border-left: 0;
        border-top: 1px solid var(--line);
      }

      .motion-meter {
        grid-template-columns: 1fr;
      }
    }
  </style>
  <script>
    window.__aliciaConsoleErrors = [];
    (function () {
      const originalError = console.error.bind(console);
      const record = function (message) {
        window.__aliciaConsoleErrors.push(String(message || 'Unknown console error'));
        document.dispatchEvent(new CustomEvent('alicia-console-error'));
      };

      console.error = function (...args) {
        record(args.map(String).join(' '));
        originalError(...args);
      };

      window.addEventListener('error', function (event) {
        const target = event.target;
        const src = target && (target.src || target.href);
        record(event.message || (src ? 'Resource failed: ' + src : 'Window error'));
      }, true);

      window.addEventListener('unhandledrejection', function (event) {
        const reason = event.reason;
        record(reason && reason.message ? reason.message : reason);
      });
    })();
  </script>
</head>
<body>
  <main id="alicia-stage" aria-label="Alicia runtime viewport">
    <div class="toy-room" aria-hidden="true">
      <div class="toy-room-back-wall"></div>
      <div class="toy-room-floor"></div>
      <div class="room-path"></div>
      <div class="footprint-layer" data-footprint-layer></div>
      <div class="alicia-shadow" data-alicia-shadow></div>
    </div>
    <div class="floor-foreground" aria-hidden="true"></div>
    <div class="scene-hud">
      <div class="scene-title">Toy Room Mayhem</div>
      <div class="story-beat" data-story-beat>Chapter 0 / Alicia finds the toy room</div>
      <div class="scene-directive" data-scene-directive>Booting release sandbox...</div>
    </div>
    <button type="button" class="toy-card release" data-topic="release" data-prop="releaseCore">
      <strong>release.json</strong>
      <small>Version <?= h($release['version'] ?? 'unknown') ?><br><?= h($release['builtAt'] ?? 'unknown') ?></small>
      <span class="chip">OK</span>
    </button>
    <button type="button" class="toy-card assets" data-topic="assets" data-prop="assetCrate">
      <strong>asset_manifest</strong>
      <small><?= h(count($assets)) ?> shipped assets<br>runtime package scan</small>
      <span class="chip">OK</span>
    </button>
    <button type="button" class="toy-card motion" data-topic="motion" data-prop="motionOrb">
      <strong>motion registry</strong>
      <small>semantic motion hints<br>future scene verbs</small>
      <span class="chip">READY</span>
    </button>
    <button type="button" class="toy-card target" data-topic="target" data-prop="warningTarget" data-tone="hot">
      <strong>test target</strong>
      <small>inspect / warn / bonk<br>interaction dummy</small>
      <span class="chip">LIVE</span>
    </button>
    <button type="button" class="toy-card cake" data-topic="cake" data-prop="birthdayCake">
      <strong>birthday cake</strong>
      <small>thinking / gesture / success<br>celebration prop</small>
      <span class="chip">LIVE</span>
    </button>
    <div class="patrol-marker" data-patrol-marker></div>
    <div id="speech-bubble"></div>
  </main>

  <aside class="side">
    <header class="title">
      <h1>Alicia Scene Playground</h1>
      <span class="version">v<?= h($release['version'] ?? 'unknown') ?></span>
    </header>

    <section class="panel" aria-labelledby="runtime-info-title">
      <h2 id="runtime-info-title">Runtime Info</h2>
      <div class="rows">
        <div class="row">
          <span>Version</span>
          <strong class="value"><?= h($release['version'] ?? 'unknown') ?></strong>
        </div>
        <div class="row">
          <span>Build Date</span>
          <strong class="value"><?= h($release['builtAt'] ?? 'unknown') ?></strong>
        </div>
        <div class="row">
          <span>Asset Count</span>
          <strong class="value"><?= h(count($assets)) ?></strong>
        </div>
        <div class="row">
          <span>Motion Assets</span>
          <strong class="value"><?= h(count($motionAssets)) ?></strong>
        </div>
        <div class="row">
          <span>Semantic Families</span>
          <strong class="value"><?= h(count($motionCatalog)) ?></strong>
        </div>
        <div class="row">
          <span>Mined Events</span>
          <strong class="value"><?= h(count($showcaseEvents)) ?></strong>
        </div>
        <div class="row">
          <span>Skill Schema</span>
          <span class="badge" data-state="<?= $skillSchemaOk ? 'ok' : 'fail' ?>"><?= $skillSchemaOk ? 'OK' : 'FAIL' ?></span>
        </div>
      </div>
    </section>

    <section class="panel" aria-labelledby="server-check-title">
      <h2 id="server-check-title">Release Files</h2>
      <div class="rows">
        <?php foreach ($serverChecks as $label => $ok): ?>
          <div class="row">
            <span><?= h($label) ?></span>
            <span class="badge" data-state="<?= $ok ? 'ok' : 'fail' ?>"><?= $ok ? 'OK' : 'FAIL' ?></span>
          </div>
        <?php endforeach; ?>
      </div>
    </section>

    <section class="panel" aria-labelledby="browser-check-title">
      <h2 id="browser-check-title">Browser Checks</h2>
      <div class="rows">
        <div class="row">
          <span>Runtime Module</span>
          <span class="badge" data-check="runtime">WAIT</span>
        </div>
        <div class="row">
          <span>Mascot Model</span>
          <span class="badge" data-check="model">WAIT</span>
        </div>
        <div class="row">
          <span>Alicia Visible</span>
          <span class="badge" data-check="visible">WAIT</span>
        </div>
        <div class="row">
          <span>Director Events</span>
          <span class="badge" data-check="intent">WAIT</span>
        </div>
        <div class="row">
          <span>Console Errors</span>
          <span class="badge" data-check="console">OK</span>
        </div>
      </div>
    </section>

    <section class="panel" aria-labelledby="actions-title">
      <h2 id="actions-title">Director</h2>
      <div class="director-status">
        <div class="director-focus" data-director-focus>Waiting for Alicia...</div>
        <div class="actions">
          <button type="button" data-director-toggle disabled>Auto ON</button>
          <button type="button" data-director-trigger class="primary" disabled>Trigger Event</button>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.85em;color:#c4b5fd;">
            <input type="checkbox" data-tts-toggle style="accent-color:#a78bfa;width:16px;height:16px;cursor:pointer;"> 語音發聲 (TTS)
          </label>
        </div>
      </div>
    </section>

    <section class="panel" aria-labelledby="motion-showcase-title">
      <h2 id="motion-showcase-title">Motion Showcase</h2>
      <div class="motion-showcase">
        <div class="motion-meter">
          <div class="motion-stat">
            <span>Families</span>
            <strong data-motion-count><?= h(count($motionCatalog)) ?></strong>
          </div>
          <div class="motion-stat">
            <span>Ready</span>
            <strong data-motion-ready><?= h($runtimeReadyMotionCount) ?></strong>
          </div>
          <div class="motion-stat">
            <span>Assets</span>
            <strong data-motion-assets><?= h(count($motionAssets)) ?></strong>
          </div>
          <div class="motion-stat">
            <span>Mined</span>
            <strong data-motion-mined><?= h(count($showcaseEvents)) ?></strong>
          </div>
        </div>
        <div class="motion-active" data-motion-active>Waiting for motion event...</div>
        <div class="motion-pills" aria-label="Semantic motion families">
          <?php foreach ($motionCatalog as $motion): ?>
            <?php if (($motion['id'] ?? '') === '') continue; ?>
            <button
              type="button"
              class="motion-pill"
              data-motion-id="<?= h($motion['id']) ?>"
              data-ready="<?= ($motion['runtimeReady'] ?? false) ? 'true' : 'false' ?>"
              disabled
            ><?= h($motion['id']) ?></button>
          <?php endforeach; ?>
        </div>
      </div>
    </section>

    <section class="panel" aria-labelledby="state-title">
      <h2 id="state-title">State</h2>
      <div class="rows">
        <div class="row">
          <span>Current Intent</span>
          <strong class="value" data-field="currentIntent">idle</strong>
        </div>
        <div class="row">
          <span>Queue</span>
          <strong class="value" data-field="queueLength">0</strong>
        </div>
        <div class="row">
          <span>FPS</span>
          <strong class="value" data-field="fps">0</strong>
        </div>
      </div>
    </section>

    <section class="panel" aria-labelledby="console-title">
      <h2 id="console-title">Console</h2>
      <div class="log" data-log>Ready</div>
    </section>
  </aside>

  <script src="./js/vendor/three.min.js"></script>
  <script src="./js/vendor/GLTFLoader.js"></script>
  <script src="./js/vendor/OrbitControls.js"></script>
  <script src="./js/vendor/three-vrm.min.js"></script>
  <script type="module">
    import { AutoDirectorLite } from './js/AutoDirectorLite.js';
    const stage = document.getElementById('alicia-stage');
    const bubble = document.getElementById('speech-bubble');
    const toyCards = Array.from(document.querySelectorAll('[data-topic]'));
    const motionPills = Array.from(document.querySelectorAll('[data-motion-id]'));
    const directorToggle = document.querySelector('[data-director-toggle]');
    const directorTrigger = document.querySelector('[data-director-trigger]');
    const ttsToggle = document.querySelector('[data-tts-toggle]');
    const directorFocus = document.querySelector('[data-director-focus]');
    const sceneDirective = document.querySelector('[data-scene-directive]');
    const storyBeatEl = document.querySelector('[data-story-beat]');
    const patrolMarker = document.querySelector('[data-patrol-marker]');
    const motionActive = document.querySelector('[data-motion-active]');
    const logEl = document.querySelector('[data-log]');
    const field = (name) => document.querySelector(`[data-field="${name}"]`);
    const releaseStats = {
      version: <?= json_encode((string)($release['version'] ?? 'unknown'), JSON_UNESCAPED_SLASHES) ?>,
      builtAt: <?= json_encode((string)($release['builtAt'] ?? 'unknown'), JSON_UNESCAPED_SLASHES) ?>,
      assetCount: <?= json_encode(count($assets)) ?>,
      motionAssetCount: <?= json_encode(count($motionAssets)) ?>,
      semanticFamilyCount: <?= json_encode(count($motionCatalog)) ?>,
      runtimeReadyMotionCount: <?= json_encode($runtimeReadyMotionCount) ?>,
      showcaseMotionCount: <?= json_encode(count($showcaseMotions)) ?>,
      showcaseEventCount: <?= json_encode(count($showcaseEvents)) ?>,
    };
    const motionCatalog = <?= json_encode($motionCatalog, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;
    const showcaseEvents = <?= json_encode($showcaseEvents, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;
    const motionAssets = <?= json_encode(array_values(array_map(
        static fn (array $asset): string => (string)($asset['path'] ?? ''),
        $motionAssets
    )), JSON_UNESCAPED_SLASHES) ?>;
    const baseUrl = new URL('./', window.location.href);
    const query = new URLSearchParams(window.location.search);
    const noAutoDirector = query.has('noAuto') || query.has('manual');
    const urls = {
      model: new URL('models/mascot.vrm', baseUrl).href,
      semanticMotionLibrary: new URL('manifests/semantic_motion_library.json', baseUrl).href,
      showcaseEvents: new URL('manifests/showcase_events.json', baseUrl).href,
    };

    function setCheck(name, state, text) {
      const el = document.querySelector(`[data-check="${name}"]`);
      if (!el) return;
      el.dataset.state = state;
      el.textContent = text || state.toUpperCase();
    }

    function appendLog(message) {
      const now = new Date();
      const time = now.toLocaleTimeString('zh-TW', { hour12: false });
      const current = logEl.textContent === 'Ready' ? '' : logEl.textContent + '\n';
      logEl.textContent = current + `[${time}] ${message}`;
      logEl.scrollTop = logEl.scrollHeight;
    }

    function refreshConsoleStatus() {
      const errors = window.__aliciaConsoleErrors || [];
      if (errors.length > 0) {
        setCheck('console', 'fail', 'FAIL');
        logEl.textContent = errors.map((item, index) => `${index + 1}. ${item}`).join('\n');
      } else {
        setCheck('console', 'ok', 'OK');
      }
    }

    document.addEventListener('alicia-console-error', refreshConsoleStatus);

    function setBubble(text) {
      const value = String(text || '');
      bubble.textContent = value;
      bubble.dataset.visible = value ? 'true' : 'false';
    }

    function enableDirectorButtons(flag) {
      for (const button of [directorToggle, directorTrigger]) {
        if (!button) continue;
        button.disabled = !flag;
      }
    }

    function sleep(ms) {
      return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    function updateVisibleCheck() {
      const canvas = stage.querySelector('canvas:not(.prop-canvas)');
      if (window.alicia?.isLoaded && canvas && canvas.width > 0 && canvas.height > 0) {
        setCheck('visible', 'ok', 'OK');
      } else {
        setCheck('visible', 'fail', 'FAIL');
      }
    }

    function setSceneFocus(event) {
      for (const card of toyCards) {
        card.dataset.active = card.dataset.topic === event.topic ? 'true' : 'false';
      }
      if (sceneDirective) {
        sceneDirective.textContent = event.directive;
      }
      if (storyBeatEl && event.storyBeat) {
        storyBeatEl.textContent = event.storyBeat;
      }
      if (directorFocus) {
        directorFocus.textContent = event.label;
      }
      if (patrolMarker && event.marker) {
        patrolMarker.style.left = event.marker.left;
        patrolMarker.style.bottom = event.marker.bottom;
        patrolMarker.dataset.tone = event.tone || 'ok';
      }
    }

    function setMotionFocus(event) {
      const motionId = event.semanticMotionId || '';
      for (const pill of motionPills) {
        pill.dataset.active = pill.dataset.motionId === motionId ? 'true' : 'false';
      }
      if (!motionActive) return;
      const family = event.semanticLabel || motionId || 'runtime clip';
      const motion = event.animation
        ? `${event.motion || event.clip || 'policy'} + ${event.animation}`
        : event.motion || event.clip || 'policy';
      const source = event.motionSource || 'director';
      motionActive.textContent = `${family} -> ${motion} (${source})`;
    }

    function enableMotionPills(flag) {
      for (const pill of motionPills) {
        pill.disabled = !flag;
      }
    }

    function configureDemoCamera(mascot) {
      const context = mascot?.getSceneContext?.();
      const camera = context?.camera;
      if (!camera) return;
      const rect = stage.getBoundingClientRect();
      const compact = rect.width < 640;
      const targetY = compact ? -0.16 : -0.24;
      camera.fov = compact ? 33 : 31;
      camera.position.set(0, compact ? 0.68 : 0.86, compact ? 5.05 : 4.92);
      if (context.controls) {
        context.controls.target.set(0, targetY, 0);
        context.controls.minDistance = 2.2;
        context.controls.maxDistance = 7;
        context.controls.update();
      } else {
        camera.lookAt(0, targetY, 0);
      }
      camera.updateProjectionMatrix();
    }

    function quatFromDegrees(rotation = {}) {
      const euler = new THREE.Euler(
        (rotation.x || 0) * Math.PI / 180,
        (rotation.y || 0) * Math.PI / 180,
        (rotation.z || 0) * Math.PI / 180,
        'XYZ'
      );
      const q = new THREE.Quaternion().setFromEuler(euler);
      return [q.x, q.y, q.z, q.w];
    }

    function addRotation(base = {}, offset = {}) {
      return {
        x: (base.x || 0) + (offset.x || 0),
        y: (base.y || 0) + (offset.y || 0),
        z: (base.z || 0) + (offset.z || 0),
      };
    }

    function buildCustomAnimation(name, mascot) {
      const definition = CUSTOM_ANIMATIONS[name];
      if (!definition) return null;
      const baseRotations = mascot?.motion?.getPosePreset?.()?.basePose?.rotation || {};
      const bones = {};

      for (const [boneName, frames] of Object.entries(definition.bones || {})) {
        bones[boneName] = frames.map(([timeMs, offset]) => ({
          time_ms: timeMs,
          rot: quatFromDegrees(addRotation(baseRotations[boneName], offset)),
        }));
      }

      return {
        version: 1,
        duration_ms: definition.durationMs,
        fps: definition.fps || 10,
        bones,
        hips_position: definition.hipsPosition || [],
      };
    }

    const CUSTOM_ANIMATIONS = {
      walk_cycle: {
        durationMs: 1900,
        fps: 10,
        hipsPosition: [
          { time_ms: 0, pos: [-0.012, 0, 0] },
          { time_ms: 240, pos: [0.008, 0.014, 0.006] },
          { time_ms: 520, pos: [0.014, 0.002, 0] },
          { time_ms: 820, pos: [-0.006, 0.014, -0.004] },
          { time_ms: 1120, pos: [-0.014, 0.002, 0] },
          { time_ms: 1460, pos: [0.006, 0.012, 0.006] },
          { time_ms: 1900, pos: [-0.012, 0, 0] },
        ],
        bones: {
          spine: [[0, { z: -3 }], [460, { z: 3 }], [940, { z: -2 }], [1420, { z: 3 }], [1900, { z: -3 }]],
          chest: [[0, { y: 2 }], [460, { y: -3 }], [940, { y: 3 }], [1420, { y: -2 }], [1900, { y: 2 }]],
          leftUpperLeg: [[0, { x: 13 }], [460, { x: -9 }], [940, { x: -12 }], [1420, { x: 10 }], [1900, { x: 13 }]],
          rightUpperLeg: [[0, { x: -10 }], [460, { x: 13 }], [940, { x: 12 }], [1420, { x: -9 }], [1900, { x: -10 }]],
          leftLowerLeg: [[0, { x: -8 }], [460, { x: 16 }], [940, { x: 10 }], [1420, { x: -8 }], [1900, { x: -8 }]],
          rightLowerLeg: [[0, { x: 14 }], [460, { x: -8 }], [940, { x: -8 }], [1420, { x: 16 }], [1900, { x: 14 }]],
          leftUpperArm: [[0, { x: -8, z: 4 }], [460, { x: 10, z: 8 }], [940, { x: 12, z: 4 }], [1420, { x: -10, z: 8 }], [1900, { x: -8, z: 4 }]],
          rightUpperArm: [[0, { x: 10, z: -4 }], [460, { x: -8, z: -8 }], [940, { x: -12, z: -4 }], [1420, { x: 10, z: -8 }], [1900, { x: 10, z: -4 }]],
        },
      },
      point_right: {
        durationMs: 1700,
        fps: 10,
        hipsPosition: [
          { time_ms: 0, pos: [0, 0, 0] },
          { time_ms: 420, pos: [0.008, 0.004, 0] },
          { time_ms: 1280, pos: [0.008, 0.004, 0] },
          { time_ms: 1700, pos: [0, 0, 0] },
        ],
        bones: {
          spine: [[0, { z: 0 }], [320, { z: -4, x: -2 }], [1280, { z: -4, x: -2 }], [1700, { z: 0 }]],
          chest: [[0, { y: 0 }], [320, { y: -13 }], [1280, { y: -13 }], [1700, { y: 0 }]],
          rightUpperArm: [[0, { z: -4 }], [280, { x: -20, y: -34, z: -74 }], [1260, { x: -20, y: -34, z: -74 }], [1700, { z: -4 }]],
          rightLowerArm: [[0, { y: 0 }], [280, { y: 18 }], [1260, { y: 18 }], [1700, { y: 0 }]],
          rightHand: [[0, { z: 0 }], [280, { z: -10 }], [1260, { z: -10 }], [1700, { z: 0 }]],
          leftUpperArm: [[0, { z: 0 }], [320, { z: 12, x: 8 }], [1260, { z: 12, x: 8 }], [1700, { z: 0 }]],
        },
      },
      point_left: {
        durationMs: 1700,
        fps: 10,
        hipsPosition: [
          { time_ms: 0, pos: [0, 0, 0] },
          { time_ms: 420, pos: [-0.008, 0.004, 0] },
          { time_ms: 1280, pos: [-0.008, 0.004, 0] },
          { time_ms: 1700, pos: [0, 0, 0] },
        ],
        bones: {
          spine: [[0, { z: 0 }], [320, { z: 4, x: -2 }], [1280, { z: 4, x: -2 }], [1700, { z: 0 }]],
          chest: [[0, { y: 0 }], [320, { y: 13 }], [1280, { y: 13 }], [1700, { y: 0 }]],
          leftUpperArm: [[0, { z: 4 }], [280, { x: -20, y: 34, z: 74 }], [1260, { x: -20, y: 34, z: 74 }], [1700, { z: 4 }]],
          leftLowerArm: [[0, { y: 0 }], [280, { y: -18 }], [1260, { y: -18 }], [1700, { y: 0 }]],
          leftHand: [[0, { z: 0 }], [280, { z: 10 }], [1260, { z: 10 }], [1700, { z: 0 }]],
          rightUpperArm: [[0, { z: 0 }], [320, { z: -12, x: 8 }], [1260, { z: -12, x: 8 }], [1700, { z: 0 }]],
        },
      },
      hands_waist: {
        durationMs: 1900,
        fps: 10,
        hipsPosition: [
          { time_ms: 0, pos: [0, 0, 0] },
          { time_ms: 360, pos: [0.006, 0.006, 0] },
          { time_ms: 1320, pos: [0.006, 0.006, 0] },
          { time_ms: 1900, pos: [0, 0, 0] },
        ],
        bones: {
          spine: [[0, { x: 0 }], [320, { x: 5, z: -2 }], [1320, { x: 5, z: -2 }], [1900, { x: 0 }]],
          chest: [[0, { x: 0 }], [320, { x: 3, y: -4 }], [1320, { x: 3, y: -4 }], [1900, { x: 0 }]],
          leftUpperArm: [[0, { z: 0 }], [340, { x: 18, y: -10, z: 28 }], [1320, { x: 18, y: -10, z: 28 }], [1900, { z: 0 }]],
          rightUpperArm: [[0, { z: 0 }], [340, { x: 18, y: 10, z: -28 }], [1320, { x: 18, y: 10, z: -28 }], [1900, { z: 0 }]],
          leftLowerArm: [[0, { y: 0 }], [340, { y: -70, z: 8 }], [1320, { y: -70, z: 8 }], [1900, { y: 0 }]],
          rightLowerArm: [[0, { y: 0 }], [340, { y: 70, z: -8 }], [1320, { y: 70, z: -8 }], [1900, { y: 0 }]],
        },
      },
      shy_wave: {
        durationMs: 1800,
        fps: 10,
        hipsPosition: [
          { time_ms: 0, pos: [0, 0, 0] },
          { time_ms: 360, pos: [-0.008, 0.006, 0] },
          { time_ms: 900, pos: [0.008, 0.008, 0] },
          { time_ms: 1400, pos: [-0.006, 0.006, 0] },
          { time_ms: 1800, pos: [0, 0, 0] },
        ],
        bones: {
          spine: [[0, { z: 0 }], [340, { z: 5, x: 2 }], [1160, { z: 5, x: 2 }], [1800, { z: 0 }]],
          chest: [[0, { y: 0 }], [340, { y: 5 }], [1160, { y: 5 }], [1800, { y: 0 }]],
          rightUpperArm: [[0, { z: 0 }], [280, { x: 14, y: -8, z: -64 }], [1320, { x: 14, y: -8, z: -64 }], [1800, { z: 0 }]],
          rightLowerArm: [[0, { y: 0 }], [280, { y: 76 }], [1320, { y: 76 }], [1800, { y: 0 }]],
          rightHand: [[0, { z: 0 }], [520, { z: 16 }], [760, { z: -16 }], [1000, { z: 15 }], [1240, { z: -12 }], [1800, { z: 0 }]],
          leftUpperArm: [[0, { z: 0 }], [340, { z: 18, x: 6 }], [1320, { z: 18, x: 6 }], [1800, { z: 0 }]],
        },
      },
      twirl: {
        durationMs: 2100,
        fps: 10,
        hipsPosition: [
          { time_ms: 0, pos: [0, 0, 0] },
          { time_ms: 420, pos: [0.012, 0.018, 0] },
          { time_ms: 900, pos: [-0.012, 0.004, 0] },
          { time_ms: 1440, pos: [0.012, 0.018, 0] },
          { time_ms: 2100, pos: [0, 0, 0] },
        ],
        bones: {
          spine: [[0, { z: 0 }], [420, { z: 8, x: -2 }], [900, { z: -8, x: -3 }], [1440, { z: 8, x: -2 }], [2100, { z: 0 }]],
          chest: [[0, { y: 0 }], [420, { y: -10 }], [900, { y: 12 }], [1440, { y: -10 }], [2100, { y: 0 }]],
          leftUpperArm: [[0, { z: 0 }], [420, { z: 44, x: 10 }], [1440, { z: 54, x: 8 }], [2100, { z: 0 }]],
          rightUpperArm: [[0, { z: 0 }], [420, { z: -44, x: 10 }], [1440, { z: -54, x: 8 }], [2100, { z: 0 }]],
          leftLowerArm: [[0, { y: 0 }], [420, { y: -18 }], [1440, { y: -22 }], [2100, { y: 0 }]],
          rightLowerArm: [[0, { y: 0 }], [420, { y: 18 }], [1440, { y: 22 }], [2100, { y: 0 }]],
        },
      },
      curious_peek: {
        durationMs: 1850,
        fps: 10,
        hipsPosition: [
          { time_ms: 0, pos: [0, 0, 0] },
          { time_ms: 360, pos: [0.004, 0.004, 0.006] },
          { time_ms: 1320, pos: [0.004, 0.004, 0.006] },
          { time_ms: 1850, pos: [0, 0, 0] },
        ],
        bones: {
          spine: [[0, { x: 0 }], [360, { x: 8, z: 3 }], [1320, { x: 8, z: 3 }], [1850, { x: 0 }]],
          chest: [[0, { y: 0 }], [360, { y: -7, x: 4 }], [1320, { y: -7, x: 4 }], [1850, { y: 0 }]],
          rightUpperArm: [[0, { z: 0 }], [360, { x: 28, y: -8, z: -42 }], [1320, { x: 28, y: -8, z: -42 }], [1850, { z: 0 }]],
          rightLowerArm: [[0, { y: 0 }], [360, { y: 74 }], [1320, { y: 74 }], [1850, { y: 0 }]],
          leftUpperArm: [[0, { z: 0 }], [360, { z: 18, x: 8 }], [1320, { z: 18, x: 8 }], [1850, { z: 0 }]],
        },
      },
      touch_model: {
        durationMs: 1500,
        fps: 10,
        hipsPosition: [
          { time_ms: 0, pos: [0, 0, 0] },
          { time_ms: 360, pos: [0.01, 0.004, 0.004] },
          { time_ms: 1040, pos: [0.012, 0.006, 0.006] },
          { time_ms: 1500, pos: [0, 0, 0] },
        ],
        bones: {
          spine: [[0, { x: 0 }], [320, { x: 6, z: -3 }], [1040, { x: 6, z: -3 }], [1500, { x: 0 }]],
          chest: [[0, { y: 0 }], [320, { y: -8, x: 2 }], [1040, { y: -8, x: 2 }], [1500, { y: 0 }]],
          rightUpperArm: [[0, { z: 0 }], [260, { x: -10, y: -22, z: -56 }], [900, { x: -10, y: -22, z: -56 }], [1500, { z: 0 }]],
          rightLowerArm: [[0, { y: 0 }], [260, { y: 42, z: -8 }], [900, { y: 42, z: -8 }], [1500, { y: 0 }]],
          rightHand: [[0, { x: 0 }], [420, { x: -14, z: -8 }], [640, { x: -8, z: 7 }], [860, { x: -14, z: -8 }], [1500, { x: 0 }]],
          leftUpperArm: [[0, { z: 0 }], [320, { z: 10, x: 8 }], [1040, { z: 10, x: 8 }], [1500, { z: 0 }]],
        },
      },
      crouch_touch: {
        durationMs: 2400,
        fps: 10,
        hipsPosition: [
          { time_ms: 0, pos: [0, 0, 0] },
          { time_ms: 420, pos: [0.004, -0.126, 0.024] },
          { time_ms: 980, pos: [0.006, -0.252, 0.052] },
          { time_ms: 1560, pos: [0.008, -0.236, 0.048] },
          { time_ms: 1980, pos: [0.004, -0.082, 0.018] },
          { time_ms: 2400, pos: [0, 0, 0] },
        ],
        bones: {
          spine: [[0, { x: 0 }], [420, { x: -26, z: -1 }], [980, { x: -52, z: -2 }], [1560, { x: -46, z: -1 }], [2400, { x: 0 }]],
          chest: [[0, { x: 0 }], [420, { x: -16, y: -4 }], [980, { x: -32, y: -6 }], [1560, { x: -28, y: -5 }], [2400, { x: 0 }]],
          leftUpperLeg: [[0, { x: 0 }], [420, { x: -13, z: 1 }], [980, { x: -24, z: 1 }], [1560, { x: -22, z: 1 }], [2400, { x: 0 }]],
          rightUpperLeg: [[0, { x: 0 }], [420, { x: -13, z: -1 }], [980, { x: -24, z: -1 }], [1560, { x: -22, z: -1 }], [2400, { x: 0 }]],
          leftLowerLeg: [[0, { x: 0 }], [420, { x: 12 }], [980, { x: 24 }], [1560, { x: 22 }], [2400, { x: 0 }]],
          rightLowerLeg: [[0, { x: 0 }], [420, { x: 12 }], [980, { x: 24 }], [1560, { x: 22 }], [2400, { x: 0 }]],
          rightUpperArm: [[0, { z: 0 }], [360, { x: -18, y: -22, z: -54 }], [1180, { x: -22, y: -28, z: -60 }], [1680, { x: -18, y: -24, z: -56 }], [2400, { z: 0 }]],
          rightLowerArm: [[0, { y: 0 }], [360, { y: 46, z: -10 }], [1180, { y: 56, z: -12 }], [1680, { y: 48, z: -10 }], [2400, { y: 0 }]],
          rightHand: [[0, { x: 0 }], [620, { x: -20, z: -12 }], [880, { x: -8, z: 10 }], [1220, { x: -18, z: -10 }], [1580, { x: -8, z: 8 }], [2400, { x: 0 }]],
          leftUpperArm: [[0, { z: 0 }], [420, { z: 14, x: 8 }], [1180, { z: 16, x: 9 }], [1560, { z: 14, x: 8 }], [2400, { z: 0 }]],
          leftLowerArm: [[0, { y: 0 }], [420, { y: -14 }], [1180, { y: -16 }], [1560, { y: -14 }], [2400, { y: 0 }]],
        },
      },
      kick_forward: {
        durationMs: 1500,
        fps: 10,
        hipsPosition: [
          { time_ms: 0, pos: [0, 0, 0] },
          { time_ms: 300, pos: [-0.01, 0.006, 0] },
          { time_ms: 640, pos: [0.018, 0.018, 0.01] },
          { time_ms: 960, pos: [0.006, 0.004, 0] },
          { time_ms: 1500, pos: [0, 0, 0] },
        ],
        bones: {
          spine: [[0, { x: 0 }], [300, { x: -3, z: -4 }], [640, { x: 6, z: 4 }], [960, { x: 2, z: 0 }], [1500, { x: 0 }]],
          chest: [[0, { y: 0 }], [300, { y: -5 }], [640, { y: 8 }], [960, { y: 0 }], [1500, { y: 0 }]],
          rightUpperLeg: [[0, { x: 0 }], [300, { x: -18 }], [640, { x: 30, y: -6 }], [960, { x: -8 }], [1500, { x: 0 }]],
          rightLowerLeg: [[0, { x: 0 }], [300, { x: 24 }], [640, { x: -22 }], [960, { x: 12 }], [1500, { x: 0 }]],
          leftUpperLeg: [[0, { x: 0 }], [300, { x: 8 }], [640, { x: -12 }], [960, { x: 4 }], [1500, { x: 0 }]],
          leftUpperArm: [[0, { z: 0 }], [320, { z: 22, x: 6 }], [760, { z: 18, x: 8 }], [1500, { z: 0 }]],
          rightUpperArm: [[0, { z: 0 }], [320, { z: -24, x: 8 }], [760, { z: -18, x: 6 }], [1500, { z: 0 }]],
        },
      },
      punch_forward: {
        durationMs: 1250,
        fps: 10,
        hipsPosition: [
          { time_ms: 0, pos: [0, 0, 0] },
          { time_ms: 240, pos: [-0.008, 0.004, 0] },
          { time_ms: 520, pos: [0.018, 0.012, 0.006] },
          { time_ms: 820, pos: [0.006, 0.004, 0] },
          { time_ms: 1250, pos: [0, 0, 0] },
        ],
        bones: {
          spine: [[0, { x: 0 }], [240, { x: -2, z: -4 }], [520, { x: 7, z: 5 }], [820, { x: 1, z: 0 }], [1250, { x: 0 }]],
          chest: [[0, { y: 0 }], [240, { y: -8 }], [520, { y: 14 }], [820, { y: 0 }], [1250, { y: 0 }]],
          rightUpperArm: [[0, { z: 0 }], [220, { x: 8, y: 22, z: -18 }], [520, { x: -36, y: -34, z: -72 }], [820, { x: 6, y: 6, z: -16 }], [1250, { z: 0 }]],
          rightLowerArm: [[0, { y: 0 }], [220, { y: 78 }], [520, { y: 12 }], [820, { y: 58 }], [1250, { y: 0 }]],
          rightHand: [[0, { x: 0 }], [520, { x: -12, z: -8 }], [820, { x: 0 }], [1250, { x: 0 }]],
          leftUpperArm: [[0, { z: 0 }], [240, { z: 16, x: 8 }], [520, { z: 24, x: 10 }], [1250, { z: 0 }]],
        },
      },
    };

    const MOTION_EVENT_PROFILES = {
      come_here: {
        topic: 'release',
        prop: 'releaseCore',
        intent: 'greeting',
        motion: 'wave',
        animation: 'crouch_touch',
        sceneAction: 'touch',
        walkTo: { x: -66, y: 5, scale: 1.05 },
        label: '招手靠近 release core',
        directive: 'Alicia is calling the viewer closer to inspect the package.',
        text: '過來看這邊。這顆 release core 落在地上了，我先摸一下確認它有亮。',
        gaze: { x: -0.46, y: 0.12 },
        marker: { left: '31%', bottom: '42%' },
      },
      point_target: {
        topic: 'target',
        prop: 'warningTarget',
        intent: 'explain',
        motion: 'presenting',
        animation: 'point_right',
        sceneAction: 'touch',
        walkTo: { x: 72, y: -5, scale: 1.06 },
        label: '指向 target dummy',
        directive: 'Alicia points the scene focus at the current object.',
        text: '目標在這裡。我先繞過來指給你看，碰一下它，之後 selectedMesh 就能變成真正互動目標。',
        gaze: { x: 0.5, y: -0.1 },
        marker: { left: '68%', bottom: '23%' },
        tone: 'hot',
      },
      cross_no: {
        topic: 'target',
        prop: 'warningTarget',
        intent: 'warning',
        motion: 'warning_nod',
        animation: 'hands_waist',
        walkTo: { x: 54, y: -3, scale: 1.05 },
        label: '交叉制止 target',
        directive: 'Alicia blocks a suspicious object interaction.',
        text: '不行，這個 target 先停。這種動作很適合拿來做危險區域、禁止操作或 policy guard 的演出。',
        gaze: { x: 0.46, y: -0.12 },
        marker: { left: '69%', bottom: '24%' },
        tone: 'hot',
      },
      hands_up_surrender: {
        topic: 'target',
        prop: 'warningTarget',
        intent: 'error',
        motion: 'shake_head',
        animation: 'kick_forward',
        sceneAction: 'kick-back',
        followUpOnly: true,
        storyBeat: 'Chapter 4.5 / Chase and kick it back',
        walkTo: { x: 74, y: -5, scale: 1.06, roomPath: 'right-front-return' },
        label: '把 target dummy 踢回來',
        directive: 'Alicia walks back to recover a displaced object.',
        text: '等一下，剛剛被我踢歪的 target 要回來。我走過去，再一腳把它踢回位置。',
        gaze: { x: 0.48, y: -0.1 },
        marker: { left: '70%', bottom: '24%' },
        tone: 'hot',
      },
      look_around: {
        topic: 'motion',
        prop: 'motionOrb',
        intent: 'searching',
        motion: 'dance_short',
        animation: 'walk_cycle',
        walkTo: { x: -48, y: 7, scale: 1.03 },
        label: '掃描 motion orb',
        directive: 'Alicia scans the sandbox for motion candidates.',
        text: `我正在掃描 motion bank：${releaseStats.semanticFamilyCount} 個 semantic family，${releaseStats.motionAssetCount} 個 motion asset。`,
        gaze: { x: -0.35, y: -0.18 },
        marker: { left: '36%', bottom: '24%' },
      },
      thinking_chin: {
        topic: 'motion',
        prop: 'motionOrb',
        intent: 'explain',
        motion: 'idle',
        actState: 'thinking',
        animation: 'crouch_touch',
        sceneAction: 'touch',
        walkTo: { x: -36, y: 3, scale: 1.04 },
        label: '托腮思考下一個動作',
        directive: 'Alicia plans the next scene verb from the semantic library.',
        text: '我先蹲近一點摸摸 motion orb。之後介紹、拆解、坐上去、踢一下，都可以由 scene verb 編排。',
        gaze: { x: -0.34, y: -0.16 },
        marker: { left: '36%', bottom: '24%' },
      },
      angry_hands_waist: {
        topic: 'target',
        prop: 'warningTarget',
        intent: 'warning',
        motion: 'warning_nod',
        animation: 'kick_forward',
        sceneAction: 'kick-away',
        kickDirection: 1,
        followUpMotionId: 'hands_up_surrender',
        walkTo: { x: 58, y: -2, scale: 1.06 },
        label: '插腰警告 target',
        directive: 'Alicia gives the target a strict reminder.',
        text: '你，紅色那顆，先不要亂動。我要把你踢到旁邊，等一下再走過去踢回來。',
        gaze: { x: 0.46, y: -0.12 },
        marker: { left: '70%', bottom: '24%' },
        tone: 'hot',
      },
      shy_head_touch: {
        topic: 'release',
        prop: 'releaseCore',
        intent: 'explain',
        motion: 'shake_head',
        animation: 'crouch_touch',
        sceneAction: 'touch',
        walkTo: { x: -56, y: 3, scale: 1.04 },
        label: '害羞補充 runtime limit',
        directive: 'Alicia admits which trained motion is still metadata-only.',
        text: '這個 shy family 現在還是 metadata-only。我先用 demo 動作摸一下 release core，不假裝 VRMA 已經播了。',
        gaze: { x: -0.48, y: 0.12 },
        marker: { left: '31%', bottom: '42%' },
      },
      wave_goodbye: {
        topic: 'release',
        prop: 'releaseCore',
        intent: 'greeting',
        motion: 'wave',
        animation: 'shy_wave',
        walkTo: { x: -50, y: 2, scale: 1.04 },
        label: '揮手展示 package',
        directive: 'Alicia greets the release package like an official sample page.',
        text: '嗨，這裡是 Alicia Runtime 官方範例頁的雛形。每個 release 都可以用這頁快速看我有沒有活著。',
        gaze: { x: -0.44, y: 0.12 },
        marker: { left: '30%', bottom: '42%' },
      },
      victory_pose: {
        topic: 'assets',
        prop: 'assetCrate',
        intent: 'success',
        motion: 'victory',
        animation: 'crouch_touch',
        sceneAction: 'touch',
        walkTo: { x: 120, y: 45, scale: 1.05 },
        label: '勝利完成 asset check',
        directive: 'Alicia celebrates and taps the asset crate.',
        text: `Asset check pass。${releaseStats.assetCount} 個檔案、${releaseStats.motionAssetCount} 個 motion asset，摸一下箱子確認收工。`,
        gaze: { x: 0.48, y: 0.08 },
        marker: { left: '65%', bottom: '41%' },
      },
    };

    function buildMotionEvent(motion) {
      const base = MOTION_EVENT_PROFILES[motion.id] || {
        topic: 'motion',
        prop: 'motionOrb',
        intent: 'explain',
        motion: motion.runtimeReady ? 'presenting' : 'idle',
        label: motion.displayName || motion.id,
        directive: 'Alicia is sampling a semantic motion family.',
        text: `我正在展示 ${motion.displayName || motion.id}。這個 family 的 tags 是 ${(motion.intentTags || []).slice(0, 4).join(' / ') || 'none'}。`,
        gaze: { x: -0.35, y: -0.16 },
        marker: { left: '36%', bottom: '24%' },
      };
      return {
        ...base,
        semanticMotionId: motion.id,
        semanticLabel: motion.displayName || motion.id,
        motionSource: motion.runtimeReady ? 'runtime-ready family' : 'metadata-only fallback',
      };
    }

    function buildShowcaseEvent(event, index) {
      const fallback = MOTION_EVENT_PROFILES[event.semanticMotionId] || {
        topic: event.topic || 'motion',
        prop: event.prop || 'motionOrb',
        intent: event.intent || 'explain',
        motion: event.motion || 'presenting',
        animation: event.animation || 'touch_model',
        gaze: event.gaze || { x: -0.35, y: -0.16 },
        marker: event.marker || { left: '36%', bottom: '24%' },
      };
      const sourceMotion = event.sourceMotion || 'mined-motion';
      return {
        ...fallback,
        ...event,
        id: event.id || `showcase_event_${index + 1}`,
        label: event.label || `${event.semanticLabel || event.semanticMotionId || 'showcase'} · ${sourceMotion}`,
        directive: event.directive || `Alicia is replaying mined motion evidence from ${sourceMotion}.`,
        text: event.text || `我從 ${sourceMotion} 挖到一個展示動作。`,
        semanticMotionId: event.semanticMotionId || fallback.semanticMotionId || '',
        semanticLabel: event.semanticLabel || event.semanticMotionId || '',
        sourceMotion,
        motionSource: 'showcase_motion_pack',
      };
    }

    class ScenePropLayer {
      constructor(container, mascot = null) {
        this.container = container;
        this.mascot = mascot;
        this.clock = new THREE.Clock();
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.resizeObserver = null;
        this.sceneRoot = new THREE.Group();
        this.sceneRoot.name = 'AliciaDemoToyRoom';
        const sceneContext = mascot?.getSceneContext?.();
        this.usesMascotScene = !!(sceneContext?.scene && typeof mascot?.addSceneObject === 'function');

        if (this.usesMascotScene) {
          this.scene = sceneContext.scene;
          this.container.dataset.sceneMode = 'shared';
          this.mascot.addSceneObject(this.sceneRoot);
        } else {
          this.scene = new THREE.Scene();
          this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
          this.camera.position.set(0, 0.42, 5.7);
          this.camera.lookAt(0, -0.82, 0);
          this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
          this.renderer.domElement.className = 'prop-canvas';
          this.renderer.setClearColor(0x000000, 0);
          this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
          this.container.appendChild(this.renderer.domElement);
          this.scene.add(this.sceneRoot);
          this.container.dataset.sceneMode = 'overlay';
        }

        this.props = {};
        this.propStates = {};
        this.activeProp = null;
        this.lastKickedProp = null;
        this.#buildScene();
        this.resize();
        if (this.renderer) {
          this.resizeObserver = new ResizeObserver(() => this.resize());
          this.resizeObserver.observe(this.container);
        }
        this.animationId = requestAnimationFrame(() => this.animate());
      }

      #buildScene() {
        if (!this.usesMascotScene) {
          this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));

          const key = new THREE.DirectionalLight(0xaed8ff, 0.9);
          key.position.set(2, 3, 4);
          this.scene.add(key);

          const rim = new THREE.PointLight(0x8fd17c, 0.9, 8);
          rim.position.set(-2.6, 1.4, 2.2);
          this.scene.add(rim);
        }
        this.sceneRoot.add(this.#createToyRoom());

        this.props.releaseCore = this.#createReleaseCore();
        this.props.assetCrate = this.#createAssetCrate();
        this.props.motionOrb = this.#createMotionOrb();
        this.props.warningTarget = this.#createWarningTarget();
        this.props.birthdayCake = this.#createBirthdayCake();

        // model ring: demo props are grounded around Alicia instead of floating as badges.
        const placements = this.usesMascotScene
          ? {
              releaseCore: { position: [-1.08, -0.91, 0.86], scale: 0.28, color: 0x63b3ff },
              assetCrate: { position: [1.08, -0.92, 0.72], scale: 0.32, color: 0x8fd17c },
              motionOrb: { position: [-0.92, -0.86, -0.76], scale: 0.24, color: 0xb6a1ff },
              warningTarget: { position: [0.92, -0.86, -0.82], scale: 0.26, color: 0xff7a7a },
              birthdayCake: { position: [0, -0.92, 0.8], scale: 0.3, color: 0xffd700 },
            }
          : {
              releaseCore: { position: [-1.44, -1.38, 0.66], scale: 0.58, color: 0x63b3ff },
              assetCrate: { position: [1.34, -1.38, 0.58], scale: 0.64, color: 0x8fd17c },
              motionOrb: { position: [-1.0, -1.12, -0.54], scale: 0.44, color: 0xb6a1ff },
              warningTarget: { position: [0.98, -1.14, -0.58], scale: 0.48, color: 0xff7a7a },
              birthdayCake: { position: [0, -1.38, 0.7], scale: 0.6, color: 0xffd700 },
            };

        for (const [name, prop] of Object.entries(this.props)) {
          const placement = placements[name];
          const anchor = new THREE.Vector3(...placement.position);
          prop.position.copy(anchor);
          prop.scale.setScalar(placement.scale);
          prop.userData.baseScale = placement.scale;
          prop.traverse((obj) => {
            if (obj.isMesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
            }
          });
          this.propStates[name] = {
            anchor: anchor.clone(),
            target: anchor.clone(),
            bump: 0,
            spin: 0,
            orbit: 0,
            touchPush: 0,
            contactFlash: 0,
            touchSide: anchor.x >= 0 ? 1 : -1,
            touchDepth: anchor.z >= 0 ? 1 : -1,
            action: 'idle',
          };
          this.sceneRoot.add(prop);
          this.sceneRoot.add(this.#createGroundSpot(anchor, placement.color));
        }
      }

      #createToyRoom() {
        const group = new THREE.Group();
        const shared = this.usesMascotScene;
        const floorY = shared ? -0.95 : -1.54;
        const floorWidth = shared ? 3.9 : 4.8;
        const floorDepth = shared ? 3.7 : 3.2;

        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(floorWidth, floorDepth, 1, 1),
          new THREE.MeshStandardMaterial({
            color: 0x273449,
            roughness: 0.86,
            transparent: true,
            opacity: shared ? 0.38 : 0.28,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, floorY, shared ? -0.02 : 0.05);
        floor.receiveShadow = true;
        group.add(floor);

        const floorGrid = new THREE.GridHelper(floorWidth, shared ? 10 : 8, 0x9fd0ff, 0x31445e);
        floorGrid.position.set(0, floorY + 0.004, shared ? -0.02 : 0.05);
        floorGrid.material.transparent = true;
        floorGrid.material.opacity = shared ? 0.2 : 0.26;
        group.add(floorGrid);

        const wall = new THREE.Mesh(
          new THREE.PlaneGeometry(shared ? 3.9 : 4.8, shared ? 1.45 : 1.7, 1, 1),
          new THREE.MeshBasicMaterial({
            color: 0x182337,
            transparent: true,
            opacity: shared ? 0.24 : 0.24,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        wall.position.set(0, shared ? -0.24 : -0.42, shared ? -1.45 : -1.34);
        group.add(wall);

        const seam = new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-floorWidth / 2, floorY + 0.02, shared ? -1.45 : -1.34),
            new THREE.Vector3(floorWidth / 2, floorY + 0.02, shared ? -1.45 : -1.34),
          ]),
          new THREE.LineBasicMaterial({ color: 0xaed8ff, transparent: true, opacity: 0.32 })
        );
        group.add(seam);
        return group;
      }

      #createGroundSpot(anchor, color) {
        const group = new THREE.Group();
        const shared = this.usesMascotScene;
        const floorY = shared ? -0.946 : -1.52;
        const radius = shared ? 0.28 : 0.5;
        group.position.set(anchor.x, floorY, anchor.z);
        const shadow = new THREE.Mesh(
          new THREE.CircleGeometry(radius, 48),
          new THREE.MeshBasicMaterial({ color: 0x030712, transparent: true, opacity: shared ? 0.36 : 0.32, depthWrite: false })
        );
        shadow.rotation.x = Math.PI / 2;
        shadow.scale.set(1.2, 0.42, 1);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(radius, radius + (shared ? 0.018 : 0.03), 64),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: shared ? 0.22 : 0.16, depthWrite: false })
        );
        ring.rotation.x = Math.PI / 2;
        ring.scale.set(1.2, 0.42, 1);
        group.add(shadow, ring);
        return group;
      }

      #createReleaseCore() {
        const group = new THREE.Group();
        const material = new THREE.MeshStandardMaterial({
          color: 0x63b3ff,
          emissive: 0x143d66,
          roughness: 0.28,
          metalness: 0.18,
        });
        const core = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.52), material);
        const wire = new THREE.LineSegments(
          new THREE.EdgesGeometry(core.geometry),
          new THREE.LineBasicMaterial({ color: 0xd7ecff, transparent: true, opacity: 0.82 })
        );
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.48, 0.012, 12, 72),
          new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.68 })
        );
        ring.rotation.x = Math.PI / 2;
        group.add(core, wire, ring);
        return group;
      }

      #createAssetCrate() {
        const group = new THREE.Group();
        const material = new THREE.MeshStandardMaterial({
          color: 0x8fd17c,
          emissive: 0x173b22,
          roughness: 0.4,
        });
        for (let i = 0; i < 3; i++) {
          const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.42), material);
          box.position.set((i - 1) * 0.24, i * 0.12, 0);
          box.rotation.y = i * 0.46;
          group.add(box);
        }
        return group;
      }

      #createMotionOrb() {
        const group = new THREE.Group();
        const orb = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.32, 1),
          new THREE.MeshStandardMaterial({
            color: 0xb6a1ff,
            emissive: 0x2f216d,
            roughness: 0.24,
            metalness: 0.08,
          })
        );
        const halo = new THREE.Mesh(
          new THREE.TorusGeometry(0.58, 0.01, 10, 96),
          new THREE.MeshBasicMaterial({ color: 0xc7bdff, transparent: true, opacity: 0.5 })
        );
        halo.rotation.x = Math.PI / 2.8;
        group.add(orb, halo);
        return group;
      }

      #createWarningTarget() {
        const group = new THREE.Group();
        const center = new THREE.Mesh(
          new THREE.SphereGeometry(0.21, 24, 16),
          new THREE.MeshStandardMaterial({
            color: 0xff7a7a,
            emissive: 0x661414,
            roughness: 0.2,
          })
        );
        const ringA = new THREE.Mesh(
          new THREE.TorusGeometry(0.45, 0.018, 12, 96),
          new THREE.MeshBasicMaterial({ color: 0xffb0b0, transparent: true, opacity: 0.7 })
        );
        const ringB = ringA.clone();
        ringB.rotation.y = Math.PI / 2;
        group.add(center, ringA, ringB);
        return group;
      }

      #createBirthdayCake() {
        const group = new THREE.Group();
        group.name = 'BirthdayCake';

        // Cake base layer
        const cakeGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 32);
        const cakeMat = new THREE.MeshStandardMaterial({
          color: 0xffa3b1, // pink cake
          roughness: 0.6,
          metalness: 0.1
        });
        const cake = new THREE.Mesh(cakeGeo, cakeMat);
        cake.position.y = 0.2;
        group.add(cake);

        // Cream layer
        const creamGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.08, 32);
        const creamMat = new THREE.MeshStandardMaterial({
          color: 0xffffff, // white cream
          roughness: 0.5
        });
        const cream = new THREE.Mesh(creamGeo, creamMat);
        cream.position.y = 0.36;
        group.add(cream);

        // Candle
        const candleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.24, 16);
        const candleMat = new THREE.MeshStandardMaterial({
          color: 0xffd700, // yellow candle
          roughness: 0.4
        });
        const candle = new THREE.Mesh(candleGeo, candleMat);
        candle.position.y = 0.52;
        group.add(candle);

        // Flame
        const flameGeo = new THREE.ConeGeometry(0.04, 0.12, 16);
        const flameMat = new THREE.MeshBasicMaterial({
          color: 0xff7a00 // orange
        });
        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.y = 0.66;
        flame.name = 'Flame';
        group.add(flame);

        return group;
      }

      focus(name) {
        this.activeProp = this.props[name] || null;
      }

      getPropWorldPosition(name) {
        const prop = this.props[name];
        if (!prop) return null;
        prop.updateWorldMatrix(true, false);
        return new THREE.Vector3().setFromMatrixPosition(prop.matrixWorld);
      }

      getLookAtPoint(name, fallback = { x: 0, y: 0 }) {
        const camera = this.usesMascotScene
          ? this.mascot?.getSceneContext?.().camera
          : this.camera;
        const worldPosition = this.getPropWorldPosition(name);
        if (!camera || !worldPosition) return fallback;
        const ndc = worldPosition.project(camera);
        return {
          x: Math.max(-0.86, Math.min(0.86, ndc.x)),
          y: Math.max(-0.72, Math.min(0.72, ndc.y + 0.08)),
        };
      }

      touchProp(name, direction = 0) {
        const state = this.propStates[name];
        if (!state) return false;
        state.bump = 1;
        state.touchPush = 1;
        state.contactFlash = 1;
        state.touchSide = direction || (state.anchor.x >= 0 ? 1 : -1);
        state.touchDepth = state.anchor.z >= 0 ? 1 : -1;
        state.spin = state.touchSide * 1.4;
        state.action = 'touch';
        return true;
      }

      punchProp(name, direction = 1) {
        const state = this.propStates[name];
        if (!state) return false;
        const distance = this.usesMascotScene ? 0.2 : 0.28;
        state.target.copy(state.anchor).add(new THREE.Vector3(direction * distance, 0.04, 0.04));
        state.spin = direction * 10.5;
        state.bump = 1.25;
        state.contactFlash = 1.15;
        state.touchPush = 0.9;
        state.touchSide = direction;
        state.action = 'punched';
        return true;
      }

      orbitProp(name) {
        const state = this.propStates[name];
        if (!state) return false;
        state.orbit = 1.5;
        state.bump = 0.8;
        state.action = 'orbiting';
        return true;
      }

      kickAway(name, direction = 1) {
        const state = this.propStates[name];
        if (!state) return false;
        const distance = this.usesMascotScene ? 0.48 : 0.72;
        const depth = this.usesMascotScene ? -0.05 : -0.1;
        state.target.copy(state.anchor).add(new THREE.Vector3(direction * distance, 0.04, depth));
        state.spin = direction * 7.5;
        state.bump = 1.15;
        state.contactFlash = 1.1;
        state.touchPush = 0.85;
        state.touchSide = direction;
        state.action = 'kicked-away';
        this.lastKickedProp = name;
        return true;
      }

      kickBack(name = this.lastKickedProp) {
        const state = this.propStates[name];
        if (!state) return false;
        const direction = state.target.x >= state.anchor.x ? -1 : 1;
        state.target.copy(state.anchor);
        state.spin = direction * 8.5;
        state.bump = 1;
        state.contactFlash = 1;
        state.touchPush = 0.8;
        state.touchSide = direction;
        state.action = 'kicked-back';
        return true;
      }

      runSceneAction(event = {}) {
        const name = event.prop;
        const action = event.sceneAction || 'focus';
        if (action === 'touch') return this.touchProp(name, event.kickDirection || 0);
        if (action === 'punch') return this.punchProp(name, event.kickDirection || 1);
        if (action === 'orbit') return this.orbitProp(name);
        if (action === 'kick-away') return this.kickAway(name, event.kickDirection || 1);
        if (action === 'kick-back') return this.kickBack(name);
        return true;
      }

      resize() {
        if (!this.renderer || !this.camera) return;
        const rect = this.container.getBoundingClientRect();
        const width = Math.max(1, rect.width);
        const height = Math.max(1, rect.height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
      }

      animate() {
        const dt = this.clock.getDelta();
        const t = this.clock.elapsedTime;
        for (const [name, prop] of Object.entries(this.props)) {
          const active = prop === this.activeProp;
          const state = this.propStates[name];
          if (state) {
            prop.position.lerp(state.target, Math.min(1, dt * 5.2));
            if (state.orbit > 0.01) {
              const progress = 1.5 - state.orbit;
              const orbitRadius = this.usesMascotScene ? 0.1 : 0.18;
              prop.position.x += Math.cos(progress * 5.8) * orbitRadius;
              prop.position.z += Math.sin(progress * 5.8) * orbitRadius;
              state.orbit = Math.max(0, state.orbit - dt);
            }
            if (state.bump > 0.01) {
              prop.position.y += Math.sin(state.bump * Math.PI) * 0.12;
              state.bump = Math.max(0, state.bump - dt * 1.8);
            }
            if (state.touchPush > 0.01) {
              const push = Math.sin(state.touchPush * Math.PI) * (this.usesMascotScene ? 0.07 : 0.12);
              prop.position.x += state.touchSide * push;
              prop.position.z += state.touchDepth * push * 0.45;
              state.touchPush = Math.max(0, state.touchPush - dt * 2.7);
            }
            if (Math.abs(state.spin) > 0.01) {
              prop.rotation.z += state.spin * dt;
              state.spin *= Math.pow(0.12, dt);
            }
            if (state.contactFlash > 0.01) {
              state.contactFlash = Math.max(0, state.contactFlash - dt * 2.4);
            }
          }
          prop.rotation.y += dt * (active ? 1.2 : 0.38);
          prop.rotation.x = Math.sin(t * 0.8 + name.length) * 0.08;
          const baseScale = prop.userData.baseScale || 1;
          const flash = state?.contactFlash || 0;
          const contactScale = flash > 0 ? Math.sin(flash * Math.PI) * 0.18 : 0;
          const scale = baseScale * (active ? 1.12 + Math.sin(t * 5) * 0.04 : 1) * (1 + contactScale);
          prop.scale.setScalar(scale);
          prop.visible = true;
          if (name === 'birthdayCake') {
            const flame = prop.getObjectByName('Flame');
            if (flame) {
              const scaleWobble = 1.0 + Math.sin(t * 15) * 0.15 + Math.cos(t * 22) * 0.08;
              flame.scale.set(scaleWobble, scaleWobble * 1.2, scaleWobble);
              flame.position.x = Math.sin(t * 18) * 0.01;
              flame.position.z = Math.cos(t * 14) * 0.01;
            }
          }
        }
        if (this.renderer && this.camera) {
          this.renderer.render(this.scene, this.camera);
        }
        this.animationId = requestAnimationFrame(() => this.animate());
      }
    }

    class AliciaStageWalker {
      constructor(container, mascot = null) {
        this.container = container;
        this.mascot = mascot;
        this.canvas = null;
        this.vrmRoot = null;
        this.rootBasePosition = null;
        this.rootBaseScale = null;
        this.rootBaseRotationY = 0;
        this.sceneMoveToken = 0;
        this.shadow = container.querySelector('[data-alicia-shadow]');
        this.footprintLayer = container.querySelector('[data-footprint-layer]');
        this.position = { x: 0, y: 0, scale: 1, roomPath: 'center' };
        this.stepIndex = 0;
      }

      getCanvas() {
        if (this.canvas && this.canvas.isConnected) return this.canvas;
        this.canvas = this.container.querySelector('canvas:not(.prop-canvas)');
        if (this.canvas) {
          this.canvas.style.transition = 'transform 1150ms cubic-bezier(.2,.82,.22,1)';
          this.canvas.style.transformOrigin = '50% 68%';
          this.canvas.style.willChange = 'transform';
        }
        return this.canvas;
      }

      getSceneRoot() {
        const root = this.mascot?.getSceneContext?.().vrmRoot || null;
        if (root && root !== this.vrmRoot) {
          this.vrmRoot = root;
          this.rootBasePosition = root.position.clone();
          this.rootBaseScale = root.scale.clone();
          this.rootBaseRotationY = root.rotation.y;
        }
        return this.vrmRoot;
      }

      waitForSceneRoot(timeoutMs = 1600) {
        const startedAt = performance.now();
        return new Promise((resolve) => {
          const tick = () => {
            const root = this.getSceneRoot();
            if (root && this.rootBasePosition && this.rootBaseScale) {
              resolve(root);
              return;
            }
            if (performance.now() - startedAt >= timeoutMs) {
              resolve(null);
              return;
            }
            requestAnimationFrame(tick);
          };
          tick();
        });
      }

      clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
      }

      shortestAngleDelta(from, to) {
        return Math.atan2(Math.sin(to - from), Math.cos(to - from));
      }

      facingRotationFor(fromX, fromZ, toX, toZ) {
        const dx = toX - fromX;
        const dz = toZ - fromZ;
        if (Math.hypot(dx, dz) < 0.0001) {
          return this.rootBaseRotationY;
        }
        return this.rootBaseRotationY + Math.atan2(dx, dz);
      }

      sceneTargetFor(next, compact, scale, facingRotationY = null, walkRotationY = null) {
        const x = this.clamp(next.x * (compact ? 0.0032 : 0.0072), -1.2, 1.2);
        const z = this.clamp(next.y * (compact ? 0.006 : 0.011), -1.0, 1.0);
        return {
          x,
          z,
          scale,
          rotationY: Number.isFinite(facingRotationY) ? facingRotationY : this.rootBaseRotationY - x * 0.18,
          walkRotationY: Number.isFinite(walkRotationY) ? walkRotationY : null,
        };
      }

      animateSceneRoot(root, sceneTarget, duration = 1150, isWalking = false) {
        if (!root || !this.rootBasePosition || !this.rootBaseScale) return;
        const token = ++this.sceneMoveToken;
        const start = performance.now();
        const from = {
          x: root.position.x,
          z: root.position.z,
          scale: root.scale.x || 1,
          rotationY: root.rotation.y,
        };
        const to = {
          x: this.rootBasePosition.x + sceneTarget.x,
          z: this.rootBasePosition.z + sceneTarget.z,
          scale: this.rootBaseScale.x * sceneTarget.scale,
          rotationY: sceneTarget.rotationY,
          walkRotationY: Number.isFinite(sceneTarget.walkRotationY) ? sceneTarget.walkRotationY : sceneTarget.rotationY,
        };
        // 走路時使用線性插值 (Linear) 以貼合等速步行動畫；一般位移使用 ease-out cubic
        const ease = isWalking ? ((p) => p) : ((p) => 1 - Math.pow(1 - p, 3));
        const step = (now) => {
          if (token !== this.sceneMoveToken) return;
          const p = this.clamp((now - start) / duration, 0, 1);
          const moveT = isWalking ? this.clamp((p - 0.18) / 0.72, 0, 1) : ease(p);
          const walkTurnT = isWalking ? (1 - Math.pow(1 - this.clamp(p / 0.24, 0, 1), 3)) : moveT;
          const finalTurnT = isWalking ? (1 - Math.pow(1 - this.clamp((p - 0.72) / 0.28, 0, 1), 3)) : 1;
          root.position.x = from.x + (to.x - from.x) * moveT;
          root.position.z = from.z + (to.z - from.z) * moveT;
          root.position.y = this.rootBasePosition.y;
          const scale = from.scale + (to.scale - from.scale) * moveT;
          root.scale.setScalar(scale);
          const walkFacing = from.rotationY + this.shortestAngleDelta(from.rotationY, to.walkRotationY) * walkTurnT;
          root.rotation.y = walkFacing + this.shortestAngleDelta(walkFacing, to.rotationY) * finalTurnT;
          if (p < 1) {
            requestAnimationFrame(step);
          }
        };
        requestAnimationFrame(step);
      }

      nudgeContact(event = {}, propLayer = null) {
        const root = this.getSceneRoot();
        const propWorld = propLayer?.getPropWorldPosition?.(event.prop);
        if (!root || !propWorld) return false;

        const dx = propWorld.x - root.position.x;
        const dz = propWorld.z - root.position.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = dx / len;
        const nz = dz / len;
        const action = event.sceneAction || 'touch';
        const isStrike = action === 'punch' || action === 'kick-away' || action === 'kick-back';
        const isCrouch = event.animation === 'crouch_touch' || event.contactStyle === 'crouch';
        const distance = isStrike ? 0.13 : (isCrouch ? 0.075 : 0.06);
        const token = ++this.sceneMoveToken;
        const start = performance.now();
        const duration = isStrike ? 520 : 620;
        const from = {
          x: root.position.x,
          y: root.position.y,
          z: root.position.z,
          rotationY: root.rotation.y,
        };
        const touch = {
          x: from.x + nx * distance,
          y: from.y,
          z: from.z + nz * distance,
          rotationY: this.facingRotationFor(from.x, from.z, propWorld.x, propWorld.z),
        };
        const ease = (p) => p < 0.5
          ? 4 * p * p * p
          : 1 - Math.pow(-2 * p + 2, 3) / 2;
        const step = (now) => {
          if (token !== this.sceneMoveToken) return;
          const p = this.clamp((now - start) / duration, 0, 1);
          const forward = p < 0.46;
          const local = forward ? p / 0.46 : (p - 0.46) / 0.54;
          const t = ease(local);
          const a = forward ? from : touch;
          const b = forward ? touch : from;
          root.position.x = a.x + (b.x - a.x) * t;
          root.position.y = a.y + (b.y - a.y) * t;
          root.position.z = a.z + (b.z - a.z) * t;
          root.rotation.y = a.rotationY + this.shortestAngleDelta(a.rotationY, b.rotationY) * t;
          if (p < 1) {
            requestAnimationFrame(step);
          }
        };
        requestAnimationFrame(step);
        return true;
      }

      async moveTo(target = {}, options = {}) {
        const canvas = this.getCanvas();
        if (!canvas) return 80;
        const rect = this.container.getBoundingClientRect();
        const compact = rect.width < 640;
        const next = {
          x: Number.isFinite(target.x) ? target.x : 0,
          y: Number.isFinite(target.y) ? target.y : 0,
          scale: Number.isFinite(target.scale) ? target.scale : 1,
          roomPath: target.roomPath || 'center',
        };

        const x = next.x * (compact ? 0.42 : 1);
        const y = next.y * (compact ? 0.5 : 1);
        const scale = compact ? Math.min(next.scale, 1.035) : next.scale;

        const dx = next.x - (this.position?.x ?? 0);
        const dy = next.y - (this.position?.y ?? 0);
        const distance = Math.hypot(dx, dy);

        let root = this.getSceneRoot();
        if (!root && options.forceWalk === true) {
          root = await this.waitForSceneRoot(900);
        }
        let sceneTarget = null;
        let distance3d = 0;
        let finalRotationY = null;
        let walkRotationY = null;
        if (root && this.rootBasePosition) {
          const preliminaryTarget = this.sceneTargetFor(next, compact, scale);
          const targetX = this.rootBasePosition.x + preliminaryTarget.x;
          const targetZ = this.rootBasePosition.z + preliminaryTarget.z;
          const faceWorld = options.faceWorld || null;
          const faceX = Number.isFinite(faceWorld?.x) ? faceWorld.x : targetX;
          const faceZ = Number.isFinite(faceWorld?.z) ? faceWorld.z : targetZ;
          walkRotationY = this.facingRotationFor(root.position.x, root.position.z, targetX, targetZ);
          finalRotationY = Number.isFinite(faceWorld?.x) || Number.isFinite(faceWorld?.z)
            ? this.facingRotationFor(targetX, targetZ, faceX, faceZ)
            : walkRotationY;
          sceneTarget = this.sceneTargetFor(next, compact, scale, finalRotationY, walkRotationY);
          distance3d = Math.hypot(targetX - root.position.x, targetZ - root.position.z);
        }

        let duration = 1150;
        let isWalking = false;

        const forcedWalk = options.forceWalk === true && (distance3d > 0.002 || distance > 1);
        if (this.mascot && (forcedWalk || (root && distance3d > 0.006) || distance > 2)) {
          isWalking = true;
          if (root && this.rootBasePosition) {
            const walkSpeed = this.mascot.motion?.getWalkSpeed?.() || 0.85;
            duration = (distance3d / walkSpeed) * 1000;
            // 走路展示寧可稍慢，讓腳步讀得出來，不像 canvas 直接平移。
            duration = Math.max(850, Math.min(2400, duration));
          } else {
            // 非 3D 模式的後備計算
            duration = Math.max(400, Math.min(1800, (distance / 110) * 1000));
          }

          await this.mascot.motion?.play?.('walk_cycle');
          if (this.walkTimeout) {
            window.clearTimeout(this.walkTimeout);
          }
          this.walkTimeout = window.setTimeout(() => {
            if (this.mascot.motion?.currentAction === 'walk_cycle') {
              this.mascot.motion?.play?.('idle');
            }
          }, duration);
        }

        if (root) {
          canvas.style.transition = 'none';
          canvas.style.transform = 'none';
          this.animateSceneRoot(root, sceneTarget || this.sceneTargetFor(next, compact, scale, finalRotationY), duration, isWalking);
        } else {
          const easing = isWalking ? 'linear' : 'cubic-bezier(.2,.82,.22,1)';
          canvas.style.transition = `transform ${duration}ms ${easing}`;
          canvas.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
        }
        this.updateShadow(x, y, scale, next.roomPath);
        this.dropFootprints(x, y, scale);
        this.position = next;

        return duration;
      }

      updateShadow(x, y, scale, roomPath) {
        if (!this.shadow) return;
        this.shadow.dataset.roomPath = roomPath;
        this.shadow.style.transform = `translate(-50%, 0) translate(${x}px, ${y * 0.18}px) scale(${scale})`;
      }

      dropFootprints(x, y, scale) {
        if (!this.footprintLayer) return;
        for (const side of [-1, 1]) {
          const print = document.createElement('span');
          print.className = 'footprint';
          const offset = side * (18 + (this.stepIndex % 2) * 5) * scale;
          print.style.left = `calc(50% + ${x + offset}px)`;
          print.style.bottom = `calc(15% - ${y * 0.16}px)`;
          print.style.setProperty('--rot', `${side * 12}deg`);
          this.footprintLayer.appendChild(print);
          window.setTimeout(() => print.remove(), 5200);
        }
        this.stepIndex++;
      }

      reset(options = {}) {
        const next = { x: 0, y: 0, scale: 1, roomPath: 'center' };
        if (options.instant) {
          const root = this.getSceneRoot();
          const canvas = this.getCanvas();
          if (root && this.rootBasePosition && this.rootBaseScale) {
            root.position.copy(this.rootBasePosition);
            root.scale.copy(this.rootBaseScale);
            root.rotation.y = this.rootBaseRotationY;
          }
          if (canvas) {
            canvas.style.transition = 'none';
            canvas.style.transform = 'none';
          }
          this.updateShadow(0, 0, 1, 'center');
          this.position = next;
          return 0;
        }
        return this.moveTo(next);
      }
    }

    class GazeDirector {
      constructor(stage, mascot, propLayer) {
        this.stage = stage;
        this.mascot = mascot;
        this.propLayer = propLayer;
        this.lockedProp = null;
        this.fallbackPoint = { x: 0, y: 0 };
        this.mouseOverrideUntil = 0;
        this.animationId = requestAnimationFrame(() => this.update());
      }

      focusEvent(event = {}) {
        this.lockedProp = event.prop || null;
        this.fallbackPoint = event.gaze || { x: 0, y: 0 };
        this.update(true);
      }

      handleMouseMove(event) {
        this.mouseOverrideUntil = performance.now() + 1150;
        this.mascot?.lookAt?.setTarget?.('mouse');
        this.mascot?.handleMouseMove?.(event);
      }

      update(force = false) {
        const now = performance.now();
        if (this.mascot && (force || now >= this.mouseOverrideUntil)) {
          if (this.lockedProp) {
            const point = this.propLayer?.getLookAtPoint?.(this.lockedProp, this.fallbackPoint) || this.fallbackPoint;
            this.mascot.lookAt?.setTarget?.('point', point);
          } else {
            this.mascot.lookAt?.setTarget?.('point', this.fallbackPoint);
          }
        }
        if (!force) {
          this.animationId = requestAnimationFrame(() => this.update());
        }
      }

      dispose() {
        if (this.animationId) {
          cancelAnimationFrame(this.animationId);
        }
      }
    }

    class ToyRoomStory {
      constructor(stats) {
        this.stats = stats;
      }

      build() {
        return [
          {
            topic: 'release',
            prop: 'releaseCore',
            storyBeat: 'Chapter 1 / The door opens',
            label: '闖進玩具房',
            directive: 'Alicia runs into the toy room and claims the first toy.',
            intent: 'greeting',
            motion: 'wave',
            animation: 'crouch_touch',
            sceneAction: 'touch',
            walkTo: { x: -125, y: 54, scale: 1.07, roomPath: 'front-left' },
            text: `這裡是我的玩具房。第一顆藍色 core 歸我，我先摸一下，版本 ${this.stats.version} 也順便確認。`,
            gaze: { x: -0.5, y: 0.14 },
            marker: { left: '27%', bottom: '31%' },
          },
          {
            topic: 'motion',
            prop: 'motionOrb',
            storyBeat: 'Chapter 2 / Orbiting the strange orb',
            label: '繞著 motion orb 碎念',
            directive: 'Alicia circles the motion orb and talks to it like it is alive.',
            intent: 'searching',
            motion: 'dance_short',
            animation: 'walk_cycle',
            sceneAction: 'orbit',
            walkTo: { x: -104, y: -54, scale: 0.98, roomPath: 'back-left-loop' },
            text: `你這顆紫色球球有 ${this.stats.semanticFamilyCount} 組語意動作，這版還多吃了 ${this.stats.showcaseEventCount} 筆採礦展示事件。乖一點，把有料的動作都吐出來。`,
            gaze: { x: -0.32, y: -0.16 },
            marker: { left: '38%', bottom: '23%' },
          },
          {
            topic: 'target',
            prop: 'warningTarget',
            storyBeat: 'Chapter 3 / First punch',
            label: '衝過去揍 target',
            directive: 'Alicia crosses the room and punches the target dummy.',
            intent: 'warning',
            motion: 'punch_short',
            animation: 'punch_forward',
            sceneAction: 'punch',
            kickDirection: 1,
            walkTo: { x: 104, y: -54, scale: 1.04, roomPath: 'back-right-cut' },
            text: '紅色 target 看起來最欠揍。我先繞到它旁邊，對它講話，然後直接一拳。',
            gaze: { x: 0.48, y: -0.1 },
            marker: { left: '70%', bottom: '25%' },
            tone: 'hot',
          },
          {
            topic: 'target',
            prop: 'warningTarget',
            storyBeat: 'Chapter 4 / Kick it away',
            label: '把 target 踢到旁邊',
            directive: 'Alicia kicks the target dummy out of the ring.',
            intent: 'success',
            motion: 'punch_short',
            animation: 'kick_forward',
            sceneAction: 'kick-away',
            kickDirection: 1,
            followUpMotionId: 'hands_up_surrender',
            walkTo: { x: 108, y: -54, scale: 1.06, roomPath: 'right-front-strike' },
            text: '一拳不夠。我要把它踢到旁邊，讓它知道玩具房是誰在管。',
            gaze: { x: 0.5, y: -0.12 },
            marker: { left: '74%', bottom: '25%' },
            tone: 'hot',
          },
          {
            topic: 'assets',
            prop: 'assetCrate',
            storyBeat: 'Chapter 5 / Calmly checks the crate',
            label: '假裝乖巧檢查箱子',
            directive: 'Alicia pretends to be calm and taps the asset crate.',
            intent: 'success',
            motion: 'victory',
            animation: 'crouch_touch',
            sceneAction: 'touch',
            walkTo: { x: 120, y: 45, scale: 1.06, roomPath: 'front-right' },
            text: `好啦，我也會乖。這箱 asset 有 ${this.stats.assetCount} 個檔案，我摸一下，沒壞。`,
            gaze: { x: 0.5, y: 0.1 },
            marker: { left: '66%', bottom: '36%' },
          },
          {
            topic: 'cake',
            prop: 'birthdayCake',
            storyBeat: 'Chapter 6 / Birthday Celebration',
            label: '許願吃蛋糕',
            directive: 'Alicia celebrates her birthday with a lovely cake.',
            intent: 'success',
            motion: 'idle',
            animation: 'thinking',
            walkTo: { x: 0, y: -25, scale: 1.05, roomPath: 'center' },
            text: '哇！是生日蛋糕耶！上面還有蠟燭，太精緻了吧。讓我許個願，嗯...讓我想想...',
            gaze: { x: 0, y: -0.22 },
            marker: { left: '50%', bottom: '38%' },
          },
        ];
      }
    }

    class AutoDirector {
      constructor(mascot, propLayer, walker, gazeDirector = null) {
        this.mascot = mascot;
        this.propLayer = propLayer;
        this.walker = walker;
        this.gazeDirector = gazeDirector;
        this.auto = true;
        this.timer = null;
        this.lastIndex = -1;
        this.storyQueue = [];
        this.isExecuting = false;
        this.story = new ToyRoomStory(releaseStats);
        this.storyEvents = this.story.build();
        this.storyIndex = 0;
        this.motionEvents = showcaseEvents.length > 0
          ? showcaseEvents.map(buildShowcaseEvent)
          : motionCatalog.map(buildMotionEvent);
        this.events = [
          ...this.storyEvents,
          ...this.motionEvents,
          {
            topic: 'release',
            prop: 'releaseCore',
            label: 'Inspect release.json',
            directive: 'Alicia is scanning release metadata.',
            intent: 'explain',
            motion: 'presenting',
            animation: 'crouch_touch',
            sceneAction: 'touch',
            walkTo: { x: -125, y: 54, scale: 1.05 },
            text: `我先走到 release core 旁邊摸一下。版本 ${releaseStats.version}，build date ${releaseStats.builtAt}，這個 release 有站穩。`,
            gaze: { x: -0.5, y: 0.16 },
            marker: { left: '31%', bottom: '42%' },
          },
          {
            topic: 'assets',
            prop: 'assetCrate',
            label: 'Count shipped assets',
            directive: 'Alicia is sorting the packaged assets.',
            intent: 'success',
            motion: 'victory',
            animation: 'crouch_touch',
            sceneAction: 'touch',
            walkTo: { x: 120, y: 45, scale: 1.05 },
            text: `我走到 asset crate 旁邊清點。這包有 ${releaseStats.assetCount} 個 asset，其中 ${releaseStats.motionAssetCount} 個是 motion asset。`,
            gaze: { x: 0.5, y: 0.1 },
            marker: { left: '66%', bottom: '41%' },
          },
          {
            topic: 'motion',
            prop: 'motionOrb',
            label: 'Think about future verbs',
            directive: 'Alicia is planning scene verbs for GLB objects.',
            intent: 'explain',
            motion: 'idle',
            actState: 'thinking',
            animation: 'curious_peek',
            walkTo: { x: -97, y: -45, scale: 1.04 },
            text: `目前 semantic library 有 ${releaseStats.semanticFamilyCount} 組動作語意，showcase pack 有 ${releaseStats.showcaseEventCount} 筆人工描述事件。下一階段可以把這些事件變成真正的 VRMA playback。`,
            gaze: { x: -0.35, y: -0.18 },
            marker: { left: '36%', bottom: '24%' },
          },
          {
            topic: 'target',
            prop: 'warningTarget',
            label: 'Warn the test target',
            directive: 'Alicia found a suspicious target.',
            intent: 'warning',
            motion: 'warning_nod',
            animation: 'hands_waist',
            sceneAction: 'touch',
            walkTo: { x: 104, y: -54, scale: 1.06 },
            text: '這個紅色 test target 很可疑。我先走近、插腰、碰一下它，下一拍就可以踢開。',
            gaze: { x: 0.45, y: -0.12 },
            marker: { left: '68%', bottom: '23%' },
            tone: 'hot',
          },
          {
            topic: 'target',
            prop: 'warningTarget',
            label: 'Bonk rehearsal',
            directive: 'Alicia is rehearsing object interaction.',
            intent: 'success',
            motion: 'punch_short',
            animation: 'kick_forward',
            sceneAction: 'kick-away',
            kickDirection: 1,
            followUpMotionId: 'hands_up_surrender',
            walkTo: { x: 108, y: -54, scale: 1.06 },
            text: '鎖定、靠近、出腳。這次我真的把 target dummy 踢到旁邊，等一下再去踢回來。',
            gaze: { x: 0.48, y: -0.08 },
            marker: { left: '70%', bottom: '24%' },
            tone: 'hot',
          },
          {
            topic: 'assets',
            prop: 'assetCrate',
            label: 'Patrol around the package',
            directive: 'Alicia is walking the release perimeter.',
            intent: 'searching',
            motion: 'dance_short',
            animation: 'walk_cycle',
            sceneAction: 'touch',
            walkTo: { x: -50, y: 20, scale: 1.03 },
            text: '我沿著模型圈巡場，走一圈、摸一下道具、再換下一個目標。這才比較像活在 Three.js 場景裡。',
            gaze: { x: 0.18, y: 0 },
            marker: { left: '52%', bottom: '31%' },
          },
        ];
      }

      start() {
        this.setAuto(true);
        this.runEvent(this.nextStoryEvent(), 'story');
      }

      setAuto(flag) {
        this.auto = !!flag;
        if (directorToggle) {
          directorToggle.textContent = this.auto ? 'Auto ON' : 'Auto OFF';
        }
        window.clearTimeout(this.timer);
        this.timer = null;
        if (this.auto) {
          this.scheduleNext();
        }
      }

      scheduleNext() {
        if (!this.auto) return;
        window.clearTimeout(this.timer);
        const delay = 4600 + Math.random() * 4200;
        this.timer = window.setTimeout(() => this.runRandom('auto'), delay);
      }

      pickEvent(topic = null) {
        if (!topic && this.storyQueue.length > 0) {
          return this.storyQueue.shift();
        }
        if (!topic && this.storyEvents.length > 0 && Math.random() < 0.68) {
          return this.nextStoryEvent();
        }
        const pool = (topic
          ? this.events.filter((event) => event.topic === topic)
          : this.events
        ).filter((event) => !event.followUpOnly);
        if (pool.length === 0) return this.events[0];
        let event = pool[Math.floor(Math.random() * pool.length)];
        if (!topic && this.events.length > 1) {
          let guard = 0;
          while (this.events.indexOf(event) === this.lastIndex && guard < 8) {
            event = pool[Math.floor(Math.random() * pool.length)];
            guard++;
          }
        }
        this.lastIndex = this.events.indexOf(event);
        return event;
      }

      nextStoryEvent() {
        const event = this.storyEvents[this.storyIndex % this.storyEvents.length];
        this.storyIndex++;
        this.lastIndex = this.events.indexOf(event);
        return event;
      }

      async runRandom(source = 'manual') {
        return this.runEvent(this.pickEvent(), source);
      }

      async runTopic(topic) {
        return this.runEvent(this.pickEvent(topic), 'dom_card');
      }

      async runMotion(id) {
        const event = this.motionEvents.find((item) => item.semanticMotionId === id);
        return this.runEvent(event || this.pickEvent('motion'), 'motion_showcase');
      }

      policyStateFor(event) {
        if (event.actState) return event.actState;
        if (event.intent === 'success') return 'success';
        if (event.intent === 'warning') return 'warning';
        if (event.intent === 'error') return 'failed';
        if (event.intent === 'searching') return 'running';
        if (event.intent === 'greeting') return 'done';
        return 'pending';
      }

      emotionFor(event) {
        if (event.emotion) return event.emotion;
        if (event.intent === 'warning') return 'angry';
        if (event.intent === 'error') return 'sorrow';
        if (event.intent === 'searching') return 'fun';
        return 'joy';
      }

      playCustomAnimation(name) {
        const animationData = buildCustomAnimation(name, this.mascot);
        if (!animationData) return false;
        this.mascot.motion?.playCustom?.(animationData, { loop: false });
        return true;
      }

      queueFollowUp(event) {
        if (!event.followUpMotionId) return;
        const followUp = this.motionEvents.find((item) => item.semanticMotionId === event.followUpMotionId);
        if (followUp) {
          this.storyQueue.push(followUp);
        }
      }

      async runEvent(event, source) {
        if (!event || !this.mascot) return;
        this.isExecuting = true;
        try {
          window.clearTimeout(this.timer);
          setCheck('intent', 'wait', 'RUN');
          setSceneFocus(event);
          setMotionFocus(event);
          this.propLayer?.focus(event.prop);
          const faceWorld = this.propLayer?.getPropWorldPosition?.(event.prop) || null;
          const travelDuration = this.walker
            ? await this.walker.moveTo(event.walkTo || { x: 0, y: 0, scale: 1 }, {
                faceWorld,
                forceWalk: Boolean(event.walkTo),
              })
            : 80;
          if (this.gazeDirector) {
            this.gazeDirector.focusEvent(event);
          } else {
            this.mascot.lookAt?.setTarget?.('point', event.gaze || { x: 0, y: 0 });
          }
          this.mascot.clearQueue?.();
          appendLog(`${source}: ${event.label} @ ${event.walkTo?.roomPath || 'center'}`);
          await sleep(event.walkTo ? travelDuration : 80);

          if (event.topic === 'cake') {
            // Custom cake event sequence!
            this.mascot.act?.('thinking', {
              trigger: 'birthday_cake_thinking',
              selectedFeature: false,
              source: 'scene_playground',
            });
            this.mascot.dispatch?.('talking', {
              text: '哇！是生日蛋糕耶！上面還有蠟燭，太精緻了吧。讓我許個願，嗯...讓我想想...',
              emotion: 'joy',
            });
            await sleep(2500);

            this.mascot.triggerGesture?.('touch_face');
            if (window.autoDirectorLite) {
              window.autoDirectorLite.notifyManualGesture('touch_face');
            }
            this.mascot.dispatch?.('talking', {
              text: '許什麼願好呢？對了！希望大家天天開心，寫 code 都沒有 bug！',
              emotion: 'joy',
            });
            await sleep(3500);

            this.mascot.triggerGesture?.('stretch');
            if (window.autoDirectorLite) {
              window.autoDirectorLite.notifyManualGesture('stretch');
            }
            this.mascot.dispatch?.('talking', {
              text: '呼～祝我生日快樂！願望一定會實現的！',
              emotion: 'joy',
            });
            await sleep(4500);

            this.mascot.act?.('success', {
              trigger: 'birthday_cake_success',
              selectedFeature: false,
              source: 'scene_playground',
            });
            this.mascot.dispatch?.('talking', {
              text: '好耶！吹熄蠟燭，呼～！',
              emotion: 'joy',
            });
            await sleep(2500);
          } else {
            this.mascot.act?.(this.policyStateFor(event), {
              trigger: event.semanticMotionId || event.label,
              selectedFeature: event.topic !== 'release',
              source: 'scene_playground',
            });
            await sleep(80);
            this.mascot.dispatch?.('talking', {
              text: event.text,
              emotion: this.emotionFor(event),
            });
            if (event.animation) {
              await sleep(160);
              const played = this.playCustomAnimation(event.animation);
              appendLog(`${played ? 'pose' : 'pose-missing'}: ${event.animation}`);
            }
            if (event.sceneAction) {
              await sleep(220);
              const contact = this.walker?.nudgeContact?.(event, this.propLayer);
              const acted = this.propLayer?.runSceneAction?.(event);
              appendLog(`${acted ? 'scene' : 'scene-missing'}: ${event.sceneAction} ${event.prop}${contact ? ' + contact' : ''}`);
            }
          }
          this.queueFollowUp(event);
          await sleep(320);
          setCheck('intent', 'ok', 'OK');
          refreshConsoleStatus();
          this.scheduleNext();
        } finally {
          this.isExecuting = false;
        }
      }
    }

    try {
      const runtime = await import('./alicia-runtime.js');
      setCheck('runtime', 'ok', 'OK');
      appendLog('alicia-runtime.js loaded');

      const mascot = new runtime.VrmMascot(stage, {
        semanticMotionLibraryUrl: urls.semanticMotionLibrary,
        enableTts: ttsToggle?.checked ?? false,
      });

      // TTS 即時切換
      ttsToggle?.addEventListener('change', () => {
        mascot._enableTts = ttsToggle.checked;
      });
      window.alicia = mascot;

      mascot.state.onSay = setBubble;
      mascot.onFpsUpdate = (fps) => {
        field('fps').textContent = String(fps);
      };
      mascot.onLoadProgress = (pct) => {
        setCheck('model', 'wait', `${pct}%`);
      };
      mascot.onLoadError = (error) => {
        setCheck('model', 'fail', 'FAIL');
        appendLog(`model load failed: ${error?.message || error}`);
      };
      mascot.onIntentUpdate = (info) => {
        field('currentIntent').textContent = info.currentIntent || 'idle';
        field('queueLength').textContent = String(info.queueLength ?? 0);
      };

      const propLayer = new ScenePropLayer(stage, mascot);
      window.aliciaPropLayer = propLayer;

      await mascot.load(urls.model);
      mascot.enableHumanization?.({ profile: 'alicia', level: 4 });
      configureDemoCamera(mascot);
      // 模型檔載入完成後，仍保留幾個 render frame 給材質與第一張畫面完成。
      await sleep(600);
      const walker = new AliciaStageWalker(stage, mascot);
      window.aliciaWalker = walker;
      await walker.waitForSceneRoot();
      walker.reset({ instant: true });
      await sleep(120);
      const gazeDirector = new GazeDirector(stage, mascot, propLayer);
      window.aliciaGazeDirector = gazeDirector;
      setCheck('model', 'ok', 'OK');
      enableDirectorButtons(true);
      enableMotionPills(true);
      setCheck('intent', 'ok', 'OK');
      updateVisibleCheck();
      refreshConsoleStatus();
      appendLog('models/mascot.vrm loaded');
      appendLog(`motion showcase loaded: ${motionCatalog.length} families / ${motionAssets.length} assets / ${showcaseEvents.length} mined events`);

      const director = new AutoDirector(mascot, propLayer, walker, gazeDirector);
      window.aliciaDirector = director;
      if (noAutoDirector) {
        director.setAuto(false);
        appendLog('auto director disabled by query flag');
      } else {
        director.start();
      }

      const autoDirectorLite = new AutoDirectorLite({
        touchFaceIntervalSec: 90,
        stretchIntervalSec: 180,
        gestureCooldownSec: 8
      });
      window.autoDirectorLite = autoDirectorLite;

      let lastTime = performance.now();
      function tickAutoDirectorLite() {
        const now = performance.now();
        const dt = (now - lastTime) / 1000;
        lastTime = now;

        if (window.alicia && window.aliciaDirector) {
          const m = window.alicia;
          const d = window.aliciaDirector;
          autoDirectorLite.configure({
            enabled: d.auto && !d.isExecuting,
            level: 4
          });
          autoDirectorLite.update(dt, {
            playgroundActive: true,
            currentAction: m.motion?.currentAction || 'idle',
            isVrmaActive: m.motion?.isVrmaActive || false,
            activeGesture: m.humanMotion?.debugState?.activeGesture || null,
            onGesture: (name) => {
              m.triggerGesture?.(name);
              autoDirectorLite.notifyManualGesture(name);
            }
          });
        }
        requestAnimationFrame(tickAutoDirectorLite);
      }
      requestAnimationFrame(tickAutoDirectorLite);

      directorToggle?.addEventListener('click', () => {
        director.setAuto(!director.auto);
        appendLog(`auto director ${director.auto ? 'enabled' : 'paused'}`);
      });
      directorTrigger?.addEventListener('click', () => {
        director.runRandom('button');
      });
      for (const card of toyCards) {
        card.addEventListener('click', () => {
          director.runTopic(card.dataset.topic);
        });
      }
      for (const pill of motionPills) {
        pill.addEventListener('click', () => {
          director.runMotion(pill.dataset.motionId);
        });
      }
    } catch (error) {
      setCheck('runtime', 'fail', 'FAIL');
      appendLog(`runtime failed: ${error?.message || error}`);
      console.error(error);
    }

    stage.addEventListener('mousemove', (event) => {
      window.aliciaGazeDirector?.handleMouseMove?.(event);
    });
  </script>
</body>
</html>
