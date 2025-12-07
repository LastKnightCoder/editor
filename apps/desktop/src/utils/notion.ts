/**
 * 从 Notion 链接或纯 ID 中提取 blockId
 * 示例输入:
 * - https://www.notion.so/.../...#3b628e1d84da4c6c900db6e4a28532e1
 * - 3b628e1d84da4c6c900db6e4a28532e1
 * - 3b628e1d-84da-4c6c-900d-b6e4a28532e1
 *
 * 示例输出: 3b628e1d-84da-4c6c-900d-b6e4a28532e1
 */
export function parseNotionBlockId(input: string): string | null {
  if (!input || typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();

  // 尝试从 URL 中提取 blockId（可能在 hash 中）
  if (trimmed.startsWith("http")) {
    try {
      const url = new URL(trimmed);

      // 检查 hash 部分
      if (url.hash) {
        const hashId = url.hash.substring(1); // 移除 #
        if (isValidNotionBlockId(hashId)) {
          return formatNotionBlockId(hashId);
        }
      }

      // 检查 pathname 的最后一部分（可能是 blockId）
      const pathParts = url.pathname.split("/").filter((p) => p);
      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1];

        // Notion 的 URL 格式通常是: title-blockId 或直接是 blockId
        // 尝试从最后一部分提取 blockId
        const parts = lastPart.split("-");
        if (parts.length > 0) {
          // 取最后32个字符（可能是连续的blockId）
          const possibleId = parts.slice(-5).join(""); // 取最后几部分拼接
          if (possibleId.length === 32 && /^[a-f0-9]{32}$/i.test(possibleId)) {
            return formatNotionBlockId(possibleId);
          }
        }

        // 直接检查最后一部分是否是有效的 blockId
        if (isValidNotionBlockId(lastPart)) {
          return formatNotionBlockId(lastPart);
        }
      }
    } catch (error) {
      // URL 解析失败，继续尝试作为纯 ID 处理
    }
  }

  // 作为纯 blockId 处理
  if (isValidNotionBlockId(trimmed)) {
    return formatNotionBlockId(trimmed);
  }

  return null;
}

/**
 * 格式化 blockId，确保有连字符
 * 输入: 3b628e1d84da4c6c900db6e4a28532e1 或 3b628e1d-84da-4c6c-900d-b6e4a28532e1
 * 输出: 3b628e1d-84da-4c6c-900d-b6e4a28532e1
 */
export function formatNotionBlockId(blockId: string): string {
  if (!blockId) {
    return "";
  }

  // 移除所有连字符
  const cleaned = blockId.replace(/-/g, "").toLowerCase();

  // 检查是否是有效的 32 字符十六进制字符串
  if (cleaned.length !== 32 || !/^[a-f0-9]{32}$/.test(cleaned)) {
    return blockId; // 返回原始输入
  }

  // 格式化为 UUID 格式: 8-4-4-4-12
  return `${cleaned.substring(0, 8)}-${cleaned.substring(8, 12)}-${cleaned.substring(12, 16)}-${cleaned.substring(16, 20)}-${cleaned.substring(20, 32)}`;
}

/**
 * 验证 blockId 格式是否有效
 * 有效格式:
 * - 3b628e1d84da4c6c900db6e4a28532e1 (32 个十六进制字符)
 * - 3b628e1d-84da-4c6c-900d-b6e4a28532e1 (UUID 格式)
 */
export function isValidNotionBlockId(blockId: string): boolean {
  if (!blockId || typeof blockId !== "string") {
    return false;
  }

  const cleaned = blockId.replace(/-/g, "");

  // 检查是否是 32 个十六进制字符
  return cleaned.length === 32 && /^[a-f0-9]{32}$/i.test(cleaned);
}

/**
 * 检查输入是否看起来像 Notion 链接
 */
export function isNotionUrl(input: string): boolean {
  if (!input || typeof input !== "string") {
    return false;
  }

  return input.includes("notion.so") || input.includes("notion.site");
}
