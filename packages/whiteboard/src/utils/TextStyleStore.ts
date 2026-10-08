import {
  DEFAULT_CARD_STYLE,
  DEFAULT_RICHTEXT_STYLE,
  TEXT_TONES,
  TextStyle,
  TextTone,
  TextVariant,
} from "../constants";

const VARIANTS: TextVariant[] = ["none", "plain", "band", "tinted"];

/** 记住上一次选的外观，新建同类元素时沿用；只存语义，旧版色值键不再读取 */
export class TextStyleStore {
  constructor(
    private readonly prefix: string,
    private readonly fallback: TextStyle
  ) {}

  save(style: TextStyle) {
    localStorage.setItem(`${this.prefix}-variant`, style.variant);
    if (style.tone) localStorage.setItem(`${this.prefix}-tone`, style.tone);
    else localStorage.removeItem(`${this.prefix}-tone`);
  }

  load(): TextStyle {
    const variant = localStorage.getItem(`${this.prefix}-variant`) as TextVariant | null;
    const tone = localStorage.getItem(`${this.prefix}-tone`) as TextTone | null;
    if (!variant || !VARIANTS.includes(variant)) return { ...this.fallback };
    const validTone = TEXT_TONES.find(t => t.value === tone)?.value;
    return validTone ? { variant, tone: validTone } : { variant };
  }
}

export const CardUtil = new TextStyleStore("whiteboard-card", DEFAULT_CARD_STYLE);
export const RichTextUtil = new TextStyleStore("whiteboard-richtext", DEFAULT_RICHTEXT_STYLE);
