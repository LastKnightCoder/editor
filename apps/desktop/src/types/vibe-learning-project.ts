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

/** 列表条目：附带资源数（驾驶舱卡片大数字），由主进程聚合 */
export type VibeLearningProjectSummary = VibeLearningProject & { resourceCount: number };

export type CreateVibeLearningProject = Pick<VibeLearningProject, "title"> &
  Partial<Pick<VibeLearningProject, "desc" | "archived" | "pinned">>;

export type UpdateVibeLearningProject = Pick<VibeLearningProject, "id" | "title"> &
  Partial<Pick<VibeLearningProject, "desc" | "archived" | "pinned">>;
