/**
 * 封面派生色：12 色粉彩渐变板按 key 派生（同一对象永远同一色、相邻错色；
 * 出处 mockups/articles 2026-09-19 裁决，双主题共用）。设计定稿的数据色，
 * 与热力图色阶同性质，不进主题词表。文章卡/详情 hero 与 Database 画廊卡共用。
 */

/** 封面派生色板：12 色粉彩渐变 */
const COVER_GRADIENTS = [
  "linear-gradient(140deg, #e8c4a8, #d9885f)",
  "linear-gradient(140deg, #ccd8c2, #96ab8a)",
  "linear-gradient(140deg, #c8d2dd, #92a5b8)",
  "linear-gradient(140deg, #e2cf9f, #c0a05e)",
  "linear-gradient(140deg, #e5c9c4, #c98d84)",
  "linear-gradient(140deg, #cfc8ba, #a39682)",
  "linear-gradient(140deg, #eccaa2, #d89a5e)",
  "linear-gradient(140deg, #d3dcc6, #a3b58e)",
  "linear-gradient(140deg, #cfe0dc, #9dbbb4)",
  "linear-gradient(140deg, #ddd4e0, #b3a3c4)",
  "linear-gradient(140deg, #eed3c2, #dd9a86)",
  "linear-gradient(140deg, #ddd8a5, #b3a860)",
] as const;

/** 数字 id 派生（相邻 id 错开取色 ×7 mod 12） */
export const coverGradientOf = (id: number): string => COVER_GRADIENTS[(id * 7 + 3) % 12];

/** djb2：字符串 key 派生为稳定正整数（Database 行 id 是字符串，取同一错色系数） */
const hashKey = (key: string): number => {
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
};

/** 字符串 key 派生（Database 画廊行等无数字 id 的对象） */
export const coverGradientOfKey = (key: string): string =>
  COVER_GRADIENTS[(hashKey(key) * 7 + 3) % 12];
