/**
 * 提及面板的触发词解析：
 * - @ 单字符即触发；
 * - [[ / 【【 对齐 Obsidian 的 wiki 链接输入习惯（中文输入法下用全角括号），
 *   需要光标前已有同款括号、本次输入补齐成对才触发。
 */

/** 从「本次输入 + 光标前字符」解析触发词，未命中返回 null */
export function resolveMentionTrigger(incoming: string, charBeforeCursor: string): string | null {
  if (incoming === "@") return "@";
  // 个别输入法 / 粘贴路径可能一次送入两个字符
  if (incoming === "[[" || incoming === "【【") return incoming;
  if ((incoming === "[" || incoming === "【") && charBeforeCursor === incoming) {
    return `${incoming}${incoming}`;
  }
  return null;
}
