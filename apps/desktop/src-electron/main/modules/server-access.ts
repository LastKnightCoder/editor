import { posix } from "node:path";

/**
 * 24678 本地服务的访问规则（纯函数，便于单测）。
 *
 * 合法来源：打包渲染端（file:// 页面，WS 握手带 `Origin: file://`，HTTP 请求不带 Origin）、
 * 开发期 vite 渲染端、浏览器插件（chrome-extension://）、不带 Origin 的本机 node 客户端
 * （主进程、CLI）。网页的 Origin 无法伪造，据此挡住浏览器里任意网页的跨站访问。
 */

const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
const RENDERER_FILE_ORIGIN = "file://";

/** 开发期 vite 渲染端的 origin；打包版为 null */
export const resolveDevServerOrigin = (devServerUrl: string | undefined): string | null => {
  if (!devServerUrl) return null;
  try {
    return new URL(devServerUrl).origin;
  } catch {
    return null;
  }
};

const isTrustedBrowserOrigin = (origin: string, devServerOrigin: string | null) =>
  EXTENSION_ORIGIN.test(origin) || (devServerOrigin !== null && origin === devServerOrigin);

/** WS 升级是否放行 */
export const isAllowedWsOrigin = (
  origin: string | undefined,
  devServerOrigin: string | null
): boolean => {
  if (origin === undefined) return true;
  return origin === RENDERER_FILE_ORIGIN || isTrustedBrowserOrigin(origin, devServerOrigin);
};

/** HTTP 响应应回显的 Access-Control-Allow-Origin；null 表示不发 CORS 头 */
export const resolveCorsOrigin = (
  origin: string | undefined,
  devServerOrigin: string | null
): string | null => {
  if (origin === undefined) return null;
  return isTrustedBrowserOrigin(origin, devServerOrigin) ? origin : null;
};

// 应用目录下不对外提供的子目录：库备份、会话记录、凭据、索引、日志等
const DENIED_TOP_DIRS = new Set([
  "backup",
  "bin",
  "browser-sessions",
  "collaboration",
  "index",
  "logs",
  "memory",
  "pi",
  "pi-request-dumps",
  "sessions",
  "sync-status",
]);

const DENIED_FILE = /\.(db|db-wal|db-shm|db-journal|sqlite|bak|log)$/i;

/**
 * 静态服务是否允许返回该 URL 路径（未解码的 pathname）。
 * 根目录文件（setting.json、*.db 等）一律不出；只放行子目录里的资源文件。
 */
export const isServableStaticPath = (rawPathname: string): boolean => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPathname);
  } catch {
    return false;
  }
  if (decoded.includes("\0")) return false;
  // macOS/Windows 文件系统大小写不敏感；Windows 还认反斜杠、忽略段尾的点和空格、
  // 用 `:` 访问备用数据流，统一后再判断
  if (decoded.includes(":")) return false;
  const normalized = posix.normalize(`/${decoded.replace(/\\/g, "/")}`).toLowerCase();
  const segments = normalized
    .split("/")
    .map(segment => segment.replace(/[. ]+$/, ""))
    .filter(Boolean);
  if (segments.length < 2) return false;
  if (segments.some(segment => segment.startsWith("."))) return false;
  if (DENIED_TOP_DIRS.has(segments[0])) return false;
  return !DENIED_FILE.test(segments[segments.length - 1]);
};
