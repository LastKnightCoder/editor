/**
 * 文档卡展开 / 收起的形变工具：纸面从卡片的盒子伸缩到阅读纸盒子，正文在纸面上淡入。
 * 只动 transform / opacity。不用 View Transitions：截图放大会糊，且动画期间不能交互。
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 临界阻尼附近的弹簧采样成 CSS linear()；不支持时退回 tau 缓出 */
function springEasing(stiffness = 230, damping = 28) {
  const supported =
    typeof CSS !== "undefined" && CSS.supports("animation-timing-function", "linear(0, 1)");
  if (!supported) return { easing: "cubic-bezier(0.22, 1, 0.36, 1)", duration: 440 };
  const dt = 1 / 240;
  const samples = [0];
  let x = 0;
  let v = 0;
  let t = 0;
  while (t < 1.5) {
    v += (stiffness * (1 - x) - damping * v) * dt;
    x += v * dt;
    t += dt;
    samples.push(x);
    if (t > 0.2 && Math.abs(1 - x) < 5e-4 && Math.abs(v) < 5e-3) break;
  }
  const steps = 48;
  const points = Array.from({ length: steps + 1 }, (_, i) =>
    i === steps ? "1" : samples[Math.round((i / steps) * (samples.length - 1))].toFixed(4)
  );
  return { easing: `linear(${points.join(",")})`, duration: Math.round(t * 1000) };
}

export const SPRING = springEasing();

export const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** el 相对 origin 的盒子 */
export function relativeBox(el: Element, origin: Element): Box {
  const r = el.getBoundingClientRect();
  const o = origin.getBoundingClientRect();
  return { left: r.left - o.left, top: r.top - o.top, width: r.width, height: r.height };
}

export const boxStyle = (box: Box) => ({
  left: `${box.left}px`,
  top: `${box.top}px`,
  width: `${box.width}px`,
  height: `${box.height}px`,
});
