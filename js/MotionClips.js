const DEG = Math.PI / 180;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function easeInOut(t) {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function pulse(t, start = 0, end = 1) {
  const x = clamp01((t - start) / Math.max(0.0001, end - start));
  return Math.sin(x * Math.PI);
}

function holdFade(t, riseEnd = 0.22, fallStart = 0.76) {
  if (t < riseEnd) return easeInOut(t / riseEnd);
  if (t > fallStart) return easeInOut((1 - t) / (1 - fallStart));
  return 1;
}

export const MOTION_CLIP_NAMES = Object.freeze([
  'wave',
  'victory',
  'warning_nod',
  'shake_head',
  'dance_short',
  'punch_short',
]);

export const MotionClips = Object.freeze({
  wave: {
    duration: 1200,
    apply(ctx, t) {
      const lift = holdFade(t, 0.24, 0.72);
      const wave = Math.sin(t * Math.PI * 8) * pulse(t, 0.18, 0.86);

      ctx.rotate('rightUpperArm', {
        x: 12 * DEG * lift,
        y: -4 * DEG * lift,
        z: -68 * DEG * lift + wave * 6 * DEG,
      });
      ctx.rotate('rightLowerArm', {
        y: 48 * DEG * lift + wave * 8 * DEG,
      });
      ctx.rotate('rightHand', {
        z: wave * 10 * DEG,
      });
      ctx.rotate('spine', {
        z: -2 * DEG * lift,
      });
    },
  },

  victory: {
    duration: 1000,
    apply(ctx, t) {
      const lift = holdFade(t, 0.22, 0.72);
      const bounce = pulse(t, 0.12, 0.9);

      ctx.rotate('leftUpperArm', {
        x: 6 * DEG * lift,
        z: 36 * DEG * lift,
      });
      ctx.rotate('rightUpperArm', {
        x: 6 * DEG * lift,
        z: -36 * DEG * lift,
      });
      ctx.rotate('leftLowerArm', {
        y: -22 * DEG * lift,
      });
      ctx.rotate('rightLowerArm', {
        y: 22 * DEG * lift,
      });
      ctx.rotate('leftHand', {
        z: -8 * DEG * lift,
      });
      ctx.rotate('rightHand', {
        z: 8 * DEG * lift,
      });
      ctx.rotate('spine', {
        x: -3 * DEG * lift,
      });
      ctx.move('hips', {
        y: 0.014 * bounce,
      });
    },
  },

  warning_nod: {
    duration: 900,
    apply(ctx, t) {
      const intensity = holdFade(t, 0.16, 0.72);
      const nod = Math.sin(t * Math.PI * 3) * intensity;

      ctx.rotate('spine', {
        x: 6 * DEG * intensity + nod * 3 * DEG,
        z: Math.sin(t * Math.PI * 2) * 1.4 * DEG * intensity,
      });
      ctx.rotate('chest', {
        x: 4 * DEG * intensity + nod * 2 * DEG,
      });
      ctx.rotate('leftUpperArm', {
        z: 14 * DEG * intensity,
      });
      ctx.rotate('rightUpperArm', {
        z: -14 * DEG * intensity,
      });
      ctx.rotate('leftLowerArm', {
        y: -20 * DEG * intensity,
      });
      ctx.rotate('rightLowerArm', {
        y: 20 * DEG * intensity,
      });
    },
  },

  shake_head: {
    duration: 800,
    apply(ctx, t) {
      const intensity = holdFade(t, 0.16, 0.68);
      const sway = Math.sin(t * Math.PI * 5) * intensity;

      ctx.rotate('spine', {
        x: 2 * DEG * intensity,
        z: sway * 3.5 * DEG,
      });
      ctx.rotate('chest', {
        y: sway * 7 * DEG,
      });
      ctx.rotate('leftUpperArm', {
        z: 8 * DEG * intensity,
      });
      ctx.rotate('rightUpperArm', {
        z: -8 * DEG * intensity,
      });
    },
  },

  dance_short: {
    duration: 1600,
    apply(ctx, t) {
      const groove = Math.sin(t * Math.PI * 4);
      const beat = Math.abs(groove);
      const side = Math.sin(t * Math.PI * 2);

      ctx.rotate('spine', {
        x: 2 * DEG * beat,
        z: side * 7 * DEG,
      });
      ctx.rotate('chest', {
        y: -side * 4 * DEG,
      });
      ctx.move('hips', {
        x: side * 0.012,
        y: beat * 0.012,
      });
      ctx.rotate('leftUpperArm', {
        z: side * 18 * DEG + 8 * DEG,
      });
      ctx.rotate('rightUpperArm', {
        z: -side * 18 * DEG - 8 * DEG,
      });
      ctx.rotate('leftLowerArm', {
        y: Math.sin(t * Math.PI * 8) * 10 * DEG,
      });
      ctx.rotate('rightLowerArm', {
        y: -Math.sin(t * Math.PI * 8) * 10 * DEG,
      });
    },
  },

  punch_short: {
    duration: 700,
    apply(ctx, t) {
      const jab = pulse(t, 0.12, 0.86);
      const prep = holdFade(t, 0.18, 0.72);

      ctx.rotate('spine', {
        y: -4 * DEG * jab,
        z: 2 * DEG * jab,
      });
      ctx.rotate('chest', {
        y: -7 * DEG * jab,
      });
      ctx.rotate('rightUpperArm', {
        x: -18 * DEG * jab,
        y: -20 * DEG * jab,
        z: 20 * DEG * prep,
      });
      ctx.rotate('rightLowerArm', {
        y: 38 * DEG * jab,
      });
      ctx.rotate('rightHand', {
        x: -8 * DEG * jab,
      });
      ctx.rotate('leftUpperArm', {
        z: 6 * DEG * prep,
      });
    },
  },
});

export function getMotionClip(name) {
  return MotionClips[String(name || '')] || null;
}

export function isMotionClipName(name) {
  return !!getMotionClip(name);
}
