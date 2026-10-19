import { describe, expect, it } from "vitest";
import {
  applyAspect,
  clampCenter,
  dragFrameHandle,
  ensureCover,
  flipHorizontal,
  fromTransform,
  identityTransform,
  isCropTransform,
  minCoverScale,
  naturalAspect,
  resizeFrame,
  rotateQuarter,
  rotationOf,
  setStraighten,
  toTransform,
  zoomAround,
  type CropViewState,
  type ImageCropTransform,
} from "../geometry";
import { drawCrop } from "../exportCrop";

const IMAGE = { width: 3000, height: 2000 };
const STAGE = { width: 1000, height: 700 };

const expectTransformClose = (a: ImageCropTransform, b: ImageCropTransform) => {
  expect(a.quarterTurns).toBe(b.quarterTurns);
  expect(a.flipX).toBe(b.flipX);
  expect(a.straighten).toBeCloseTo(b.straighten, 6);
  for (const key of ["cropWidth", "cropHeight", "offsetX", "offsetY"] as const) {
    expect(a[key]).toBeCloseTo(b[key], 4);
  }
};

const isCovered = (state: CropViewState) =>
  minCoverScale(state.frame, IMAGE, state.center, rotationOf(state)) <= state.scale * (1 + 1e-6);

/** 记录 drawCrop 的变换，算出原图某点落在输出画布的位置 */
function mapThroughDraw(transform: ImageCropTransform) {
  const ops: Array<(p: { x: number; y: number }) => { x: number; y: number }> = [];
  let origin = { x: 0, y: 0 };
  const ctx = {
    translate: (x: number, y: number) => ops.push(p => ({ x: p.x + x, y: p.y + y })),
    rotate: (r: number) =>
      ops.push(p => ({
        x: p.x * Math.cos(r) - p.y * Math.sin(r),
        y: p.x * Math.sin(r) + p.y * Math.cos(r),
      })),
    scale: (sx: number, sy: number) => ops.push(p => ({ x: p.x * sx, y: p.y * sy })),
    drawImage: (_img: unknown, dx: number, dy: number) => {
      origin = { x: dx, y: dy };
    },
  };
  drawCrop(ctx, {} as CanvasImageSource, IMAGE, transform);
  // 画布变换按调用顺序右乘：点先经过最后一次变换
  return (u: { x: number; y: number }) =>
    ops.reduceRight((p, op) => op(p), { x: origin.x + u.x, y: origin.y + u.y });
}

describe("视图态与持久化参数互转", () => {
  it("原图参数往返不变，初始裁剪框铺满舞台且与原图同比例", () => {
    const state = fromTransform(identityTransform(IMAGE), STAGE);
    expect(state.frame.width / state.frame.height).toBeCloseTo(1.5, 6);
    expect(isCovered(state)).toBe(true);
    expectTransformClose(toTransform(state), identityTransform(IMAGE));
  });

  it("只认 v2 参数，旧版 cropperjs 参数按原图重新开始", () => {
    expect(isCropTransform(identityTransform(IMAGE))).toBe(true);
    expect(isCropTransform({ version: "1.0", selection: {} })).toBe(false);
    expect(isCropTransform(undefined)).toBe(false);
  });
});

describe("覆盖约束", () => {
  it("未旋转时整图恰好覆盖同尺寸裁剪框", () => {
    const state = fromTransform(identityTransform(IMAGE), STAGE);
    expect(minCoverScale(state.frame, IMAGE, state.center, 0)).toBeCloseTo(state.scale, 6);
  });

  it("微调角度后自动放大到仍能覆盖", () => {
    const state = fromTransform(identityTransform(IMAGE), STAGE);
    const tilted = ensureCover({ ...state, straighten: 12 }, IMAGE);
    expect(tilted.scale).toBeGreaterThan(state.scale);
    expect(isCovered(tilted)).toBe(true);
  });

  it("平移越界时停在仍能覆盖的最远处", () => {
    const state = zoomAround(
      fromTransform(identityTransform(IMAGE), STAGE),
      2,
      { x: 500, y: 350 },
      IMAGE
    );
    const clamped = clampCenter(state, IMAGE, { x: state.center.x + 5000, y: state.center.y });
    expect(clamped.x).toBeGreaterThan(state.center.x);
    expect(clamped.x).toBeLessThan(state.center.x + 5000);
    expect(isCovered({ ...state, center: clamped })).toBe(true);
  });

  it("缩小不能小于覆盖所需", () => {
    const state = fromTransform(identityTransform(IMAGE), STAGE);
    const zoomedOut = zoomAround(state, 0.3, { x: 500, y: 350 }, IMAGE);
    expect(isCovered(zoomedOut)).toBe(true);
    expect(zoomedOut.scale).toBeCloseTo(state.scale, 4);
  });
});

