import type { InitData } from "../../src/types";

/**
 * 数据包协议 v1：宿主与模板之间唯一的耦合面。
 * 宿主保证这些文件的形状与位置；模板自行决定消费方式（fetch 时机、路由、渲染）。
 */

/** site.json 里的单页条目：href 为站点根相对路径，data 相对 site.json 自身 */
export interface DataPageRef {
  type: "article";
  id: number;
  title: string;
  href: string;
  data: string;
}

export interface DataSiteManifest {
  version: 1;
  site: InitData["site"];
  pages: DataPageRef[];
}

/**
 * 单篇内容数据文件：沿用现有页面 initData 形状，现有模板组件可零成本迁移。
 * 文件内 pluginRenderers 的资源路径相对数据文件自身解析（数据包自包含）。
 */
export type ArticleDataFile = InitData;
