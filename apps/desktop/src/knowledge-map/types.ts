/**
 * 知识地图的数据契约 —— 主进程离线算出、存进索引库，渲染进程读出来直接画。
 *
 * 两层主题：topic（大主题，数量随规模按对数增长，决定颜色）⊃ subtopic（子主题，决定细分与缩放标签）。
 * 颜色不存具体色值，只存「色槽」：同一张地图在不同主题族 × 明暗下取不同的实色，
 * 但同一个主题永远落在同一个色槽里。
 */

export interface KnowledgeMapNode {
  cardId: number;
  x: number;
  y: number;
  /** 大主题 id；-1 = 未归类（语义上离谁都远的卡片） */
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

/** 计算输入：卡片的最小必要信息（不含正文，正文已经在向量里了） */
export interface KnowledgeMapCardInput {
  id: number;
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
