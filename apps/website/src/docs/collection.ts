/**
 * 文档集：一组按分组排列、挂在同一路径前缀下的文档（使用文档 /docs/、插件开发文档 /developers/）。
 * 纯数据，vite.config.ts 构建时也按它为每篇文档生成入口页。
 */
import type { SiteLink } from "../lib/site.ts";

export interface DocEntry {
  /** 地址段：<前缀><slug>/，可含子目录（如 providers/asr）；首篇为空串，对应前缀本身 */
  slug: string;
  title: string;
  /** 页面描述，用于 <meta name="description"> */
  summary: string;
  /** 不进目录与上下篇（如隐私政策），只能经链接打开 */
  hidden?: boolean;
}

export interface DocGroup {
  title: string;
  items: DocEntry[];
}

export interface DocCollection {
  /** 顶部导航里高亮的入口 */
  site: SiteLink["key"];
  /** 路径前缀，首尾带斜杠，如 /docs/ */
  basePath: string;
  /** 文档集名称，首篇的页面标题与其他篇的标题后缀 */
  name: string;
  groups: DocGroup[];
  /** 全部文档，含不进目录的 */
  all: DocEntry[];
  /** 目录里显示、参与上下篇的文档 */
  entries: DocEntry[];
  href(slug: string): string;
  /** 前缀下的地址找文档，末尾斜杠可有可无；找不到返回 undefined */
  find(pathname: string): DocEntry | undefined;
  pageTitle(entry: DocEntry): string;
}

export function createDocCollection(options: {
  site: SiteLink["key"];
  basePath: string;
  name: string;
  groups: DocGroup[];
}): DocCollection {
  const { basePath, name, groups } = options;
  const all = groups.flatMap(group => group.items);
  return {
    ...options,
    all,
    entries: all.filter(entry => !entry.hidden),
    href: slug => (slug ? `${basePath}${slug}/` : basePath),
    find(pathname) {
      const root = basePath.slice(0, -1);
      if (pathname !== root && !pathname.startsWith(basePath)) return undefined;
      const slug = decodeURIComponent(pathname.slice(basePath.length).replace(/\/$/, ""));
      return all.find(entry => entry.slug === slug);
    },
    pageTitle: entry => (entry.slug ? `${entry.title} · ${name}` : name),
  };
}
