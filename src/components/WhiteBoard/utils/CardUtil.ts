import { 
  DEFAULT_CARD_FILL, 
  DEFAULT_CARD_FILL_OPACITY, 
  DEFAULT_CARD_STROKE,
  DEFAULT_CARD_STROKE_WIDTH,
  DEFAULT_CARD_STROKE_OPACITY,
} from "../constants";

const LOCAL_STOAGR_KEY = 'whiteboard-card'

export class CardUtil {
  static setLocalStorage(key: string, value: string) {
    const realKey = `${LOCAL_STOAGR_KEY}-${key}`;
    localStorage.setItem(realKey, value);
  }

  static getLocalStorage(key: string) {
    const realKey = `${LOCAL_STOAGR_KEY}-${key}`;
    return localStorage.getItem(realKey);
  }

  static getPrevCardStyle() {
    const fill = (this.getLocalStorage('fill') || DEFAULT_CARD_FILL) as string;
    const fillOpacity = (this.getLocalStorage('fillOpacity') || DEFAULT_CARD_FILL_OPACITY) as number;
    const stroke = (this.getLocalStorage('stroke') || DEFAULT_CARD_STROKE) as string;
    const strokeWidth = (this.getLocalStorage('strokeWidth') || DEFAULT_CARD_STROKE_WIDTH) as number;
    const strokeOpacity = (this.getLocalStorage('strokeOpacity') || DEFAULT_CARD_STROKE_OPACITY) as number;

    return {
      fill,
      fillOpacity,
      stroke,
      strokeWidth,
      strokeOpacity,
    } as const;
  }
}

