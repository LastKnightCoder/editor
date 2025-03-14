import {
  DEFAULT_GEOMETRY_FILL,
  DEFAULT_GEOMETRY_FILL_OPACITY,
  DEFAULT_GEOMETRY_STROKE,
  DEFAULT_GEOMETRY_STROKE_OPACITY,
  DEFAULT_GEOMETRY_STROKE_WIDTH,
} from "../constants";

const LOCAL_STOAGR_KEY = "whiteboard-geometry";

export class GeometryUtil {
  static setLocalStorage(key: string, value: string) {
    const realKey = `${LOCAL_STOAGR_KEY}-${key}`;
    localStorage.setItem(realKey, value);
  }

  static getLocalStorage(key: string) {
    const realKey = `${LOCAL_STOAGR_KEY}-${key}`;
    return localStorage.getItem(realKey);
  }

  static getPrevGeometryStyle() {
    const fill = (this.getLocalStorage("fill") ||
      DEFAULT_GEOMETRY_FILL) as string;
    const fillOpacity = (this.getLocalStorage("fillOpacity") ||
      DEFAULT_GEOMETRY_FILL_OPACITY) as number;
    const stroke = (this.getLocalStorage("stroke") ||
      DEFAULT_GEOMETRY_STROKE) as string;
    const strokeWidth = (this.getLocalStorage("strokeWidth") ||
      DEFAULT_GEOMETRY_STROKE_WIDTH) as number;
    const strokeOpacity = (this.getLocalStorage("strokeOpacity") ||
      DEFAULT_GEOMETRY_STROKE_OPACITY) as number;

    return {
      fill,
      fillOpacity,
      stroke,
      strokeWidth,
      strokeOpacity,
    } as const;
  }
}
