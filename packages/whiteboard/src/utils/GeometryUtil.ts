import {
  DEFAULT_GEOMETRY_FILL,
  DEFAULT_GEOMETRY_FILL_OPACITY,
  DEFAULT_GEOMETRY_STROKE,
  DEFAULT_GEOMETRY_STROKE_OPACITY,
  DEFAULT_GEOMETRY_STROKE_WIDTH,
  DEFAULT_GEOMETRY_CORNER_RADIUS,
  DEFAULT_GEOMETRY_TEXT_ALIGN,
} from "../constants";
import type { GeometryElement } from "../plugins/GeometryPlugin";
import type { SketchFillStyle } from "../types";

const LOCAL_STORAGE_KEY = "whiteboard-geometry";

const FILL_STYLES: SketchFillStyle[] = ["solid", "hatch", "cross", "scribble"];

type GeometryTextAlign = GeometryElement["text"]["align"];

export class GeometryUtil {
  static setLocalStorage(key: string, value: string | undefined) {
    const realKey = `${LOCAL_STORAGE_KEY}-${key}`;
    if (value == null || value === "") {
      localStorage.removeItem(realKey);
      return;
    }
    localStorage.setItem(realKey, value);
  }

  static getLocalStorage(key: string) {
    const realKey = `${LOCAL_STORAGE_KEY}-${key}`;
    return localStorage.getItem(realKey);
  }

  // 读取数值，缺失或非法时回退默认值（避免 "0" 被逻辑或吞掉）
  private static getNumber(key: string, fallback: number): number {
    const raw = this.getLocalStorage(key);
    if (raw == null || raw === "") return fallback;
    const n = Number(raw);
    return Number.isNaN(n) ? fallback : n;
  }

  // 获取上次创建几何图形时使用的样式，用于新建时复用
  static getPrevGeometryStyle() {
    const fill = this.getLocalStorage("fill") ?? DEFAULT_GEOMETRY_FILL;
    const fillOpacity = this.getNumber("fillOpacity", DEFAULT_GEOMETRY_FILL_OPACITY);
    const stroke = this.getLocalStorage("stroke") ?? DEFAULT_GEOMETRY_STROKE;
    const strokeWidth = this.getNumber("strokeWidth", DEFAULT_GEOMETRY_STROKE_WIDTH);
    const strokeOpacity = this.getNumber("strokeOpacity", DEFAULT_GEOMETRY_STROKE_OPACITY);
    const color = this.getLocalStorage("color") ?? undefined;

    const themeRaw = this.getLocalStorage("theme");
    const theme: "light" | "dark" | undefined =
      themeRaw === "light" || themeRaw === "dark" ? themeRaw : undefined;

    const cornerRadius = this.getNumber("cornerRadius", DEFAULT_GEOMETRY_CORNER_RADIUS);

    const textAlignRaw = this.getLocalStorage("textAlign");
    const textAlign: GeometryTextAlign =
      textAlignRaw === "left" || textAlignRaw === "center" || textAlignRaw === "right"
        ? textAlignRaw
        : DEFAULT_GEOMETRY_TEXT_ALIGN;

    const fillStyleRaw = this.getLocalStorage("fillStyle");
    const fillStyle = FILL_STYLES.find(style => style === fillStyleRaw);

    return {
      fill,
      fillOpacity,
      stroke,
      strokeWidth,
      strokeOpacity,
      color,
      theme,
      cornerRadius,
      textAlign,
      fillStyle,
    } as const;
  }
}
