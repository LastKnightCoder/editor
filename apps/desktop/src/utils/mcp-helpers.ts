/**
 * 操作时间段
 */
export interface OperationPeriod {
  startTime: string; // "YYYY-MM-DD HH:mm:ss"
  endTime: string;
  durationSeconds: number;
}

/**
 * 安全截断 Markdown 内容
 */
export function truncateMarkdown(
  markdown: string,
  maxLength?: number
): { content: string; truncated: boolean } {
  if (!maxLength || markdown.length <= maxLength) {
    return { content: markdown, truncated: false };
  }

  // 在合理的位置截断（段落、句子）
  let truncated = markdown.substring(0, maxLength);

  // 找到最后一个段落或句子结束符
  const breakPoints = ["\n\n", "\n", "。", "！", "？", ".", "!", "?"];
  let bestBreak = -1;

  for (const bp of breakPoints) {
    const idx = truncated.lastIndexOf(bp);
    if (idx > maxLength * 0.8) {
      // 至少保留 80%
      bestBreak = idx + bp.length;
      break;
    }
  }

  if (bestBreak > 0) {
    truncated = truncated.substring(0, bestBreak);
  }

  return {
    content: truncated + "\n\n[内容已截断...]",
    truncated: true,
  };
}
