/**
 * 通用实体检索（EntityPicker 的数据）：按类型检索可关联的实体，空关键字按最近更新。
 * 类型命名沿用问题材料（question_link.target_type）口径，另加日记。
 */

export type EntityKind =
  | "card"
  | "article"
  | "project_item"
  | "project"
  | "white_board"
  | "diary"
  // 外部材料与对话：只供问题「关联已有」选择（问题材料 / 探究对话），没有正文
  | "excerpt"
  | "pdf-annotation"
  | "web-clip"
  | "chat-session";

export interface EntityCandidate {
  kind: EntityKind;
  /** 实体主键；对话没有整数主键，为 0，地址在 sessionId */
  id: number;
  /** 对话（chat-session）的会话 id */
  sessionId?: string;
  /** 承载正文的 content（项目、白板没有） */
  contentId: number | null;
  title: string;
  excerpt: string;
  /** 次级信息：所属项目、页数等 */
  meta: string;
  /** 最近更新时间 */
  time: number;
}

export interface EntitySearchParams {
  kind: EntityKind;
  keyword?: string;
  limit?: number;
}

/** 由正文 content 反查所属实体（只存了 contentId 的关联用来跳转） */
export interface EntityLocation {
  kind: EntityKind;
  id: number;
  /** 项目文档所在项目 */
  projectId?: number | null;
  /** 日记日期键 */
  date?: string;
}
