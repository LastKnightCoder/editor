/** 链接地址的纯函数：补全、校验与展示，不依赖编辑器运行时。 */

// 冒号后紧跟数字是端口（localhost:3000），不是协议
const SCHEME = /^[a-z][\w+.-]*:(?!\d)/i;
const DOMAIN_LIKE = /^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?([/?#]|$)/i;

/** 补全协议：像域名的补 https://，带协议、锚点、相对路径的原样保留。 */
export function normalizeLinkUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (SCHEME.test(value) || /^[#/.?]/.test(value)) return value;
  if (DOMAIN_LIKE.test(value)) return `https://${value}`;
  return value;
}

/** 只拦明显的输入错误（含空白、协议写错）；相对路径和锚点放行。 */
export function isInvalidLinkUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  return (
    /\s/.test(value) ||
    // http//、https// 漏冒号
    /^https?\/\//i.test(value) ||
    // https:/x、https:x 斜杠不全
    /^https?:(?!\/\/)/i.test(value) ||
    // htp:、htps:、htts: 拼错
    /^(htp|htps|htts|htpp)s?:/i.test(value)
  );
}

/** 剪贴板文本是否为单个网址（粘贴成链的认领条件）。 */
export function isPastedUrl(text: string): boolean {
  return /^(https?:\/\/|www\.)[^\s]+$/i.test(text.trim());
}

/** 无文字插入时用作链接文字：去掉协议与末尾斜杠。 */
export function linkDisplayText(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "") || url;
}

/** 浮层展示用：域名与路径分开，非 http(s) 地址整体作为 host。 */
export function splitLinkUrl(url: string): { host: string; rest: string } {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { host: url, rest: "" };
    const rest = `${parsed.pathname}${parsed.search}${parsed.hash}`.replace(/^\/$/, "");
    return { host: parsed.host.replace(/^www\./, ""), rest };
  } catch {
    return { host: url, rest: "" };
  }
}
