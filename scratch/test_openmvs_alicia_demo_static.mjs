import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("openmvs_alicia_demo.html", "utf8");

for (const required of [
  "data/model.glb",
  "models/mascot.vrm",
  "davinci2_walking.vrma",
  "davinci3_standardRun.vrma",
  "davinci3_twistDance.vrma",
  "WASD",
  "floorMode: 'center-y-plane'",
  "root.rotation.x = Math.PI",
  "sceneUpFix: 'rotate-x-180'",
  "controls.maxPolarAngle = Math.PI * 0.48",
  "vrm.scene.rotation.y = Math.atan2(move.x, move.z) + Math.PI",
  "if (!onGround)",
  "sanitizeClip",
]) {
  assert.ok(html.includes(required), `missing ${required}`);
}

for (const forbidden of [
  "controls.target.lerp(target",
  "camera.position.lerp(desired",
]) {
  assert.ok(!html.includes(forbidden), `unexpected camera follow code: ${forbidden}`);
}

for (const path of [
  "data/model.glb",
  "models/mascot.vrm",
  "motions/showcase/davinci2_walking.vrma",
  "motions/showcase/davinci3_standardRun.vrma",
  "local_assets/vrma/external/davinci_3dchat_batch3/davinci3_twistDance.vrma",
]) {
  assert.ok(fs.existsSync(path), `missing asset ${path}`);
}

console.log("test_openmvs_alicia_demo_static: ok");
