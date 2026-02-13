import { describe, expect, it } from "vitest";
import { resolveScreenMotion } from "../screenTransition";

describe("navigation/screenTransition", () => {
  it("未提供配置时应回退为无动画", () => {
    const motion = resolveScreenMotion();
    expect(motion.initial).toBe(false);
    expect(motion.animate).toMatchObject({ opacity: 1 });
    expect(motion.exit).toMatchObject({ opacity: 1 });
  });

  it("sheetUp 应映射为底部上滑 motion 参数", () => {
    const motion = resolveScreenMotion({
      preset: "sheetUp",
      enterMs: 300,
      exitMs: 250,
    });
    expect(motion.initial).toMatchObject({ opacity: 0, y: "100%" });
    expect(motion.animate).toMatchObject({
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 },
    });
    expect(motion.exit).toMatchObject({
      opacity: 0,
      y: "100%",
      transition: { duration: 0.25 },
    });
  });

  it("slideRight 应映射为右侧进出 motion 参数", () => {
    const motion = resolveScreenMotion({
      preset: "slideRight",
      enterMs: 300,
      exitMs: 250,
    });
    expect(motion.initial).toMatchObject({ opacity: 0, x: "20%" });
    expect(motion.animate).toMatchObject({
      opacity: 1,
      x: 0,
      transition: { duration: 0.3 },
    });
    expect(motion.exit).toMatchObject({
      opacity: 0,
      x: "20%",
      transition: { duration: 0.25 },
    });
  });

  it("reducedMotion 模式下应降级为无位移动画", () => {
    const motion = resolveScreenMotion(
      {
        preset: "slideRight",
        enterMs: 300,
        exitMs: 250,
      },
      true,
    );
    expect(motion.initial).toBe(false);
    expect(motion.animate).toMatchObject({
      opacity: 1,
      transition: { duration: 0.3 },
    });
    expect(motion.exit).toMatchObject({
      opacity: 1,
      transition: { duration: 0.25 },
    });
  });
});
