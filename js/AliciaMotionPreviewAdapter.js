export class AliciaMotionPreviewAdapter {
  constructor({ mascot } = {}) {
    this.mascot = mascot;
  }

  previewClip(clip) {
    if (!clip || clip.kind !== 'motion_clip_v1') {
      return { ok: false, reason: 'unsupported_clip' };
    }

    if (!this.mascot) {
      return { ok: false, reason: 'missing_mascot' };
    }

    if (typeof this.mascot.enableHumanization === 'function') {
      this.mascot.enableHumanization({ profile: 'alicia', level: 2 });
    }

    if (typeof this.mascot.motion?.play === 'function') {
      this.mascot.motion.play('walk_cycle');
    }

    return { ok: true, clipId: clip.id };
  }
}
