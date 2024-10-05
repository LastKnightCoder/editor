import { 
  DEFAULT_RICHTEXT_FILL, 
  DEFAULT_RICHTEXT_FILL_OPACITY, 
  DEFAULT_RICHTEXT_STROKE,
  DEFAULT_RICHTEXT_STROKE_WIDTH,
  DEFAULT_RICHTEXT_STROKE_OPACITY,
} from "../constants";

const LOCAL_STOAGR_KEY = 'whiteboard-richtext'

export class RichTextUtil {
  static setLocalStorage(key: string, value: string) {
    const realKey = `${LOCAL_STOAGR_KEY}-${key}`;
    localStorage.setItem(realKey, value);
  }

  static getLocalStorage(key: string) {
    const realKey = `${LOCAL_STOAGR_KEY}-${key}`;
    return localStorage.getItem(realKey);
  }

  static getPrevRichtextStyle() {
    const fill = (this.getLocalStorage('fill') || DEFAULT_RICHTEXT_FILL) as string;
    const fillOpacity = (this.getLocalStorage('fillOpacity') || DEFAULT_RICHTEXT_FILL_OPACITY) as number;
    const stroke = (this.getLocalStorage('stroke') || DEFAULT_RICHTEXT_STROKE) as string;
    const strokeWidth = (this.getLocalStorage('strokeWidth') || DEFAULT_RICHTEXT_STROKE_WIDTH) as number;
    const strokeOpacity = (this.getLocalStorage('strokeOpacity') || DEFAULT_RICHTEXT_STROKE_OPACITY) as number;

    return {
      fill,
      fillOpacity,
      stroke,
      strokeWidth,
      strokeOpacity,
    } as const;
  }
}

