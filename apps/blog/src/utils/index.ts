/**
 * 获取初始化数据
 */
export function getInitData() {
  return window._INIT_DATA_;
}

/**
 * 格式化日期
 */
export function formatDate(
  timestamp: number,
  format: "full" | "short" | "relative" = "short",
): string {
  const date = new Date(timestamp);

  if (format === "relative") {
    const now = Date.now();
    const diff = now - timestamp;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const month = 30 * day;
    const year = 365 * day;

    if (diff < minute) return "刚刚";
    if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
    if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
    if (diff < month) return `${Math.floor(diff / day)} 天前`;
    if (diff < year) return `${Math.floor(diff / month)} 个月前`;
    return `${Math.floor(diff / year)} 年前`;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  if (format === "short") {
    return `${year}-${month}-${day}`;
  }

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// 开发环境下的模板路径映射
const DEV_TEMPLATE_PATHS = {
  card: "/src/templates/card/index.html",
  article: "/src/templates/article/index.html",
  doc: "/src/templates/doc/index.html",
  home: "/src/templates/home/index.html",
  list: "/src/templates/list/index.html",
} as const;

const DEV_LIST_TYPE_PARAM = "__dev_list_type";

function appendQueryParam(path: string, key: string, value: string): string {
  const [baseWithQuery, hash = ""] = path.split("#");
  const [pathname, search = ""] = baseWithQuery.split("?");
  const params = new URLSearchParams(search);
  params.set(key, value);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

/**
 * 在开发环境下转换链接到对应的模板页面
 */
function devTransformPath(path: string): string {
  // @ts-ignore - import.meta.env.DEV 是 Vite 提供的
  if (!import.meta.env.DEV) {
    return path;
  }

  const [pathname, search = ""] = path.split("?");

  // 首页
  if (pathname === "/" || pathname === "") {
    return DEV_TEMPLATE_PATHS.home;
  }

  // 根据路径前缀判断类型
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length > 0) {
    const firstSegment = segments[0];
    if (firstSegment === "cards") {
      if (segments.length === 1) {
        const listPath = search
          ? `${DEV_TEMPLATE_PATHS.list}?${search}`
          : DEV_TEMPLATE_PATHS.list;
        return appendQueryParam(listPath, DEV_LIST_TYPE_PARAM, "card");
      }
      return search
        ? `${DEV_TEMPLATE_PATHS.card}?${search}`
        : DEV_TEMPLATE_PATHS.card;
    }
    if (firstSegment === "articles") {
      if (segments.length === 1) {
        const listPath = search
          ? `${DEV_TEMPLATE_PATHS.list}?${search}`
          : DEV_TEMPLATE_PATHS.list;
        return appendQueryParam(listPath, DEV_LIST_TYPE_PARAM, "article");
      }
      return search
        ? `${DEV_TEMPLATE_PATHS.article}?${search}`
        : DEV_TEMPLATE_PATHS.article;
    }
    if (firstSegment === "docs") {
      if (segments.length === 1) {
        const listPath = search
          ? `${DEV_TEMPLATE_PATHS.list}?${search}`
          : DEV_TEMPLATE_PATHS.list;
        return appendQueryParam(listPath, DEV_LIST_TYPE_PARAM, "doc");
      }
      return search
        ? `${DEV_TEMPLATE_PATHS.doc}?${search}`
        : DEV_TEMPLATE_PATHS.doc;
    }
  }

  return path;
}

/**
 * 拼接 basePath 和路径
 * 在开发环境下自动转换为模板页面路径
 */
export function joinPath(
  basePath: string,
  path: string,
  options?: { raw?: boolean },
): string {
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  const p = path.startsWith("/") ? path : `/${path}`;
  const fullPath = `${base}${p}`;

  if (options?.raw) {
    return fullPath;
  }

  // 开发环境下转换路径
  return devTransformPath(fullPath);
}

/**
 * 截取摘要
 */
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.slice(0, length) + "...";
}

/**
 * 从 Descendant[] 中提取纯文本
 */
export function getPlainText(nodes: unknown[]): string {
  return nodes
    .map((node) => {
      if (typeof node === "string") return node;
      if (node && typeof node === "object") {
        const n = node as Record<string, unknown>;
        if ("text" in n && typeof n.text === "string") return n.text;
        if ("children" in n && Array.isArray(n.children)) {
          return getPlainText(n.children);
        }
      }
      return "";
    })
    .join("");
}

/**
 * 获取阅读时间（分钟）
 */
export function getReadingTime(content: unknown[] | string): number {
  const text =
    typeof content === "string"
      ? content.replace(/<[^>]*>/g, "")
      : getPlainText(content);
  // 中文字符按 300 字/分钟，英文按 200 词/分钟
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  const minutes = Math.ceil(chineseChars / 300 + englishWords / 200);
  return Math.max(1, minutes);
}

/**
 * 生成目录锚点 ID
 */
export function generateAnchorId(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "");
}

/**
 * 获取当前主题
 */
export function getTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * 检测是否是暗色模式
 */
export function isDarkMode(): boolean {
  return getTheme() === "dark";
}

/**
 * 切换主题
 */
export function toggleTheme(): void {
  const current = getTheme();
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
}

/**
 * 初始化主题
 */
export function initTheme(): void {
  const theme = getTheme();
  document.documentElement.setAttribute("data-theme", theme);
}
