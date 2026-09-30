/**
 * 裁剪编辑器的纯几何：视图态（舞台上的裁剪框 + 图片缩放 / 平移 / 旋转）
 * 与持久化的裁剪参数（图片像素坐标，与视图无关）之间的换算与约束。
 *
 * 坐标约定：视图坐标以舞台左上为原点、向右向下为正；图片的旋转 = 90° 步进 + 微调角度，
 * 翻转作用在图片自身坐标上（先翻转再旋转）。
 * 纯计算、不依赖 DOM：图片节点类型引用这里的 ImageCropTransform，headless 的 @tau/markdown 也会检查到。
 */

export interface Vec {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** 持久化的裁剪参数（写进图片节点，再次打开据此恢复） */
export interface ImageCropTransform {
  version: 2;
  /** 90° 步进旋转次数（0-3，逆时针为正） */
  quarterTurns: number;
  /** 微调角度（度，-45 ~ 45，顺时针为正） */
  straighten: number;
  flipX: boolean;
  /** 锁定的宽高比；null 为自由 */
  aspect: number | null;
  /** 裁剪结果的尺寸，图片像素 */
  cropWidth: number;
  cropHeight: number;
  /** 图片中心相对裁剪框中心的偏移，图片像素（按输出方向，不随图片旋转） */
  offsetX: number;
  offsetY: number;
}

/** 编辑中的视图态 */
export interface CropViewState {
  quarterTurns: number;
  straighten: number;
  flipX: boolean;
  aspect: number | null;
  /** 视图像素 / 图片像素 */
  scale: number;
  /** 图片中心（视图坐标） */
  center: Vec;
  /** 裁剪框（视图坐标） */
  frame: Rect;
}

export const MAX_STRAIGHTEN = 45;
/** 裁剪框在舞台内留出的边距（视图像素） */
export const STAGE_PADDING = 32;
export const MIN_FRAME_SIZE = 40;
/** 最大放大到原图 4 倍像素 */
export const MAX_SCALE = 4;

const DEG = Math.PI / 180;

export const normalizeTurns = (turns: number) => ((turns % 4) + 4) % 4;

export const rotationOf = (state: Pick<CropViewState, "quarterTurns" | "straighten">) =>
  (state.quarterTurns * -90 + state.straighten) * DEG;

const rotate = (v: Vec, radians: number): Vec => {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
};

export const frameCenter = (frame: Rect): Vec => ({
  x: frame.x + frame.width / 2,
  y: frame.y + frame.height / 2,
});

const frameCorners = (frame: Rect): Vec[] => [
  { x: frame.x, y: frame.y },
  { x: frame.x + frame.width, y: frame.y },
  { x: frame.x, y: frame.y + frame.height },
  { x: frame.x + frame.width, y: frame.y + frame.height },
];

/**
 * 旋转后的图片要完整覆盖裁剪框所需的最小缩放：
 * 把框的四角转到图片自身坐标，取各角到图片中心的最大半宽 / 半高占比。
 */
export function minCoverScale(frame: Rect, image: Size, center: Vec, radians: number): number {
  let required = 0;
  for (const corner of frameCorners(frame)) {
    const local = rotate({ x: corner.x - center.x, y: corner.y - center.y }, -radians);
    required = Math.max(
      required,
      (2 * Math.abs(local.x)) / image.width,
      (2 * Math.abs(local.y)) / image.height
    );
  }
  return required;
}

const covered = (state: CropViewState, image: Size, center = state.center) =>
  minCoverScale(state.frame, image, center, rotationOf(state)) <= state.scale + 1e-9;

/** 平移图片：越界时沿「当前位置 → 目标位置」二分，停在仍能覆盖裁剪框的最远处 */
export function clampCenter(state: CropViewState, image: Size, target: Vec): Vec {
  if (covered(state, image, target)) {
    return target;
  }
  let lo = 0;
  let hi = 1;
  const from = state.center;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const probe = { x: from.x + (target.x - from.x) * mid, y: from.y + (target.y - from.y) * mid };
    if (covered(state, image, probe)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return { x: from.x + (target.x - from.x) * lo, y: from.y + (target.y - from.y) * lo };
}

/** 以 anchor 为不动点把图片缩放 k 倍 */
const scaleAbout = (state: CropViewState, k: number, anchor: Vec): CropViewState => ({
  ...state,
  scale: state.scale * k,
  center: {
    x: anchor.x + (state.center.x - anchor.x) * k,
    y: anchor.y + (state.center.y - anchor.y) * k,
  },
});

/**
 * 保证覆盖：缩放不足时以裁剪框中心为锚点放大（框内画面位置不漂移）。
 * 放大会让图片中心离框心更远，所以迭代到满足为止（几次即收敛）。
 */
export function ensureCover(state: CropViewState, image: Size): CropViewState {
  let next = state;
  for (let i = 0; i < 12; i++) {
    const required = minCoverScale(next.frame, image, next.center, rotationOf(next));
    if (required <= next.scale * (1 + 1e-9)) {
      return next;
    }
    next = scaleAbout(next, (required / next.scale) * (1 + 1e-6), frameCenter(next.frame));
  }
  return next;
}

/** 以 anchor（通常是指针位置）为不动点缩放；缩到覆盖不住时退回刚好覆盖 */
export function zoomAround(
  state: CropViewState,
  factor: number,
  anchor: Vec,
  image: Size
): CropViewState {
  const k = Math.min(MAX_SCALE, state.scale * factor) / state.scale;
  return ensureCover(scaleAbout(state, k, anchor), image);
}

/** 当前 90° 步进下的「原始」宽高比 */
export const naturalAspect = (image: Size, quarterTurns: number) =>
  normalizeTurns(quarterTurns) % 2 === 0 ? image.width / image.height : image.height / image.width;

/** 按宽高比在可用区域内取最大、居中的矩形 */
export function fitRect(area: Rect, aspect: number): Rect {
  let width = area.width;
  let height = width / aspect;
  if (height > area.height) {
    height = area.height;
    width = height * aspect;
  }
  return {
    x: area.x + (area.width - width) / 2,
    y: area.y + (area.height - height) / 2,
    width,
    height,
  };
}

const stageArea = (stage: Size): Rect => ({
  x: STAGE_PADDING,
  y: STAGE_PADDING,
  width: Math.max(1, stage.width - STAGE_PADDING * 2),
  height: Math.max(1, stage.height - STAGE_PADDING * 2),
});

/** 视图态 → 持久化参数 */
export function toTransform(state: CropViewState): ImageCropTransform {
  const fc = frameCenter(state.frame);
  return {
    version: 2,
    quarterTurns: normalizeTurns(state.quarterTurns),
    straighten: state.straighten,
    flipX: state.flipX,
    aspect: state.aspect,
    cropWidth: state.frame.width / state.scale,
    cropHeight: state.frame.height / state.scale,
    offsetX: (state.center.x - fc.x) / state.scale,
    offsetY: (state.center.y - fc.y) / state.scale,
  };
}

/** 持久化参数 → 视图态：裁剪框按比例铺满舞台居中 */
export function fromTransform(transform: ImageCropTransform, stage: Size): CropViewState {
  const frame = fitRect(stageArea(stage), transform.cropWidth / transform.cropHeight);
  const scale = frame.width / transform.cropWidth;
  const fc = frameCenter(frame);
  return {
    quarterTurns: normalizeTurns(transform.quarterTurns),
    straighten: transform.straighten,
    flipX: transform.flipX,
    aspect: transform.aspect,
    scale,
    frame,
    center: { x: fc.x + transform.offsetX * scale, y: fc.y + transform.offsetY * scale },
  };
}

/** 未裁剪过的初始参数：整张原图 */
export const identityTransform = (image: Size): ImageCropTransform => ({
  version: 2,
  quarterTurns: 0,
  straighten: 0,
  flipX: false,
  aspect: null,
  cropWidth: image.width,
  cropHeight: image.height,
  offsetX: 0,
  offsetY: 0,
});

/** 节点里存的参数是否是本编辑器能恢复的版本（旧版 cropperjs 参数不认，按原图重新开始） */
export const isCropTransform = (value: unknown): value is ImageCropTransform =>
  !!value && typeof value === "object" && (value as { version?: unknown }).version === 2;

/** 重新铺满舞台（裁剪框改变或旋转后调用），画面内容不变 */
export const refit = (state: CropViewState, stage: Size) =>
  fromTransform(toTransform(state), stage);

/** 逆时针旋转 90°：整幅构图一起转，裁剪框宽高互换 */
export function rotateQuarter(state: CropViewState, stage: Size): CropViewState {
  const t = toTransform(state);
  return fromTransform(
    {
      ...t,
      quarterTurns: normalizeTurns(t.quarterTurns + 1),
      aspect: t.aspect ? 1 / t.aspect : null,
      cropWidth: t.cropHeight,
      cropHeight: t.cropWidth,
      offsetX: t.offsetY,
      offsetY: -t.offsetX,
    },
    stage
  );
}

/**
 * 水平翻转：整幅构图沿裁剪框竖直中线镜像。
 * 镜像 M·R(θ)·F = R(-θ)·(M·F)，因此旋转取反、翻转取反、偏移 x 取反。
 */
export function flipHorizontal(state: CropViewState): CropViewState {
  const fc = frameCenter(state.frame);
  return {
    ...state,
    quarterTurns: normalizeTurns(-state.quarterTurns),
    straighten: -state.straighten,
    flipX: !state.flipX,
    center: { x: 2 * fc.x - state.center.x, y: state.center.y },
  };
}

/** 切换宽高比：在当前裁剪框内取该比例的最大框，再铺满舞台 */
/** 以 aspect 为比例、在整张图里能取到的最大裁剪尺寸（裁剪中心相对图片中心的偏移保持不变），图片像素 */
export function maxCropSize(image: Size, aspect: number, radians: number, offset: Vec): Size {
  const fits = (width: number) => {
    const height = width / aspect;
    const frame = { x: -width / 2, y: -height / 2, width, height };
    return minCoverScale(frame, image, offset, radians) <= 1 + 1e-9;
  };
  let lo = 0;
  let hi = Math.hypot(image.width, image.height) * Math.max(1, aspect);
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return { width: lo, height: lo / aspect };
}

/**
 * 切换宽高比：取该比例在整张图里的最大框，裁剪中心不变。
 * 结果只取决于比例本身，与之前选过什么无关（来回切换不会越裁越小）。
 */
export function applyAspect(
  state: CropViewState,
  aspect: number | null,
  image: Size,
  stage: Size
): CropViewState {
  if (aspect == null) {
    return { ...state, aspect: null };
  }
  const t = toTransform(state);
  const size = maxCropSize(image, aspect, rotationOf(state), { x: t.offsetX, y: t.offsetY });
  return ensureCover(
    fromTransform({ ...t, aspect, cropWidth: size.width, cropHeight: size.height }, stage),
    image
  );
}

/** 图片居中时刚好覆盖裁剪框的缩放（「不额外放大」的基准） */
const baseCoverScale = (state: CropViewState, image: Size) =>
  minCoverScale(state.frame, image, frameCenter(state.frame), rotationOf(state));

/**
 * 设定微调角度：以裁剪框中心为轴旋转（框心下的画面点不动），
 * 缩放保持相对「刚好覆盖」的倍数；覆盖不住时把图片推回而不是放大，
 * 所以角度回到原值时缩放也回到原值，来回拖动不会越转越大。
 */
export function setStraighten(base: CropViewState, angle: number, image: Size): CropViewState {
  const fc = frameCenter(base.frame);
  const zoom = Math.max(1, base.scale / baseCoverScale(base, image));
  const next = { ...base, straighten: angle };
  const scale = baseCoverScale(next, image) * zoom;
  const local = rotate(
    { x: (fc.x - base.center.x) / base.scale, y: (fc.y - base.center.y) / base.scale },
    -rotationOf(base)
  );
  const back = rotate(local, rotationOf(next));
  const target = { x: fc.x - back.x * scale, y: fc.y - back.y * scale };
  const centered = { ...next, scale, center: fc };
  return { ...centered, center: clampCenter(centered, image, target) };
}

export type FrameHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** 拖动裁剪框把手：对边保持不动，框被限制在舞台可用区内；锁定比例时以拖动边为主轴 */
export function resizeFrame(
  start: Rect,
  handle: FrameHandle,
  delta: Vec,
  aspect: number | null,
  stage: Size
): Rect {
  return resizeFrameWithin(start, handle, delta, aspect, stageArea(stage));
}

function resizeFrameWithin(
  start: Rect,
  handle: FrameHandle,
  delta: Vec,
  aspect: number | null,
  area: Rect
): Rect {
  const minX = area.x;
  const minY = area.y;
  const maxX = area.x + area.width;
  const maxY = area.y + area.height;
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;

  if (handle.includes("w")) left = Math.min(right - MIN_FRAME_SIZE, Math.max(minX, left + delta.x));
  if (handle.includes("e"))
    right = Math.max(left + MIN_FRAME_SIZE, Math.min(maxX, right + delta.x));
  if (handle.includes("n")) top = Math.min(bottom - MIN_FRAME_SIZE, Math.max(minY, top + delta.y));
  if (handle.includes("s"))
    bottom = Math.max(top + MIN_FRAME_SIZE, Math.min(maxY, bottom + delta.y));

  if (aspect) {
    const horizontalPrimary = handle === "e" || handle === "w" || handle.length === 2;
    let width = right - left;
    let height = bottom - top;
    if (horizontalPrimary) {
      height = width / aspect;
    } else {
      width = height * aspect;
    }
    // 边拖动时另一轴居中伸缩，角拖动时锚在对角
    const anchorX = handle.includes("w") ? right : handle.includes("e") ? left : (left + right) / 2;
    const anchorY = handle.includes("n") ? bottom : handle.includes("s") ? top : (top + bottom) / 2;
    const fromX = handle.includes("w")
      ? anchorX - width
      : handle.includes("e")
        ? anchorX
        : anchorX - width / 2;
    const fromY = handle.includes("n")
      ? anchorY - height
      : handle.includes("s")
        ? anchorY
        : anchorY - height / 2;
    // 超出可用区时按比例缩回
    const shrink = Math.min(
      1,
      fromX < minX ? (anchorX - minX) / (anchorX - fromX || 1) : 1,
      fromY < minY ? (anchorY - minY) / (anchorY - fromY || 1) : 1,
      fromX + width > maxX ? (maxX - anchorX) / (fromX + width - anchorX || 1) : 1,
      fromY + height > maxY ? (maxY - anchorY) / (fromY + height - anchorY || 1) : 1
    );
    width *= shrink;
    height *= shrink;
    left = handle.includes("w")
      ? anchorX - width
      : handle.includes("e")
        ? anchorX
        : anchorX - width / 2;
    top = handle.includes("n")
      ? anchorY - height
      : handle.includes("s")
        ? anchorY
        : anchorY - height / 2;
    return { x: left, y: top, width, height };
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** 不设边界的「舞台」：拖框时先按指针算出想要的框，再整体缩放放回舞台 */
const UNBOUNDED: Rect = { x: -1e7, y: -1e7, width: 2e7, height: 2e7 };

/** 拖动时保持不动的点：角把手取对角，边把手取对边中点 */
const handleAnchor = (frame: Rect, handle: FrameHandle): Vec => ({
  x: handle.includes("w")
    ? frame.x + frame.width
    : handle.includes("e")
      ? frame.x
      : frame.x + frame.width / 2,
  y: handle.includes("n")
    ? frame.y + frame.height
    : handle.includes("s")
      ? frame.y
      : frame.y + frame.height / 2,
});

/** 以 anchor 为不动点把 rect 放回 area 所需的缩放（≤ 1） */
function fitFactor(rect: Rect, anchor: Vec, area: Rect): number {
  let k = 1;
  const limit = (available: number, wanted: number) => {
    if (wanted > available && wanted > 1e-9) k = Math.min(k, Math.max(0, available) / wanted);
  };
  limit(anchor.x - area.x, anchor.x - rect.x);
  limit(area.x + area.width - anchor.x, rect.x + rect.width - anchor.x);
  limit(anchor.y - area.y, anchor.y - rect.y);
  limit(area.y + area.height - anchor.y, rect.y + rect.height - anchor.y);
  return k;
}

/**
 * 拖动裁剪框把手（整体效果）：框在舞台内时直接伸缩；拉到舞台边缘继续往外拖时，
 * 框贴边不动、画面以对边为锚点缩小，框里就框进更多内容。
 * 框永远不超出图片——拖到图片边缘即停，不会为了覆盖而放大图片。
 */
export function dragFrameHandle(
  start: CropViewState,
  handle: FrameHandle,
  delta: Vec,
  image: Size,
  stage: Size
): CropViewState {
  const area = stageArea(stage);
  const anchor = handleAnchor(start.frame, handle);
  const build = (t: number): CropViewState => {
    const frame = resizeFrameWithin(
      start.frame,
      handle,
      { x: delta.x * t, y: delta.y * t },
      start.aspect,
      UNBOUNDED
    );
    const k = fitFactor(frame, anchor, area);
    return {
      ...start,
      scale: start.scale * k,
      center: {
        x: anchor.x + (start.center.x - anchor.x) * k,
        y: anchor.y + (start.center.y - anchor.y) * k,
      },
      frame: {
        x: anchor.x + (frame.x - anchor.x) * k,
        y: anchor.y + (frame.y - anchor.y) * k,
        width: frame.width * k,
        height: frame.height * k,
      },
    };
  };
  const full = build(1);
  if (covered(full, image)) return full;
  // 超出图片：二分找到仍被图片覆盖的最远位置
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (covered(build(mid), image)) lo = mid;
    else hi = mid;
  }
  return build(lo);
}
