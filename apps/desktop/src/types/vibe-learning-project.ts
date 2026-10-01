import { Descendant } from "slate";

/**
 * 「Vibe Learning」模块的列表实体。
 * 原先是 project 表里 project_type = 'vibe-learning' 的一行，现已独立为 vibe_learning_project 表。
 * 资源 / 笔记 / 测验 / 会话仍通过 project_id 关联到这里的 id（id 在拆分时原样保留）。
 */
export interface VibeLearningProject {
  id: number;
  createTime: number;
  updateTime: number;
  title: string;
  desc: Descendant[];
  archived: boolean;
  pinned: boolean;
}

/** 列表条目：附带资源数（驾驶舱卡片大数字）与打开记录（从未打开为 null），由主进程聚合 */
export type VibeLearningProjectSummary = VibeLearningProject & {
  resourceCount: number;
  openedAt: number | null;
  /** 上次打开的资料或笔记标题；已删除或没打开过资料 / 笔记时为 null */
  lastItemTitle: string | null;
};

/** 打开记录能指向的条目：资料或笔记（生成任务是临时位置，不记） */
export interface VibeLearningOpenedItem {
  kind: "resource" | "note";
  id: number;
}

export type CreateVibeLearningProject = Pick<VibeLearningProject, "title"> &
  Partial<Pick<VibeLearningProject, "desc" | "archived" | "pinned">>;

export type UpdateVibeLearningProject = Pick<VibeLearningProject, "id" | "title"> &
  Partial<Pick<VibeLearningProject, "desc" | "archived" | "pinned">>;
