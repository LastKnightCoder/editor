import type { ClientInfo } from "@tau/shared/browser-companion";

interface UADataLike {
  brands?: Array<{ brand: string }>;
  platform?: string;
}

const BRAND_NAMES: Array<[RegExp, string]> = [
  [/Edge/i, "Edge"],
  [/Opera/i, "Opera"],
  [/Brave/i, "Brave"],
  [/Vivaldi/i, "Vivaldi"],
  [/Chrome/i, "Chrome"],
];

/** 给 Tau 授权弹窗看的浏览器与系统名；只用于展示，不参与鉴权 */
export function describeClient(
  userAgent: string,
  uaData: UADataLike | undefined,
  version: string
): ClientInfo {
  let browser = "";
  if (/Firefox\//.test(userAgent)) browser = "Firefox";
  else if (/Edg\//.test(userAgent)) browser = "Edge";
  else {
    const brands = (uaData?.brands ?? []).map(item => item.brand).join(" ");
    browser = BRAND_NAMES.find(([pattern]) => pattern.test(brands))?.[1] ?? "";
    if (!browser && /Chrome\//.test(userAgent)) browser = "Chrome";
  }
  const platform = uaData?.platform || userAgent;
  const os = /mac/i.test(platform)
    ? "macOS"
    : /win/i.test(platform)
      ? "Windows"
      : /linux|x11/i.test(platform)
        ? "Linux"
        : /cros/i.test(platform)
          ? "ChromeOS"
          : "";
  return { browser: browser || "浏览器", os, version };
}
