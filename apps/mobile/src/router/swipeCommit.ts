// 横向跟手手势（tab 滑动、左边缘返回）共用的松手判定：
// 速度取最近一段时间窗内的触点样本估计，提交按「惯性落点」或「快扫」判定。

/** 速度只看松手前这段时间内的样本；手指停顿超过该时长，速度记 0 */
const VELOCITY_WINDOW_MS = 100;
/** 惯性落点外推时长：落点 = 当前位移 + 速度 × 该时长 */
const PROJECTION_MS = 200;
const COMMIT_PROJECTED_PROGRESS = 0.5;
const FLING_VELOCITY_PX_PER_MS = 0.3;
/** 位移低于该值一律回弹，防误触 */
const MIN_COMMIT_DISTANCE_PX = 24;
/** 反向速度超过该值视为撤销手势，即使已拖过半屏也回弹 */
const REVERSE_CANCEL_VELOCITY_PX_PER_MS = 0.3;

type Sample = { x: number; t: number };

export type VelocityTracker = {
  reset: (x: number, t: number) => void;
  add: (x: number, t: number) => void;
  /** 时间窗内首尾样本的横向速度（px/ms，带符号，向右为正）；样本不足为 0 */
  velocity: (now: number) => number;
};

export function createVelocityTracker(): VelocityTracker {
  let samples: Sample[] = [];

  const prune = (now: number) => {
    const cutoff = now - VELOCITY_WINDOW_MS;
    let firstInWindow = 0;
    while (firstInWindow < samples.length && samples[firstInWindow].t < cutoff) {
      firstInWindow += 1;
    }
    if (firstInWindow > 0) {
      samples = samples.slice(firstInWindow);
    }
  };

  return {
    reset(x, t) {
      samples = [{ x, t }];
    },
    add(x, t) {
      samples.push({ x, t });
      prune(t);
    },
    velocity(now) {
      prune(now);
      if (samples.length < 2) return 0;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dt = last.t - first.t;
      return dt > 0 ? (last.x - first.x) / dt : 0;
    },
  };
}

export type SwipeReleaseInput = {
  /** 沿手势前进方向的位移（px），反向记负 */
  distance: number;
  /** 沿手势前进方向的速度（px/ms），反向为负 */
  velocity: number;
  viewportWidth: number;
};

export function shouldCommitSwipe({
  distance,
  velocity,
  viewportWidth,
}: SwipeReleaseInput): boolean {
  if (distance < MIN_COMMIT_DISTANCE_PX || velocity <= -REVERSE_CANCEL_VELOCITY_PX_PER_MS) {
    return false;
  }
  if (velocity >= FLING_VELOCITY_PX_PER_MS) {
    return true;
  }
  const projected = (distance + velocity * PROJECTION_MS) / viewportWidth;
  return projected >= COMMIT_PROJECTED_PROGRESS;
}
