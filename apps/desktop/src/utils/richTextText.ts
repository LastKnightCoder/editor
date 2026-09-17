/**
 * 把 Slate 富文本 JSON 压成一段纯文本，用于列表摘要。
 * 与移动端 apps/mobile/src/utils/richTextText.ts 同构（两端同词汇）：
 * 不做 Markdown 语法剥离——正文里的 ###/** 等若为字面存储则如实展示，
 * 清理应发生在写入/索引层而非展示层。
 */

export function richTextPlainText(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const record = node as Record<string, unknown>;
    const text = record.text;
    if (typeof text === "string" && text.trim()) {
      parts.push(text.trim());
    }
    const children = record.children;
    if (Array.isArray(children)) {
      children.forEach(walk);
    }
  };
  content.forEach(walk);
  return parts.join(" ");
}

/** 截断摘要（按字符数，中文友好） */
export function clampText(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}…`;
}
