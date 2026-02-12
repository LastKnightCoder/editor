import { afterEach, describe, expect, it } from "vitest";
import {
  shouldPreventBackgroundTouchMove,
  TOUCHMOVE_ALLOW_SELECTOR,
} from "../touchMoveGuard";

describe("CardPreviewSheet touch move guard", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("命中允许滚动选择器时不拦截", () => {
    const sheet = document.createElement("section");
    document.body.appendChild(sheet);
    const allowRoot = document.createElement("div");
    allowRoot.setAttribute("data-allow-touchmove", "true");
    const target = document.createElement("div");
    allowRoot.appendChild(target);
    document.body.appendChild(allowRoot);

    const shouldPrevent = shouldPreventBackgroundTouchMove({
      target,
      sheet,
    });

    expect(allowRoot.matches(TOUCHMOVE_ALLOW_SELECTOR)).toBe(true);
    expect(shouldPrevent).toBe(false);
  });

  it("触摸发生在抽屉内时不拦截", () => {
    const sheet = document.createElement("section");
    const target = document.createElement("div");
    sheet.appendChild(target);
    document.body.appendChild(sheet);

    const shouldPrevent = shouldPreventBackgroundTouchMove({
      target,
      sheet,
    });

    expect(shouldPrevent).toBe(false);
  });

  it("抽屉外且不在放行区域时拦截", () => {
    const sheet = document.createElement("section");
    document.body.appendChild(sheet);
    const target = document.createElement("div");
    document.body.appendChild(target);

    const shouldPrevent = shouldPreventBackgroundTouchMove({
      target,
      sheet,
    });

    expect(shouldPrevent).toBe(true);
  });
});
