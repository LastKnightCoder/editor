/**
 * 开发环境工具函数
 */

// 开发环境下的模板路径映射
const DEV_TEMPLATE_PATHS: Record<string, string> = {
  card: "/src/templates/card/index.html",
  article: "/src/templates/article/index.html",
  doc: "/src/templates/doc/index.html",
  home: "/src/templates/home/index.html",
  list: "/src/templates/list/index.html",
};

/**
 * 在开发环境下转换链接
 * 生产环境保持原样，开发环境转换为模板页面
 */
export function devLink(href: string, type?: string): string {
  if (!import.meta.env.DEV) {
    return href;
  }

  // 根据链接路径推断类型
  if (!type) {
    if (href.startsWith("/cards")) {
      type = "card";
    } else if (href.startsWith("/articles")) {
      type = "article";
    } else if (href.startsWith("/docs")) {
      type = "doc";
    } else if (href === "/" || href === "") {
      type = "home";
    }
  }

  // 返回开发环境的模板路径
  if (type && DEV_TEMPLATE_PATHS[type]) {
    return DEV_TEMPLATE_PATHS[type];
  }

  return href;
}

/**
 * 检查是否是开发环境
 */
export function isDev(): boolean {
  return import.meta.env.DEV;
}
