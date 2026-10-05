import { ArrowElement, EArrowLineType, EMarkerType } from "../types/arrow";
import { getDefaultThemeColorId } from "../constants/theme-colors";

const LOCAL_STORAGE_KEY = "whiteboard-arrow-style-v1";

export interface ArrowStylePreset {
  lineType: EArrowLineType;
  sourceMarker: EMarkerType;
  targetMarker: EMarkerType;
  lineWidth: number;
  themeColorId: string;
  dashed: boolean;
  dashArray: number[];
  animated: boolean;
  animationSpeed: number;
}

const DEFAULT_ARROW_STYLE_PRESET: ArrowStylePreset = {
  lineType: EArrowLineType.STRAIGHT,
  sourceMarker: EMarkerType.None,
  targetMarker: EMarkerType.Arrow,
  lineWidth: 2,
  themeColorId: getDefaultThemeColorId(),
  dashed: false,
  dashArray: [5, 5],
  animated: false,
  animationSpeed: 3,
};

const LINE_TYPE_SET = new Set<EArrowLineType>(Object.values(EArrowLineType));
const MARKER_TYPE_SET = new Set<EMarkerType>(Object.values(EMarkerType));

const getStorage = (): Storage | null => {
  const maybeStorage = (globalThis as { localStorage?: Storage }).localStorage;
  return maybeStorage ?? null;
};

const getNumberOrDefault = (value: unknown, defaultValue: number): number => {
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
};

const getBooleanOrDefault = (value: unknown, defaultValue: boolean): boolean => {
  return typeof value === "boolean" ? value : defaultValue;
};

const getDashArrayOrDefault = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [...DEFAULT_ARROW_STYLE_PRESET.dashArray];
  }

  const dashArray = value
    .map(item => (typeof item === "number" ? item : Number.NaN))
    .filter(item => Number.isFinite(item) && item > 0);

  if (dashArray.length === 0) {
    return [...DEFAULT_ARROW_STYLE_PRESET.dashArray];
  }

  return dashArray;
};

const normalizePreset = (value: Partial<ArrowStylePreset> | null | undefined): ArrowStylePreset => {
  if (!value || typeof value !== "object") {
    return getDefaultArrowStylePreset();
  }

  return {
    lineType: LINE_TYPE_SET.has(value.lineType as EArrowLineType)
      ? (value.lineType as EArrowLineType)
      : DEFAULT_ARROW_STYLE_PRESET.lineType,
    sourceMarker: MARKER_TYPE_SET.has(value.sourceMarker as EMarkerType)
      ? (value.sourceMarker as EMarkerType)
      : DEFAULT_ARROW_STYLE_PRESET.sourceMarker,
    targetMarker: MARKER_TYPE_SET.has(value.targetMarker as EMarkerType)
      ? (value.targetMarker as EMarkerType)
      : DEFAULT_ARROW_STYLE_PRESET.targetMarker,
    lineWidth: getNumberOrDefault(value.lineWidth, DEFAULT_ARROW_STYLE_PRESET.lineWidth),
    themeColorId:
      typeof value.themeColorId === "string" && value.themeColorId
        ? value.themeColorId
        : DEFAULT_ARROW_STYLE_PRESET.themeColorId,
    dashed: getBooleanOrDefault(value.dashed, DEFAULT_ARROW_STYLE_PRESET.dashed),
    dashArray: getDashArrayOrDefault(value.dashArray),
    animated: getBooleanOrDefault(value.animated, DEFAULT_ARROW_STYLE_PRESET.animated),
    animationSpeed: getNumberOrDefault(
      value.animationSpeed,
      DEFAULT_ARROW_STYLE_PRESET.animationSpeed
    ),
  };
};

export const getDefaultArrowStylePreset = (): ArrowStylePreset => {
  return {
    ...DEFAULT_ARROW_STYLE_PRESET,
    dashArray: [...DEFAULT_ARROW_STYLE_PRESET.dashArray],
  };
};

export const getPrevArrowStylePreset = (): ArrowStylePreset => {
  try {
    const storage = getStorage();
    if (!storage) return getDefaultArrowStylePreset();
    const rawValue = storage.getItem(LOCAL_STORAGE_KEY);
    if (!rawValue) return getDefaultArrowStylePreset();

    const parsedValue = JSON.parse(rawValue) as Partial<ArrowStylePreset>;
    return normalizePreset(parsedValue);
  } catch {
    return getDefaultArrowStylePreset();
  }
};

export const saveArrowStylePresetFromElement = (element: ArrowElement) => {
  try {
    const storage = getStorage();
    if (!storage) return;

    const preset = normalizePreset({
      lineType: element.lineType,
      sourceMarker: element.source.marker,
      targetMarker: element.target.marker,
      lineWidth: element.lineWidth,
      themeColorId: element.themeColorId,
      dashed: element.dashed,
      dashArray: element.dashArray,
      animated: element.animated,
      animationSpeed: element.animationSpeed,
    });

    storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(preset));
  } catch {
    // 本地持久化失败时不影响主流程
  }
};
