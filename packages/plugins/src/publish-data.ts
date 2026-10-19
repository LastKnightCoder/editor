/** 发布数据协议不包含公开路由、DOM、组件或宿主生命周期。 */
export type DataKind = "home" | "card" | "article" | "doc" | "quest" | "list";
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
  collectionType?: "card" | "article" | "doc" | "quest";
  title: string;
  projectId?: number;
  data: string;
  integrity: string;
}
export interface SiteData {
  title: string;
  description: string;
  basePath: string;
  publicUrl?: string;
  favicon?: { href: string; format: "svg" | "png" | "ico"; mimeType: string };
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
export type QuestStatus = "not_started" | "in_progress" | "resolved";
export interface QuestAnswer {
  id: number;
  createTime: number;
  updateTime: number;
  content?: ContentNode[];
  source?: {
    type: "card" | "article" | "project-item" | "custom";
    id?: number;
    contentId: number;
    target?: ContentRef;
    title?: string;
    published: boolean;
  };
}
export interface QuestMaterial {
  index: number;
  kind: string;
  group: "external" | "note" | "discussion";
  title: string;
  meta: string;
  excerpt: string;
  note?: string;
  target?: ContentRef;
  url?: string;
  citeKey?: string;
}
export interface QuestTrail {
  time: number;
  tone: "start" | "milestone" | "plain" | "note" | "done";
  text: string;
  refs: number[];
}
export interface QuestData {
  id: number;
  title: string;
  summary: string;
  target: ContentRef;
  groupId: number;
  groupTitle: string;
  groupColor?: string;
  status: QuestStatus;
  answers: QuestAnswer[];
  materials: QuestMaterial[];
  trail: QuestTrail[];
  description?: ContentNode[];
  createTime: number;
  updateTime: number;
  resolvedTime?: number | null;
}
export interface TimelineItem {
  type: "card" | "article" | "doc" | "quest";
  id: number;
  title?: string;
  summary: string;
  target: ContentRef;
  tags: string[];
  publishTime: number;
}
export interface HomeData {
  hero?: { title: string; description: string };
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
  updateTime?: number;
  groupId?: number;
  groupTitle?: string;
  status?: QuestStatus;
  answerCount?: number;
}
export interface ListData {
  title: string;
  type: "card" | "article" | "doc" | "quest";
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
  /** 本文正文里已发布的站内链接目标，键与 QuestMaterial.citeKey 同一口径；未发布的链接不在其中。 */
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
      quest: QuestData;
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
  type: "card" | "article" | "doc" | "quest";
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
