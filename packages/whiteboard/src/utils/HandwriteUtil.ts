import { getStroke, StrokeOptions } from "perfect-freehand";
import { getDefaultThemeColorId } from "../constants/theme-colors";

export const HANDWRITE_STYLE_STORAGE_KEY = "whiteboard-handwrite-style-v1";

export interface HandwriteStyle {
  themeColorId: string;
  opacity: number;
  size: number;
  thinning: number;
  smoothing: number;
  streamline: number;
  simulatePressure: boolean;
  startCap: boolean;
  endCap: boolean;
}

export interface HandwriteInputPoint {
  x: number;
  y: number;
  pressure: number;
}

export type HandwriteOutlinePoint = [number, number];

export interface HandwriteBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HandwriteGeometryData extends HandwriteBounds {
  points: HandwriteInputPoint[];
  outline: HandwriteOutlinePoint[];
}

const DEFAULT_HANDWRITE_STYLE: HandwriteStyle = {
  themeColorId: getDefaultThemeColorId(),
  opacity: 1,
  size: 8,
  thinning: 0.6,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: true,
  startCap: true,
  endCap: true,
};

const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const getStorage = (): Storage | null => {
  const maybeStorage = (globalThis as { localStorage?: Storage }).localStorage;
  return maybeStorage ?? null;
};

const normalizeStyle = (value?: Partial<HandwriteStyle> | null): HandwriteStyle => {
  if (!value || typeof value !== "object") {
    return getDefaultHandwriteStyle();
  }

  return {
    themeColorId:
      typeof value.themeColorId === "string" && value.themeColorId.trim()
        ? value.themeColorId
        : DEFAULT_HANDWRITE_STYLE.themeColorId,
    opacity: clamp(
      typeof value.opacity === "number" ? value.opacity : DEFAULT_HANDWRITE_STYLE.opacity,
      0.1,
      1
    ),
    size: clamp(typeof value.size === "number" ? value.size : DEFAULT_HANDWRITE_STYLE.size, 1, 64),
    thinning: clamp(
      typeof value.thinning === "number" ? value.thinning : DEFAULT_HANDWRITE_STYLE.thinning,
      0,
      1
    ),
    smoothing: clamp(
      typeof value.smoothing === "number" ? value.smoothing : DEFAULT_HANDWRITE_STYLE.smoothing,
      0,
      1
    ),
    streamline: clamp(
      typeof value.streamline === "number" ? value.streamline : DEFAULT_HANDWRITE_STYLE.streamline,
      0,
      1
    ),
    simulatePressure:
      typeof value.simulatePressure === "boolean"
        ? value.simulatePressure
        : DEFAULT_HANDWRITE_STYLE.simulatePressure,
    startCap:
      typeof value.startCap === "boolean" ? value.startCap : DEFAULT_HANDWRITE_STYLE.startCap,
    endCap: typeof value.endCap === "boolean" ? value.endCap : DEFAULT_HANDWRITE_STYLE.endCap,
  };
};

export const getDefaultHandwriteStyle = (): HandwriteStyle => {
  return {
    ...DEFAULT_HANDWRITE_STYLE,
  };
};

export const getPrevHandwriteStyle = (): HandwriteStyle => {
  try {
    const storage = getStorage();
    if (!storage) return getDefaultHandwriteStyle();
    const raw = storage.getItem(HANDWRITE_STYLE_STORAGE_KEY);
    if (!raw) return getDefaultHandwriteStyle();
    return normalizeStyle(JSON.parse(raw) as Partial<HandwriteStyle>);
  } catch {
    return getDefaultHandwriteStyle();
  }
};

export const saveHandwriteStyle = (style: HandwriteStyle): void => {
  try {
    const storage = getStorage();
    if (!storage) return;
    storage.setItem(HANDWRITE_STYLE_STORAGE_KEY, JSON.stringify(normalizeStyle(style)));
  } catch {
    // 忽略本地持久化失败
  }
};

export const buildStrokeOutline = (
  points: HandwriteInputPoint[],
  style: HandwriteStyle
): HandwriteOutlinePoint[] => {
  if (!Array.isArray(points) || points.length < 2) return [];

  const normalizedStyle = normalizeStyle(style);
  const options: StrokeOptions = {
    size: normalizedStyle.size,
    thinning: normalizedStyle.thinning,
    smoothing: normalizedStyle.smoothing,
    streamline: normalizedStyle.streamline,
    simulatePressure: normalizedStyle.simulatePressure,
    start: {
      cap: normalizedStyle.startCap,
    },
    end: {
      cap: normalizedStyle.endCap,
    },
    last: true,
  };

  const strokeInput: [number, number, number][] = points.map(point => [
    point.x,
    point.y,
    clamp(point.pressure ?? 0.5, 0, 1),
  ]);

  return getStroke(strokeInput, options) as HandwriteOutlinePoint[];
};

export const getPointsBounds = (
  points: Array<HandwriteInputPoint | HandwriteOutlinePoint>
): HandwriteBounds | null => {
  if (!Array.isArray(points) || points.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  points.forEach(point => {
    const x = Array.isArray(point) ? point[0] : point.x;
    const y = Array.isArray(point) ? point[1] : point.y;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
};

export const normalizePoints = (
  points: HandwriteInputPoint[],
  bounds: HandwriteBounds
): HandwriteInputPoint[] => {
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);

  return points.map(point => ({
    x: (point.x - bounds.x) / width,
    y: (point.y - bounds.y) / height,
    pressure: clamp(point.pressure ?? 0.5, 0, 1),
  }));
};

export const denormalizePoints = (
  points: HandwriteInputPoint[],
  bounds: HandwriteBounds
): HandwriteInputPoint[] => {
  return points.map(point => ({
    x: bounds.x + point.x * bounds.width,
    y: bounds.y + point.y * bounds.height,
    pressure: clamp(point.pressure ?? 0.5, 0, 1),
  }));
};

export const normalizeOutline = (
  points: HandwriteOutlinePoint[],
  bounds: HandwriteBounds
): HandwriteOutlinePoint[] => {
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);

  return points.map(([x, y]) => [(x - bounds.x) / width, (y - bounds.y) / height]);
};

export const denormalizeOutline = (
  points: HandwriteOutlinePoint[],
  bounds: HandwriteBounds
): HandwriteOutlinePoint[] => {
  return points.map(([x, y]) => [bounds.x + x * bounds.width, bounds.y + y * bounds.height]);
};

export const outlineToSvgPath = (points: HandwriteOutlinePoint[]): string => {
  if (!Array.isArray(points) || points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    const [x, y] = points[0];
    return `M ${x} ${y} Z`;
  }

  const [firstX, firstY] = points[0];
  let path = `M ${firstX} ${firstY} Q`;

  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    path += ` ${x0} ${y0} ${mx} ${my}`;
  }

  return `${path} Z`;
};

export const rebuildHandwriteGeometry = (
  normalizedPoints: HandwriteInputPoint[],
  currentBounds: HandwriteBounds,
  style: HandwriteStyle
): HandwriteGeometryData | null => {
  if (!Array.isArray(normalizedPoints) || normalizedPoints.length < 2) {
    return null;
  }

  const absolutePoints = denormalizePoints(normalizedPoints, currentBounds);
  const absoluteOutline = buildStrokeOutline(absolutePoints, style);
  const nextBounds = getPointsBounds(absoluteOutline);
  if (!nextBounds) return null;

  return {
    ...nextBounds,
    points: normalizePoints(absolutePoints, nextBounds),
    outline: normalizeOutline(absoluteOutline, nextBounds),
  };
};
