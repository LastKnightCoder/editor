import { 
  DEFAULT_CARD_BACKGROUND,
  DEFAULT_CARD_TOP_COLOR,
  DEFAULT_CARD_COLOR,
  DEFAULT_CARD_STROKE,
  DEFAULT_CARD_STROKE_WIDTH,
  DEFAULT_CARD_STROKE_OPACITY,
} from "../constants";

const LOCAL_STORAGE_KEY = 'whiteboard-card'

export class CardUtil {
  static setLocalStorage(key: string, value: string) {
    const realKey = `${LOCAL_STORAGE_KEY}-${key}`;
    localStorage.setItem(realKey, value);
  }

  static getLocalStorage(key: string) {
    const realKey = `${LOCAL_STORAGE_KEY}-${key}`;
    return localStorage.getItem(realKey);
  }

  static getPrevCardStyle() {
    const background = (this.getLocalStorage('background') || DEFAULT_CARD_BACKGROUND) as string;
    const topColor = (this.getLocalStorage('topColor') || DEFAULT_CARD_TOP_COLOR) as string;
    const color =(this.getLocalStorage('color') || DEFAULT_CARD_COLOR)
    const stroke = (this.getLocalStorage('stroke') || DEFAULT_CARD_STROKE) as string;
    const strokeWidth = (this.getLocalStorage('strokeWidth') || DEFAULT_CARD_STROKE_WIDTH) as number;
    const strokeOpacity = (this.getLocalStorage('strokeOpacity') || DEFAULT_CARD_STROKE_OPACITY) as number;

    return {
      background,
      topColor,
      color,
      stroke,
      strokeWidth,
      strokeOpacity,
    } as const;
  }
}