describe("旋转与翻转", () => {
  it("连转四次 90° 回到原状，裁剪框宽高每次互换", () => {
    let state = fromTransform(
      { ...identityTransform(IMAGE), cropWidth: 1200, offsetX: 300 },
      STAGE
    );
    const original = toTransform(state);
    const once = toTransform(rotateQuarter(state, STAGE));
    expect(once.cropWidth).toBeCloseTo(original.cropHeight, 4);
    expect(once.cropHeight).toBeCloseTo(original.cropWidth, 4);
    for (let i = 0; i < 4; i++) state = rotateQuarter(state, STAGE);
    expectTransformClose(toTransform(state), original);
  });

  it("水平翻转两次回到原状，一次时角度与偏移取反", () => {
    const state = fromTransform(
      { ...identityTransform(IMAGE), straighten: 8, offsetX: 120 },
      STAGE
    );
    const flipped = toTransform(flipHorizontal(state));
    expect(flipped.flipX).toBe(true);
    expect(flipped.straighten).toBeCloseTo(-8, 6);
    expect(flipped.offsetX).toBeCloseTo(-120, 4);
    expectTransformClose(toTransform(flipHorizontal(flipHorizontal(state))), toTransform(state));
  });

  it("「原始」比例随 90° 步进翻转", () => {
    expect(naturalAspect(IMAGE, 0)).toBeCloseTo(1.5);
    expect(naturalAspect(IMAGE, 1)).toBeCloseTo(2 / 3);
  });
});

describe("宽高比与把手", () => {
  it("切换比例后裁剪框符合比例并仍被覆盖", () => {
    const state = fromTransform(identityTransform(IMAGE), STAGE);
    const square = applyAspect(state, 1, IMAGE, STAGE);
    expect(square.frame.width / square.frame.height).toBeCloseTo(1, 6);
    expect(isCovered(square)).toBe(true);
  });

  it("锁定比例拖角：保持比例、锚定对角、不越出舞台", () => {
    const start = { x: 200, y: 150, width: 400, height: 300 };
    const next = resizeFrame(start, "se", { x: 2000, y: 10 }, 4 / 3, STAGE);
    expect(next.width / next.height).toBeCloseTo(4 / 3, 6);
    expect(next.x).toBeCloseTo(200, 6);
    expect(next.y).toBeCloseTo(150, 6);
    expect(next.x + next.width).toBeLessThanOrEqual(STAGE.width - 32 + 1e-6);
    expect(next.y + next.height).toBeLessThanOrEqual(STAGE.height - 32 + 1e-6);
  });

  it("自由比例拖边：对边不动，不小于最小尺寸", () => {
    const start = { x: 200, y: 150, width: 400, height: 300 };
    const next = resizeFrame(start, "w", { x: 1000, y: 0 }, null, STAGE);
    expect(next.x + next.width).toBeCloseTo(600, 6);
    expect(next.width).toBe(40);
  });
});

describe("画布绘制", () => {
  const corners = [
    { x: 0, y: 0 },
    { x: IMAGE.width, y: 0 },
    { x: 0, y: IMAGE.height },
    { x: IMAGE.width, y: IMAGE.height },
  ];
  const bounds = (transform: ImageCropTransform) => {
    const map = mapThroughDraw(transform);
    const points = corners.map(map);
    return {
      minX: Math.min(...points.map(p => p.x)),
      maxX: Math.max(...points.map(p => p.x)),
      minY: Math.min(...points.map(p => p.y)),
      maxY: Math.max(...points.map(p => p.y)),
    };
  };

  it("原图参数：原图四角正好落在输出画布四角", () => {
    const b = bounds(identityTransform(IMAGE));
    expect(b.minX).toBeCloseTo(0, 6);
    expect(b.minY).toBeCloseTo(0, 6);
    expect(b.maxX).toBeCloseTo(3000, 6);
    expect(b.maxY).toBeCloseTo(2000, 6);
  });

  it("逆时针转 90°：输出为竖图，原图仍正好铺满", () => {
    const state = rotateQuarter(fromTransform(identityTransform(IMAGE), STAGE), STAGE);
    const t = toTransform(state);
    expect(t.cropWidth).toBeCloseTo(2000, 4);
    expect(t.cropHeight).toBeCloseTo(3000, 4);
    const b = bounds(t);
    expect(b.minX).toBeCloseTo(0, 3);
    expect(b.maxX).toBeCloseTo(2000, 3);
    expect(b.minY).toBeCloseTo(0, 3);
    expect(b.maxY).toBeCloseTo(3000, 3);
    // 逆时针：原图左上角转到输出的左下
    const topLeft = mapThroughDraw(t)({ x: 0, y: 0 });
    expect(topLeft.x).toBeCloseTo(0, 3);
    expect(topLeft.y).toBeCloseTo(3000, 3);
  });

  it("水平翻转：原图左上角落到输出右上", () => {
    const t = toTransform(flipHorizontal(fromTransform(identityTransform(IMAGE), STAGE)));
    const topLeft = mapThroughDraw(t)({ x: 0, y: 0 });
    expect(topLeft.x).toBeCloseTo(3000, 3);
    expect(topLeft.y).toBeCloseTo(0, 3);
  });
});

