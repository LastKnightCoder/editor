// 此函数由 Playwright 在页面中执行，只在画布位移或视图盒更新后读取屏幕矩阵。
export function startFrameSample(svg) {
  const camera = svg.closest("[data-whiteboard-camera]");
  const initial = svg.getScreenCTM();
  let lastProjection = initial;
  let dirty = false;
  let updates = 0;
  let displayed = 0;
  let down;
  let firstMotionMs;
  let previousFrame;
  let previousMotion;
  let handle;
  const frames = [];
  const motionIntervals = [];
  const begin = event => {
    down = event.timeStamp;
  };
  document.addEventListener("pointerdown", begin, { capture: true, once: true });
  const observer = new MutationObserver(() => {
    dirty = true;
    updates++;
  });
  observer.observe(svg, { attributes: true, attributeFilter: ["viewBox", "style"] });
  if (camera) observer.observe(camera, { attributes: true, attributeFilter: ["style"] });
  function sample(now) {
    if (previousFrame !== undefined) frames.push(now - previousFrame);
    previousFrame = now;
    if (dirty) {
      dirty = false;
      const next = svg.getScreenCTM();
      if (
        next.e !== lastProjection.e ||
        next.f !== lastProjection.f ||
        next.a !== lastProjection.a
      ) {
        displayed++;
        if (down !== undefined && firstMotionMs === undefined)
          firstMotionMs = Math.round(performance.now() - down);
        if (previousMotion !== undefined) motionIntervals.push(now - previousMotion);
        previousMotion = now;
        lastProjection = next;
      }
    }
    handle = requestAnimationFrame(sample);
  }
  handle = requestAnimationFrame(sample);
  return () => {
    cancelAnimationFrame(handle);
    observer.disconnect();
    document.removeEventListener("pointerdown", begin, true);
    const p95 = values => {
      if (!values.length) return null;
      const sorted = values.slice().sort((a, b) => a - b);
      return +sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(1);
    };
    return {
      updates,
      displayed,
      firstMotionMs,
      frames: frames.length,
      p95FrameMs: p95(frames),
      p95MotionMs: p95(motionIntervals),
      maxFrameMs: +Math.max(0, ...frames).toFixed(1),
      longFrames: frames.filter(ms => ms >= 50).length,
    };
  };
}
