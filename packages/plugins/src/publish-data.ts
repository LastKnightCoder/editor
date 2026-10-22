/** 发布数据协议不包含公开路由、DOM、组件或宿主生命周期。 */
export type DataKind = "home" | "card" | "article" | "doc" | "list";
export interface ContentRef {
  key: string;
  type: DataKind;
  id?: number;
}
export interface ResourceRef {
  href: string;
  integrity: string;
}
export interface ManifestItem extends ContentRef {
  collectionType?: "card" | "article" | "doc";
  title: string;
  projectId?: number;
  data: string;
  integrity: string;
}
export interface SiteData {
  title: string;
  basePath: string;
  publicUrl?: string;
  favicon?: { href: string; format: "svg" | "png" | "ico"; mimeType: string };
  /** 模板在 manifest `template.siteFields` 中声明的字段取值，未填写时为声明的默认值 */
  fields: Record<string, string | boolean>;
}
export interface PublishSettings {
  appearance?: { image?: { borderRadius?: string; shadow?: string | boolean } };
}
/** 站点级数据只在清单中出现一次，各内容文件不重复携带。 */
export interface DataManifest {
  version: 1;
  site: SiteData;
  search: { data: string; integrity: string };
  items: ManifestItem[];
  settings?: PublishSettings;
  collections?: Collection[];
  cardTagTree?: CardTagTree[];
  /** 键为项目 id。 */
  projectTrees?: Record<string, TreeItem[]>;
}
export interface ContentNode {
  [field: string]: unknown;
  text?: string;
  type?: string;
  children?: ContentNode[];
}

/** 由宿主生成发布快照、由博客渲染器内置展示的业务节点。 */
export const PUBLISHED_HOST_ELEMENT_TYPES = ["project-card-list"] as const;
export interface PublishedProjectCardListNode extends ContentNode {
  type: "project-card-list";
  items: { id: number; title: string; summary: string; target: ContentRef }[];
  children: ContentNode[];
}

export interface TreeItem {
  title: string;
  target?: ContentRef;
  children?: TreeItem[];
}
export interface Collection {
  type: "project";
  label: string;
  items: { id: number; title: string; target: ContentRef; kind: "project" }[];
}
export interface RelatedCard {
  id: number;
  target: ContentRef;
  summary: string;
  tags: string[];
}
export interface CardData {
  id: number;
  content: ContentNode[];
  tags: string[];
  createTime: number;
  updateTime: number;
  linkedCards?: RelatedCard[];
}
export interface ArticleData extends Omit<CardData, "linkedCards"> {
  title: string;
  author: string;
  bannerBg?: string;
}
export interface DocData {
  id: number;
  projectId: number;
  title: string;
  content: ContentNode[];
  breadcrumb: { label: string; target?: ContentRef }[];
  prevPage?: { title: string; target: ContentRef };
  nextPage?: { title: string; target: ContentRef };
  createTime: number;
  updateTime: number;
}
export interface TimelineItem {
  type: "card" | "article" | "doc";
  id: number;
  title?: string;
  summary: string;
  target: ContentRef;
  tags: string[];
  publishTime: number;
}
export interface HomeData {
  timeline: TimelineItem[];
  stats: { articles: number; cards: number };
  docStats: { projects: number };
}
export interface ListItem {
  id: number;
  title?: string;
  summary: string;
  target: ContentRef;
  tags: string[];
  createTime: number;
}
export interface ListData {
  title: string;
  type: "card" | "article" | "doc";
  items: ListItem[];
  tags?: { name: string; count: number }[];
}
export interface CardTagTree {
  tag: string;
  count: number;
  cards: { id: number; summary: string; target: ContentRef; createTime: number }[];
  children?: CardTagTree[];
}
export interface PublishedCommon {
  version: 1;
  key: string;
  /** 本文正文里已发布的站内链接目标，键为 `${contentType}:${refId}`；未发布的链接不在其中。 */
  links?: Record<string, ContentRef>;
  pluginRenderers?: import("./render-artifact").PublishedPluginRender[];
  contentStyles?: ResourceRef[];
}
export type PublishedData = {
  [K in DataKind]: PublishedCommon & {
    meta: { type: K; publishTime: number };
    content: {
      home: HomeData;
      card: CardData;
      article: ArticleData;
      doc: DocData;
      list: ListData;
    }[K];
  };
}[DataKind];
export interface DataResult {
  data: PublishedData;
  dataUrl: string;
  /** 清单中的发布设置，由客户端随正文带回。 */
  settings?: PublishSettings;
}
export interface SearchDocument extends ContentRef {
  type: "card" | "article" | "doc";
  title: string;
  summary: string;
  content: string;
  tags: string[];
}
export interface SearchFile {
  version: 1;
  documents: SearchDocument[];
}
export interface SearchMatch {
  field: "title" | "summary" | "content" | "tags";
  text: string;
  ranges: [number, number][];
}
export interface SearchHit extends Omit<SearchDocument, "content"> {
  matches?: SearchMatch[];
}
export interface DataClient {
  readManifest(options?: { signal?: AbortSignal }): Promise<DataManifest>;
  readData(options: { key: string; signal?: AbortSignal }): Promise<DataResult>;
  search(query: string, options?: { limit?: number; signal?: AbortSignal }): Promise<SearchHit[]>;
}