describe("比例与角度不累积缩放", () => {
  const initial = () => fromTransform(identityTransform(IMAGE), STAGE);

  it("比例来回切换，结果只取决于比例本身（不会越裁越小）", () => {
    const wide = applyAspect(initial(), 16 / 9, IMAGE, STAGE);
    const tall = applyAspect(wide, 3 / 4, IMAGE, STAGE);
    const wideAgain = applyAspect(tall, 16 / 9, IMAGE, STAGE);
    expectTransformClose(toTransform(wideAgain), toTransform(wide));
  });

  it("未旋转时 16:9 取满原图宽度，切回原始比例回到整张原图", () => {
    const wide = toTransform(applyAspect(initial(), 16 / 9, IMAGE, STAGE));
    expect(wide.cropWidth).toBeCloseTo(3000, 2);
    expect(wide.cropHeight).toBeCloseTo(3000 / (16 / 9), 2);
    const back = applyAspect(applyAspect(initial(), 1, IMAGE, STAGE), 1.5, IMAGE, STAGE);
    expectTransformClose(toTransform(back), identityTransform(IMAGE));
  });

  it("分多次调角度再回到 0°，缩放回到原样", () => {
    const start = initial();
    let state = start;
    for (const angle of [10, 20, 35, 20, 5]) state = setStraighten(state, angle, IMAGE);
    state = setStraighten(state, 0, IMAGE);
    expect(state.scale).toBeCloseTo(start.scale, 6);
    expectTransformClose(toTransform(state), toTransform(start));
  });

  it("调角度后仍覆盖裁剪框，且用户放大的倍数被保留", () => {
    const zoomed = zoomAround(initial(), 1.5, { x: 500, y: 350 }, IMAGE);
    const tilted = setStraighten(zoomed, 15, IMAGE);
    expect(isCovered(tilted)).toBe(true);
    const back = setStraighten(tilted, 0, IMAGE);
    expect(back.scale).toBeCloseTo(zoomed.scale, 6);
  });
});

describe("拖动裁剪框把手", () => {
  const AREA_BOTTOM = STAGE.height - 32;

  it("框已顶到舞台边缘时继续往外拖：框不越出舞台，裁剪范围继续变大", () => {
    // 放大后框里只是原图的一部分，下方还有内容
    const zoomed = zoomAround(
      fromTransform(identityTransform(IMAGE), STAGE),
      2,
      { x: 500, y: 350 },
      IMAGE
    );
    const shrunk = dragFrameHandle(zoomed, "s", { x: 0, y: -200 }, IMAGE, STAGE);
    expect(shrunk.frame.y + shrunk.frame.height).toBeLessThan(AREA_BOTTOM);

    const extended = dragFrameHandle(zoomed, "s", { x: 0, y: 150 }, IMAGE, STAGE);
    expect(extended.frame.y + extended.frame.height).toBeLessThanOrEqual(AREA_BOTTOM + 1e-6);
    expect(toTransform(extended).cropHeight).toBeGreaterThan(toTransform(zoomed).cropHeight);
    expect(isCovered(extended)).toBe(true);
  });

  it("拖到图片边缘即停，不为覆盖而放大图片", () => {
    const start = fromTransform(identityTransform(IMAGE), STAGE);
    const pulled = dragFrameHandle(start, "se", { x: 800, y: 800 }, IMAGE, STAGE);
    expect(isCovered(pulled)).toBe(true);
    expect(toTransform(pulled).cropWidth).toBeLessThanOrEqual(3000 + 1e-3);
    expect(pulled.scale).toBeLessThanOrEqual(start.scale + 1e-9);
  });

  it("框缩回时画面不被放大", () => {
    const start = fromTransform(identityTransform(IMAGE), STAGE);
    const inward = dragFrameHandle(start, "e", { x: -300, y: 0 }, IMAGE, STAGE);
    expect(inward.scale).toBeCloseTo(start.scale, 9);
    expect(inward.frame.width).toBeCloseTo(start.frame.width - 300, 6);
  });
});
