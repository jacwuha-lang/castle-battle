const DELAY = .085, MAX_SAMPLES = 9;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function observeMotion(unit, x, z, at) {
  const samples = unit.motionSamples || (unit.motionSamples = []);
  const last = samples[samples.length - 1];
  if (last && at <= last.at + .0001) { last.x = x; last.z = z; return; }
  samples.push({ x, z, at });
  if (samples.length > MAX_SAMPLES) samples.shift();
}

function slope(a, b, c, axis) {
  const left = (b[axis] - a[axis]) / (b.at - a.at), right = (c[axis] - b[axis]) / (c.at - b.at);
  if (left * right <= 0) return 0;
  return 2 * left * right / (left + right);
}

function segment(samples, i, time, axis) {
  const a = samples[i], b = samples[i + 1], h = b.at - a.at;
  const k = clamp((time - a.at) / h, 0, 1), v = (b[axis] - a[axis]) / h;
  const va = i ? slope(samples[i - 1], a, b, axis) : v;
  const vb = i + 2 < samples.length ? slope(a, b, samples[i + 2], axis) : v;
  const k2 = k * k, k3 = k2 * k;
  if (i > 0 && i + 2 < samples.length) {
    // 三次 B 样条平滑厘米取整的 20Hz 坐标，速度不会在每次快照边界重新起伏。
    const p0 = samples[i - 1][axis], p1 = a[axis], p2 = b[axis], p3 = samples[i + 2][axis];
    return {
      p: ((1-k)**3*p0 + (3*k3-6*k2+4)*p1 + (-3*k3+3*k2+3*k+1)*p2 + k3*p3) / 6,
      v: (-3*(1-k)**2*p0 + (9*k2-12*k)*p1 + (-9*k2+6*k+3)*p2 + 3*k2*p3) / (6*h),
    };
  }
  return {
    p: (2*k3 - 3*k2 + 1)*a[axis] + (k3 - 2*k2 + k)*h*va + (-2*k3 + 3*k2)*b[axis] + (k3 - k2)*h*vb,
    v: ((6*k2 - 6*k)*a[axis] + (3*k2 - 4*k + 1)*h*va + (-6*k2 + 6*k)*b[axis] + (3*k2 - 2*k)*h*vb) / h,
  };
}

function sample(unit, time, axis) {
  const samples = unit.motionSamples;
  if (!samples || samples.length < 2) return { p: unit[axis === 'x' ? 'tx' : 'tz'], v: 0 };
  const first = samples[0], last = samples[samples.length - 1];
  if (time <= first.at) return { p: first[axis], v: 0 };
  if (time > last.at) {
    const previous = samples[samples.length - 2], age = time - last.at;
    // 丢包时只做很短的外推，不能把正在交战的士兵推过敌人。
    const velocity = unit.stc === 0 ? clamp((last[axis] - previous[axis]) / (last.at - previous.at), -6, 6) : 0;
    return { p: last[axis] + velocity * Math.min(age, .065), v: age < .065 ? velocity : 0 };
  }
  let i = 0;
  while (i < samples.length - 2 && samples[i + 1].at < time) i++;
  return segment(samples, i, time, axis);
}

export function advancePosition(unit, now, dt) {
  const time = now - DELAY;
  for (const [axis, key] of [['x', 'vx'], ['z', 'vz']]) {
    const target = sample(unit, time, axis), omega = 20;
    const error = unit[axis] - (target.p - target.v * dt), relative = (unit[key] || 0) - target.v;
    const c = relative + omega * error, decay = Math.exp(-omega * dt);
    unit[axis] = target.p + (error + c * dt) * decay;
    unit[key] = target.v + (relative - omega * c * dt) * decay;
  }
}
