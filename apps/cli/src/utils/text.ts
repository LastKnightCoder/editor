export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  const months = Math.floor(days / 30);
  return `${months}个月前`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN");
}

export function extractPlainText(contentJson: string | null): string {
  if (!contentJson) return "";
  try {
    const nodes = JSON.parse(contentJson);
    const texts: string[] = [];
    const walk = (node: any) => {
      if (node.text) texts.push(node.text);
      if (node.children) node.children.forEach(walk);
    };
    nodes.forEach(walk);
    return texts.join("").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

export function getStringWidth(str: string): number {
  let width = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0)!;
    if (
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe6f) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x2fffd) ||
      (code >= 0x30000 && code <= 0x3fffd)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

export function truncateToWidth(str: string, maxWidth: number): string {
  let width = 0;
  let result = "";
  for (const ch of str) {
    const code = ch.codePointAt(0)!;
    const charW =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe6f) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x2fffd) ||
      (code >= 0x30000 && code <= 0x3fffd)
        ? 2
        : 1;
    if (width + charW > maxWidth) break;
    result += ch;
    width += charW;
  }
  return result;
}

export function padEnd(str: string, targetWidth: number): string {
  const w = getStringWidth(str);
  if (w >= targetWidth) return str;
  return str + " ".repeat(targetWidth - w);
}
