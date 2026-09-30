import { describe, expect, it } from "vitest";
import { isOwnDevice, toContainerSpace } from "../cursorOverlay";

describe("isOwnDevice", () => {
  it("同设备的其他视图不算协作者", () => {
    expect(isOwnDevice("device-a", "device-a")).toBe(true);
    expect(isOwnDevice("device-b", "device-a")).toBe(false);
  });

  it("缺设备 id（旧数据 / 未就绪）时照常显示", () => {
    expect(isOwnDevice(undefined, "device-a")).toBe(false);
    expect(isOwnDevice("device-a", undefined)).toBe(false);
  });
});

describe("toContainerSpace", () => {
  it("按容器缩放把屏幕像素折回容器内的 CSS 像素", () => {
    expect(toContainerSpace({ top: 300, left: 150, height: 30 }, 1.5)).toEqual({
      top: 200,
      left: 100,
      height: 20,
    });
    expect(toContainerSpace({ top: 30, left: 15, width: 60, height: 15 }, 1.5)).toEqual({
      top: 20,
      left: 10,
      width: 40,
      height: 10,
    });
  });

  it("没有缩放时原样返回", () => {
    const box = { top: 1, left: 2, height: 3 };
    expect(toContainerSpace(box, 1)).toBe(box);
  });
});
