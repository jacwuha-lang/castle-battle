export const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const ease = v => { const x = clamp(v); return x * x * (3 - 2 * x); };
export const mix = (a, b, t) => a + (b - a) * clamp(t);

// 每个动作的蓄力、出手、命中与收势有独立关键帧；关节间共享时间而非共享角度。
export function samplePose(pose, keys, frames, progress) {
  const k = clamp(progress);
  let i = 0;
  while (i < frames.length - 2 && k > frames[i + 1][0]) i++;
  const a = frames[i], b = frames[i + 1], h = b[0] - a[0], f = clamp((k - a[0]) / h);
  const f2 = f * f, f3 = f2 * f;
  const tangent = (left, point, right, n) => {
    if (!left || !right) return 0;
    const va = (point[n] - left[n]) / (point[0] - left[0]), vb = (right[n] - point[n]) / (right[0] - point[0]);
    return va * vb > 0 ? 2 * va * vb / (va + vb) : 0;
  };
  // 单调三次插值：经过中间姿势时保留速度，蓄力停顿仍由重复关键帧明确表达。
  keys.forEach((key, n) => {
    const j = n + 1, va = tangent(frames[i - 1], a, b, j), vb = tangent(a, b, frames[i + 2], j);
    pose[key] = (2*f3 - 3*f2 + 1)*a[j] + (f3 - 2*f2 + f)*h*va + (-2*f3 + 3*f2)*b[j] + (f3 - f2)*h*vb;
  });
}
