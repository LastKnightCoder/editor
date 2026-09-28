/**
 * 「列表驾驶舱」共享契约。
 *
 * 项目 / 数据库 / Vibe Learning 原本是同一张 project 表的三种类型，拆成三个独立模块后
 * 列表页形态仍然一致（置顶 hero 段 + 全部网格 + 归档折叠段 + 新建/编辑弹窗），
 * 差异只在文案、类型色与「大数字」的口径，故以配置驱动同一套组件。
 */

import type { Descendant } from "slate";
import type { LucideIcon } from "lucide-react";

/** 驾驶舱条目：三模块的列表实体投影到同一形状，metric 是卡片上的大数字 */
export interface CockpitItem {
  id: number;
  title: string;
  desc: Descendant[];
  archived: boolean;
  pinned: boolean;
  updateTime: number;
  /** 卡面大数字（项目=文档数，数据库=行数，学习=资源数） */
  metric: number;
}

/** 类型色与图标（原 projectTypeMeta 的一份，按模块各自持有） */
export interface CockpitVisual {
  icon: LucideIcon;
  /** 图标底色 */
  softClass: string;
  /** 图标前景色 */
  textClass: string;
  /** hero 卡顶缘 3px 身份线 */
  barClass: string;
}

/**
 * 文案：全部随模块变化的字面量集中在此，一律写完整句子。
 *
 * 不用「动词 + 名词」拼接——模块名可能是英文（Notebook），拼接就得处理中英空格
 * 与量词顺序，反而把简单的事搞复杂；写死字面量最直白，也让每个模块能各自措辞。
 */
export interface CockpitCopy {
  /** 页面标题，也用作无标题条目的占位（`{title} #12`） */
  title: string;
  /** hero 卡上的类型徽章 */
  badgeLabel: string;
  /** 摘要行的条目单位，渲染为 `3 个 Notebook` */
  entityUnit: string;
  /** 大数字单位，渲染为 `12 份资料`（摘要行与卡面共用） */
  metricUnit: string;
  /** 主按钮与空态按钮 */
  createLabel: string;
  /** 新建 / 编辑弹窗标题 */
  createTitle: string;
  editTitle: string;
  /** 弹窗里描述字段的 placeholder */
  descPlaceholder: string;
  /** 空态两行 */
  emptyTitle: string;
  emptyHint: string;
  /** 删除确认：标题 / 说明 / 影响（影响须与主进程级联删除范围一致） */
  deleteTitle: string;
  deleteDescription: string;
  deleteImpact: string;
}

/** 宿主提供的变更能力（各模块 queries 的子集） */
export interface CockpitMutations {
  create(input: { title: string; desc: Descendant[] }): Promise<{ id: number }>;
  updateInfo(id: number, title: string, desc: Descendant[]): Promise<void>;
  togglePin(id: number, pinned: boolean): Promise<void>;
  setArchived(id: number, archived: boolean): Promise<void>;
  remove(id: number): Promise<void>;
}

/** 卡片操作协议（宿主 EntityCockpit 提供给卡片） */
export interface CockpitCardHandlers {
  onOpen(item: CockpitItem): void;
  onTogglePin(item: CockpitItem): void;
  onSetArchived(item: CockpitItem, archived: boolean): void;
  onEdit(item: CockpitItem): void;
  /** 不支持整体导出的模块传 undefined，菜单项随之隐去 */
  onExport?(item: CockpitItem): void;
  onDelete(item: CockpitItem): void;
}
