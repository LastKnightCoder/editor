/**
 * 预设色：设计数据色（同文章封面派生色口径），按 id 派生、不加字段，全走主题语义类；
 * 已删除的预设退为 ink-3。Tailwind 需要完整类名字面量，不能拼接。
 */

const DOT_TONES = ["bg-accent", "bg-tag-2", "bg-tag-1", "bg-tag-3", "bg-tag-4", "bg-tag-5"];

export function presetDotClass(presetId: number, exists = true): string {
  if (!exists) return "bg-ink-3";
  return DOT_TONES[(((presetId - 1) % DOT_TONES.length) + DOT_TONES.length) % DOT_TONES.length];
}

export const DELETED_PRESET_NAME = "已删除的预设";
