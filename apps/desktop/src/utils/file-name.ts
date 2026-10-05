// 不含 \t \n \v \f \r：这几个按空白折叠成空格，其余控制字符直接删除
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000E-\u001F\u007F]/g;
// Windows 文件名禁用字符（macOS / Linux 的禁用集是其子集）
const RESERVED_CHARS = /[<>:"/\\|?*]/g;

/**
 * 把标题净化为可用作文件名 / 目录名的字符串（不含扩展名）。
 * 删除控制字符、禁用字符替换为 "_"、连续空白折叠为单个空格、去掉末尾的点号与空格（Windows 不接受）；
 * 净化后为空时返回 fallback。
 */
export function sanitizeFileName(value: string | null | undefined, fallback: string): string {
  const sanitized = (value ?? "")
    .replace(CONTROL_CHARS, "")
    .replace(RESERVED_CHARS, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/, "")
    .trim();
  return sanitized || fallback;
}
