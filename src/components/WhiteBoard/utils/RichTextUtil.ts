import {
  DEFAULT_RICHTEXT_BACKGROUND,
  DEFAULT_RICHTEXT_TOP_COLOR,
  DEFAULT_RICHTEXT_STROKE,
  DEFAULT_RICHTEXT_STROKE_WIDTH,
  DEFAULT_RICHTEXT_STROKE_OPACITY,
  DEFAULT_RICHTEXT_COLOR,
} from "../constants";

const LOCAL_STORAGE_KEY = "whiteboard-richtext";

export class RichTextUtil {
  static setLocalStorage(key: string, value: string) {
    const realKey = `${LOCAL_STORAGE_KEY}-${key}`;
    localStorage.setItem(realKey, value);
  }

  static getLocalStorage(key: string) {
    const realKey = `${LOCAL_STORAGE_KEY}-${key}`;
    return localStorage.getItem(realKey);
  }

  static getPrevRichtextStyle() {
    const stroke = (this.getLocalStorage("stroke") ||
      DEFAULT_RICHTEXT_STROKE) as string;
    const strokeWidth = (this.getLocalStorage("strokeWidth") ||
      DEFAULT_RICHTEXT_STROKE_WIDTH) as number;
    const strokeOpacity = (this.getLocalStorage("strokeOpacity") ||
      DEFAULT_RICHTEXT_STROKE_OPACITY) as number;
    const background = (this.getLocalStorage("background") ||
      DEFAULT_RICHTEXT_BACKGROUND) as string;
    const topColor = (this.getLocalStorage("topColor") ||
      DEFAULT_RICHTEXT_TOP_COLOR) as string;
    const color = (this.getLocalStorage("color") ||
      DEFAULT_RICHTEXT_COLOR) as string;

    return {
      background,
      topColor,
      stroke,
      strokeWidth,
      strokeOpacity,
      color,
    } as const;
  }
}
