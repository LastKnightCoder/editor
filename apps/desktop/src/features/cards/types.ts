/**
 * 卡片库数据契约：时间分组、标签树节点、筛选条件与条目操作。
 */

import type { ICard } from "@/types";

/** 时间分组键（置顶单独成段，其余按创建时间归段） */
export type CardTimeGroupKey = "today" | "yesterday" | "week" | "month" | "earlier";

export interface CardTimeGroup {
  key: CardTimeGroupKey;
  label: string;
  cards: ICard[];
}

/** 标签树节点（`a/b` 层级按前缀派生，计数含后代） */
export interface CardTagNode {
  /** 完整路径（含父级，如「读书/文明」） */
  path: string;
  name: string;
  count: number;
  children: CardTagNode[];
}

/** 列表筛选条件：标签前缀；本页不含搜索维度（语义检索走全局命令面板） */
export interface CardFilter {
  tag: string;
}

/** 卡面条目操作契约：卡面与预览共用同一组操作（视图层组装注入，菜单实现见 CardActionMenu） */
export interface CardItemActions {
  onOpen(card: ICard): void;
  onOpenDetail(card: ICard): void;
  onToggleTop(card: ICard): void;
  onPresent(card: ICard): void;
  onDelete(card: ICard): void;
  onExportMarkdown(card: ICard): void;
  onExportImage(card: ICard): void;
  onExportEpub(card: ICard): void;
  onExportPdf(card: ICard): void;
  /** Electron 专属：未传则不渲染（Web 端不显示入口，同旧版 isElectron 判定） */
  onOpenWindow?(card: ICard): void;
}
