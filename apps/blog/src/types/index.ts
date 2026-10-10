import { Descendant } from "slate";
import { type ImageBorderRadiusPreset, type ImageShadowPreset } from "@tau/editor-media/types";

// 站点配置
export interface SiteConfig {
  title: string;
  description: string;
  basePath: string;
}

// 导航项
export interface NavItem {
  label: string;
  href: string;
  active?: boolean;
}

// 侧边栏项（用于文档模式）
export interface SidebarItem {
  title: string;
  href?: string;
  children?: SidebarItem[];
  collapsed?: boolean;
}

// 文章列表项（用于博客模式侧边栏）
export interface ArticleListItem {
  id: number;
  title: string;
  href: string;
  createTime: number;
}

export type QuestStatus = "not_started" | "in_progress" | "resolved";

// 卡片列表项（用于卡片页面左侧导航）
export interface CardListItem {
  id: number;
  summary: string; // 卡片摘要（前几行文字）
  href: string;
  createTime: number;
}

// 卡片标签树（用于标签筛选）
export interface CardTagTree {
  tag: string;
  children: CardTagTree[];
  count: number; // 该标签下的卡片数量（包括子标签）
  // 完全匹配该标签的卡片（不包括子标签下的卡片）
  cards: CardListItem[];
}

// 关联卡片信息
export interface LinkedCardInfo {
  id: number;
  href: string;
  summary: string;
  tags: string[];
}

// 卡片数据
export interface CardData {
  id: number;
  content: Descendant[];
  tags: string[];
  createTime: number;
  updateTime: number;
  // 关联卡片（通过链接）
  linkedCards?: LinkedCardInfo[];
  // 相同标签的卡片
  relatedCards?: LinkedCardInfo[];
}

// 文章数据
export interface ArticleData {
  id: number;
  title: string;
  author: string;
  content: Descendant[];
  tags: string[];
  bannerBg?: string;
  createTime: number;
  updateTime: number;
}

// 文档数据（项目）
export interface DocData {
  id: number;
  title: string;
  content: Descendant[];
  breadcrumb: { label: string; href?: string }[];
  prevPage?: { title: string; href: string };
  nextPage?: { title: string; href: string };
  createTime: number;
  updateTime: number;
  currentPath?: string;
}

export interface QuestAnswerData {
  id: number;
  createTime: number;
  updateTime: number;
  content?: Descendant[];
  source?: {
    type: "card" | "article" | "project-item" | "custom";
    id?: number;
    contentId: number;
    href?: string;
    title?: string;
    published: boolean;
  };
}

export type QuestMaterialKind =
  | "card"
  | "article"
  | "project_item"
  | "project"
  | "white_board"
  | "excerpt"
  | "pdf-annotation"
  | "web-clip"
  | "chat-session";

/** 参考资料（据）：index 即正文与轨迹里的引用编号 */
export interface QuestMaterialData {
  index: number;
  kind: QuestMaterialKind;
  group: "external" | "note" | "discussion";
  title: string;
  meta: string;
  excerpt: string;
  note?: string;
  /** 站内已发布页面 */
  href?: string;
  /** 外部原处 */
  url?: string;
  /** 与正文 content-link 对账的键（contentType:refId） */
  citeKey?: string;
}

/** 探索过程（径）的一个节点 */
export interface QuestTrailEntry {
  time: number;
  tone: "start" | "milestone" | "plain" | "note" | "done";
  text: string;
  refs: number[];
}

export interface QuestData {
  id: number;
  title: string;
  summary: string;
  href: string;
  groupId: number;
  groupTitle: string;
  groupColor?: string;
  status: QuestStatus;
  answers: QuestAnswerData[];
  materials?: QuestMaterialData[];
  trail?: QuestTrailEntry[];
  description?: Descendant[];
  createTime: number;
  updateTime: number;
  resolvedTime?: number | null;
}

export interface DocCollectionItem {
  id: number;
  title: string;
  href: string;
  kind: "project";
  active?: boolean;
}

export interface DocCollection {
  type: "project";
  label: string;
  items: DocCollectionItem[];
}

export interface ContentLinkTarget {
  contentType: string;
  refId: number;
  href: string;
  title?: string;
}

export type SearchItemType = "card" | "article" | "project-doc" | "quest";

export interface SearchItem {
  id: number;
  type: SearchItemType;
  typeLabel: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  href: string;
  createTime: number;
  updateTime: number;
}

export interface SearchIndexPayload {
  version: 1;
  generatedAt: number;
  options: Record<string, unknown>;
  items: SearchItem[];
  index: unknown;
}

// 注：目录从 content 中的 header 元素自动提取，使用主项目的 Outline 组件渲染

// 首页数据
export interface HomeData {
  hero?: {
    title: string;
    description: string;
  };
  timeline: TimelineItem[];
  stats?: {
    articles: number;
    cards: number;
  };
  docStats?: {
    projects: number;
  };
}

// 时间线项
export interface TimelineItem {
  type: "card" | "article" | "doc" | "quest";
  id: number;
  title?: string;
  summary: string;
  href: string;
  tags: string[];
  publishTime: number;
}

// 列表数据
export interface ListData {
  title: string;
  type: "card" | "article" | "doc" | "quest";
  items: ListItem[];
  pagination?: {
    current: number;
    total: number;
    pageSize: number;
  };
  tags?: { name: string; count: number }[];
  activeTag?: string;
}

// 列表项
export interface ListItem {
  id: number;
  title?: string;
  summary: string;
  href: string;
  tags: string[];
  createTime: number;
  updateTime?: number;
  groupId?: number;
  groupTitle?: string;
  status?: QuestStatus;
  answerCount?: number;
}

// 页面元数据
export interface PageMeta {
  type: "home" | "card" | "article" | "doc" | "list" | "quest";
  publishTime: number;
}

// 初始化数据结构
export interface InitData {
  site: SiteConfig;
  navigation: NavItem[];
  sidebar?: SidebarItem[];
  articleList?: ArticleListItem[]; // 文章列表（用于博客模式侧边栏）
  cardList?: CardListItem[]; // 卡片列表（用于卡片页面左侧导航）
  cardTagTree?: CardTagTree[]; // 卡片标签树（用于标签筛选）
  activeTag?: string; // 当前激活的标签（用于筛选）
  docCollections?: DocCollection[]; // 项目集合
  contentLinkTargets?: Record<string, ContentLinkTarget>;
  search?: {
    href: string;
  };
  settings?: {
    appearance?: {
      image?: {
        borderRadius?: ImageBorderRadiusPreset;
        shadow?: ImageShadowPreset | boolean;
      };
    };
  };
  content: CardData | ArticleData | DocData | QuestData | HomeData | ListData;
  meta: PageMeta;
}

// 声明全局变量
declare global {
  interface Window {
    _INIT_DATA_: InitData;
  }
}

// 重导出 Descendant 类型
export type { Descendant };
