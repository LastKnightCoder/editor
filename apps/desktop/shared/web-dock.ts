/** 右栏网页的独立浏览分区：不带应用 preload，与剪藏 / 本地资源用的 persist:main 隔离 */
export const WEB_DOCK_PARTITION = "persist:web-dock";
export const WEB_DOCK_ESCAPE = "web-dock:escape";

/** 右栏只承载 http(s) 网页；本地文件与应用协议走各自的入口 */
export function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
