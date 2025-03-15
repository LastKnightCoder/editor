declare module "pinyin" {
  interface PinyinOptions {
    style?: number;
    heteronym?: boolean;
  }
  namespace pinyin {
    const STYLE_NORMAL: number;
    const STYLE_TONE: number;
    const STYLE_TONE2: number;
    const STYLE_TO3NE: number;
    const STYLE_INITIALS: number;
    const STYLE_FIRST_LETTER: number;
    function pinyin(text: string, options?: PinyinOptions): string[][];
  }

  export = pinyin;
}
