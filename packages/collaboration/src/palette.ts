/**
 * 成员识别色板：oklch 统一亮度排布，明暗主题下白字均可读；
 * 色相环绕覆盖全色环，避开高亮度黄绿区间以保证对比度。
 */
const MEMBER_PALETTE = [
  "oklch(0.55 0.2 25)", // 红
  "oklch(0.63 0.16 50)", // 橙
  "oklch(0.66 0.13 75)", // 琥珀
  "oklch(0.6 0.13 130)", // 黄绿
  "oklch(0.58 0.13 155)", // 绿
  "oklch(0.62 0.11 185)", // 青绿
  "oklch(0.6 0.12 215)", // 青
  "oklch(0.55 0.18 250)", // 蓝
  "oklch(0.53 0.18 275)", // 靛
  "oklch(0.52 0.2 300)", // 紫
  "oklch(0.56 0.21 330)", // 品红
  "oklch(0.58 0.2 355)", // 玫红
] as const;

/** 成员色底上的文字与描边色：色板亮度按白色可读设计，明暗主题通用。 */
export const MEMBER_INK = "white";

/** 由设备 ID 稳定派生成员色：同一成员在头像、光标、名牌、选区上颜色一致。 */
export function memberColor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return MEMBER_PALETTE[Math.abs(hash) % MEMBER_PALETTE.length];
}
