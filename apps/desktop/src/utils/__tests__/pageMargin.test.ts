import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_MARGIN,
  OUTLINE_MARGIN_MIN_WIDTH,
  PAGE_MARGIN_FLOOR,
  computePageMargin,
  normalizePageMargin,
  outlineFitsInPageMargin,
} from "../pageMargin";

describe("pageMargin 边界计算", () => {
  it("未知或缺失配置值回退到默认档位", () => {
    expect(normalizePageMargin(undefined)).toBe(DEFAULT_PAGE_MARGIN);
    expect(normalizePageMargin("invalid")).toBe(DEFAULT_PAGE_MARGIN);
    expect(normalizePageMargin("narrow")).toBe("narrow");
    expect(normalizePageMargin("wide")).toBe("wide");
  });

  it("非正数与异常宽度兜底到最小呼吸留白", () => {
    expect(computePageMargin(0, "medium")).toBe(PAGE_MARGIN_FLOOR);
    expect(computePageMargin(-100, "wide")).toBe(PAGE_MARGIN_FLOOR);
    expect(computePageMargin(Number.NaN, "medium")).toBe(PAGE_MARGIN_FLOOR);
  });

  it("窄窗口优先保底正文可读宽度并守住最小留白下限", () => {
    // 700px 可用宽时，保底 540px 正文只剩单侧 80px；wide 档位 22% (=154px) 必须退让到 80px
    expect(computePageMargin(700, "wide")).toBe(80);
    // 560px 可用宽时，(560-540)/2 = 10px 低于下限，兜底到 32px
    expect(computePageMargin(560, "medium")).toBe(PAGE_MARGIN_FLOOR);
  });

  it("宽屏触发各档位封顶，防止左右留白无上限增长", () => {
    expect(computePageMargin(2400, "narrow")).toBe(80);
    expect(computePageMargin(2400, "medium")).toBe(220);
    expect(computePageMargin(2400, "wide")).toBe(280);
  });

  it("大纲常驻判定与右留白阈值一致", () => {
    // narrow 封顶 80px 永远低于 176px，大纲始终走 Popover
    expect(outlineFitsInPageMargin(2400, "narrow")).toBe(false);
    // medium 在 1100px 纸宽时 1100 * 0.16 = 176px，恰好达到常驻阈值
    expect(computePageMargin(1100, "medium")).toBe(OUTLINE_MARGIN_MIN_WIDTH);
    expect(outlineFitsInPageMargin(1100, "medium")).toBe(true);
    expect(outlineFitsInPageMargin(1090, "medium")).toBe(false);
  });
});
