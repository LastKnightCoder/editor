import { describe, expect, it } from "vitest";
import { Camera } from "../core/camera";

const camera = () => new Camera(800, 600);

describe("坐标变换", () => {
  it("toWorld 与 toCanvas 互逆", () => {
    const cam = camera();
    cam.zoomAt(400, 300, 2.3);
    cam.panBy(37, -19);
    const [wx, wy] = cam.toWorld(123, 456);
    const [cx, cy] = cam.toCanvas(wx, wy);
    expect(cx).toBeCloseTo(123, 6);
    expect(cy).toBeCloseTo(456, 6);
  });

  it("以锚点缩放时，锚点下的世界坐标不动", () => {
    const cam = camera();
    const before = cam.toWorld(200, 150);
    cam.zoomAt(200, 150, 1.8);
    const after = cam.toWorld(200, 150);
    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[1]).toBeCloseTo(before[1], 6);
  });

  it("缩放被限制在上下界内", () => {
    const cam = camera();
    for (let i = 0; i < 100; i++) cam.zoomAt(0, 0, 2);
    expect(cam.scale).toBeLessThanOrEqual(8);
    for (let i = 0; i < 200; i++) cam.zoomAt(0, 0, 0.5);
    expect(cam.scale).toBeGreaterThanOrEqual(0.05);
  });

  it("平移量按当前缩放折算，缩小后同样的像素位移走更远的世界距离", () => {
    const a = camera();
    const b = camera();
    b.zoomAt(0, 0, 0.5);
    const beforeA = a.toWorld(0, 0)[0];
    const beforeB = b.toWorld(0, 0)[0];
    a.panBy(100, 0);
    b.panBy(100, 0);
    expect(Math.abs(b.toWorld(0, 0)[0] - beforeB)).toBeGreaterThan(
      Math.abs(a.toWorld(0, 0)[0] - beforeA)
    );
  });
});

describe("fit", () => {
  it("包围盒中心落到视口中心", () => {
    const cam = camera();
    cam.fit({ minX: 100, minY: 200, maxX: 300, maxY: 400 });
    const [cx, cy] = cam.toCanvas(200, 300);
    expect(cx).toBeCloseTo(400, 6);
    expect(cy).toBeCloseTo(300, 6);
  });

  it("退化视口（宽高为 0）会把缩放压到下限——宿主必须避免在此时 fit", () => {
    const cam = new Camera(0, 0);
    cam.fit({ minX: 0, minY: 0, maxX: 400, maxY: 300 });
    expect(cam.scale).toBe(0.05);
  });

  it("padding 越大缩放越小", () => {
    const bounds = { minX: 0, minY: 0, maxX: 400, maxY: 300 };
    const tight = camera();
    const loose = camera();
    tight.fit(bounds, 10);
    loose.fit(bounds, 150);
    expect(loose.scale).toBeLessThan(tight.scale);
  });
});

describe("飞行动画", () => {
  it("按缓动推进并在结束时精确到位", () => {
    const cam = camera();
    cam.flyTo({ x: 500, y: 500, scale: 2 }, 400, 0);
    expect(cam.isFlying).toBe(true);

    cam.advance(200);
    const mid = cam.toCanvas(500, 500);
    // easeOutCubic 在半程已经走过一半以上，但还没到位
    expect(Math.hypot(mid[0] - 400, mid[1] - 300)).toBeGreaterThan(0);

    cam.advance(400);
    const end = cam.toCanvas(500, 500);
    expect(end[0]).toBeCloseTo(400, 6);
    expect(end[1]).toBeCloseTo(300, 6);
    expect(cam.scale).toBeCloseTo(2, 6);
    expect(cam.isFlying).toBe(false);
  });

  it("advance 在没有飞行时返回 false，raf 循环据此停摆", () => {
    const cam = camera();
    expect(cam.advance(100)).toBe(false);
  });

  it("duration 为 0 时立即到位", () => {
    const cam = camera();
    cam.flyTo({ x: 10, y: 20, scale: 3 }, 0, 0);
    expect(cam.isFlying).toBe(false);
    expect(cam.scale).toBe(3);
  });

  it("scale 在对数空间插值，半程的缩放小于算术中点", () => {
    const cam = camera();
    cam.flyTo({ x: 0, y: 0, scale: 4 }, 100, 0);
    // t=0.5 时 easeOutCubic k=0.875，对数插值给 1*4^0.875 ≈ 3.36，算术插值会给 3.625
    cam.advance(50);
    expect(cam.scale).toBeLessThan(1 + (4 - 1) * 0.875);
  });

  it("手动平移会打断飞行", () => {
    const cam = camera();
    cam.flyTo({ x: 100, y: 100, scale: 2 }, 500, 0);
    cam.panBy(5, 5);
    expect(cam.isFlying).toBe(false);
  });
});
