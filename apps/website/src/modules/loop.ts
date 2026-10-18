/** 知识闭环：页面滚动驱动左侧步骤与右侧画面；窄屏时画面改为纵向排列并等比缩放 */
import { mustQuery } from "../lib/dom.ts";

const SCENE_WIDTH = 840;

export function initLoop() {
  const loop = mustQuery("#loop");
  const sticky = mustQuery(".loop-sticky", loop);
  const stage = mustQuery(".loop-stage", loop);
  const bar = mustQuery(".steps .bar", loop);
  const steps = [...loop.querySelectorAll<HTMLElement>(".step")];
  const scenes = [...loop.querySelectorAll<HTMLElement>(".scene")];
  let current = -1;

  const setStep = (index: number) => {
    if (index === current) return;
    current = index;
    steps.forEach((s, k) => s.classList.toggle("on", k === index));
    scenes.forEach((s, k) => s.classList.toggle("on", k === index));
    // 等描述展开后再量高度，进度条才能停在当前步骤底部
    requestAnimationFrame(() => {
      const step = steps[index];
      bar.style.height = `${step.offsetTop + step.offsetHeight - 6}px`;
    });
  };

  const scrollRange = () => loop.offsetHeight - innerHeight;
  const onScroll = () => {
    if (getComputedStyle(sticky).position !== "sticky") return;
    const progress = Math.min(0.999, Math.max(0, (scrollY - loop.offsetTop) / scrollRange()));
    setStep(Math.floor(progress * steps.length));
  };
  const fitScenes = () => {
    const scale = Math.min(1, (stage.clientWidth || SCENE_WIDTH) / SCENE_WIDTH);
    loop.style.setProperty("--s", String(scale));
  };

  steps.forEach((step, i) =>
    step.addEventListener("click", () =>
      scrollTo({
        top: loop.offsetTop + (scrollRange() * (i + 0.5)) / steps.length,
        behavior: "smooth",
      })
    )
  );
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", fitScenes);
  fitScenes();
  setStep(0);
}
