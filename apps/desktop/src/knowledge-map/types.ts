/**
 * 知识地图的数据契约 —— 主进程离线算出、存进索引库，渲染进程读出来直接画。
 *
 * 两层主题：topic（大主题，数量随规模按对数增长，决定颜色）⊃ subtopic（子主题，决定细分与缩放标签）。
 * 颜色不存具体色值，只存「色槽」：同一张地图在不同主题族 × 明暗下取不同的实色，
 * 但同一个主题永远落在同一个色槽里。
 */

export interface KnowledgeMapNode {
  /** 节点键，与 entityRefKey 一致："card:12" / "article:3" / "project-item:5" */
  key: string;
  x: number;
  y: number;
  /** 大主题 id；-1 = 未归类（语义上离谁都远的节点） */
  topic: number;
  /** 子主题 id；-1 = 大主题内部没再细分 */
  subtopic: number;
}

export interface KnowledgeMapTopic {
  id: number;
  /** 子主题指向所属大主题；大主题为 -1 */
  parent: number;
  label: string;
  /**
   * 色槽（0..TOPIC_PALETTE_SIZE-1）；子主题沿用父主题的色槽。
   * NO_COLOR_SLOT = 没有颜色（兜底），渲染成中性色。
   */
  colorSlot: number;
  size: number;
}

export interface KnowledgeMap {
  nodes: KnowledgeMapNode[];
  topics: KnowledgeMapTopic[];
  /** 计算完成时间 */
  computedAt: number;
}

/** 地图上一个节点的展示信息：主进程随地图一起返回，渲染层不再分别拉各类列表 */
export interface KnowledgeMapItem {
  key: string;
  kind: "card" | "article" | "project-item";
  id: number;
  contentId: number;
  title: string;
  createdAt: number;
  tags: string[];
  /** 显式边（卡片双向链接 + 正文内联引用），以节点键表示 */
  links: string[];
  /** 项目文档所在项目（筛选用） */
  projectId: number | null;
  projectTitle: string | null;
}

/** 计算输入：节点的最小必要信息（不含正文，正文已经在向量里了） */
export interface KnowledgeMapNodeInput {
  /** 计算用数值 id（读输入时分配的稠密下标），links 与向量都按它对应 */
  id: number;
  key: string;
  /** 命名用的标签路径（卡片 / 文章取 tag；无 tag 的项目文档取「项目名 / 上级文档」） */
  tags: string[];
  links: number[];
}

/**
 * 大主题的色槽数（视觉约束：再多颜色就分不开）。它不限制主题数——
 * 主题多于色槽时循环复用，地图上相邻的主题避开同色。
 * NO_COLOR_SLOT 不会出现在离线算出的主题上（每个主题都有颜色，中性色只给未归类的卡片），
 * 保留它是给读旧数据与渲染层兜底：拿到它就按中性色画。
 */
export const TOPIC_PALETTE_SIZE = 10;
export const NO_COLOR_SLOT = -1;
