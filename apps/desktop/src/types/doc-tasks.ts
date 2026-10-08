import type { EntityRef } from "@/entity/ref";

/** 文档待办所在的文档（卡片 / 文章 / 项目文档 / 日记） */
export interface DocTaskSource {
  contentId: number;
  /** 正文被多个实体共用时取优先级最高的身份 */
  ref: EntityRef;
  title: string;
  /** 所属项目名等次级信息 */
  meta: string;
  updateTime: number;
  /** 未完成 / 已完成条数（已完成的条目按需另取） */
  openCount: number;
  doneCount: number;
}

export interface DocTaskItem {
  contentId: number;
  taskId: string;
  /** 去掉 `#项目` 与日期词后的标题 */
  title: string;
  checked: boolean;
  depth: number;
  parentTaskId: string | null;
  sortIndex: number;
  groupId: number | null;
  /** 正文里的日期原文 */
  dateHint: string | null;
  dueAt: number | null;
  /** 已转为独立待办（只在单篇条目列表里出现） */
  promoted?: boolean;
}

/** 编辑器里一篇文档的收集状态（文档底部状态条） */
export interface DocTaskContentStatus {
  excluded: boolean;
  openCount: number;
}

export type DocTaskPromoteResult =
  { ok: true; todoId: number } | { ok: false; reason: "not-found" | "no-group" };

/** 待办页一次取到的快照：未完成条目全量 + 各文档计数 */
export interface DocTaskSnapshot {
  sources: DocTaskSource[];
  open: DocTaskItem[];
}

export type DocTaskToggleResult = "ok" | "not-found" | "readonly";
