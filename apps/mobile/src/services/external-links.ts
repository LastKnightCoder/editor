/** 与桌面宿主一致：插件的外部新窗口请求交给系统浏览器，不在应用里创建 WebView。 */
export function installExternalLinkBridge(
  host: Window,
  open: (url: string) => Promise<void>,
  reportError: (message: string) => void
): () => void {
  const original = host.open;
  let active = true;
  const bridge: Window["open"] = (url, target, features) => {
    if (!active || url === undefined || url === "")
      return original.call(host, url, target, features);
    let parsed: URL;
    try {
      parsed = new URL(String(url), host.location.href);
    } catch {
      reportError("外部链接地址无效");
      return null;
    }
    if (!["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol))
      return original.call(host, url, target, features);
    void (async () => {
      await open(parsed.href);
    })().catch(() => {
      if (active) reportError("无法打开外部链接，请稍后重试");
    });
    return null;
  };
  host.open = bridge;
  return () => {
    active = false;
    if (host.open === bridge) host.open = original;
  };
}
