import { Descendant } from "slate";

/**
 * 生成内容哈希值，用于冲突检测
 * 使用简单的哈希算法（基于字符串处理）
 */
export function generateContentHash(content: Descendant[]): string {
  const jsonStr = JSON.stringify(content);

  // 使用简单的哈希算法
  let hash = 0;
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // 转换为 32 位整数
  }

  // 转换为十六进制字符串
  return Math.abs(hash).toString(16).padStart(8, "0");
}
