export const CHARACTER_INSPECTOR_SECTIONS = [
  { id: 'pose', label: '姿勢', subtitle: 'Base Pose', enabled: true },
  { id: 'expression', label: '表情', subtitle: 'Expression Debug', enabled: false },
  { id: 'lookAt', label: '視線', subtitle: 'LookAt Debug', enabled: false },
  { id: 'motion', label: '動作', subtitle: 'Motion Debug', enabled: false },
];

export const CHARACTER_INSPECTOR_BONE_GROUPS = {
  center: { label: '重心', bones: ['hips'] },
  body: { label: '身體', bones: ['spine', 'chest'] },
  arms: { label: '手臂', bones: ['leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm'] },
  hands: { label: '手腕', bones: ['leftHand', 'rightHand'] },
};

export const CHARACTER_INSPECTOR_BONE_LABELS = {
  hips: '重心 hips',
  spine: '脊椎 spine',
  chest: '胸口 chest',
  leftUpperArm: '左上臂 leftUpperArm',
  rightUpperArm: '右上臂 rightUpperArm',
  leftLowerArm: '左前臂 leftLowerArm',
  rightLowerArm: '右前臂 rightLowerArm',
  leftHand: '左手 leftHand',
  rightHand: '右手 rightHand',
};

export function getInspectorBoneLabel(bone) {
  return CHARACTER_INSPECTOR_BONE_LABELS[bone] || bone;
}

export function getInspectorBonesForGroup(groupId) {
  const group = CHARACTER_INSPECTOR_BONE_GROUPS[groupId];
  if (group) return [...group.bones];
  return Object.values(CHARACTER_INSPECTOR_BONE_GROUPS).flatMap(item => item.bones);
}
