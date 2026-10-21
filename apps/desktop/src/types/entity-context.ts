/**
 * 脉络（entity-context:get）的返回结构：一个实体与其他内容的关系。
 */

import type { EntityRef } from "@/entity/ref";
import type { InlineRefSnippet } from "@/entity/inline-refs";
import type { LineageNode, LineageRelation } from "@/entity/lineage";
import type { MaterialOpenTarget } from "@/entity/material";
import type { IQuestion } from "./question";
import type { EntityLocation } from "@/entity/locate";

export interface ContextEntity {
  ref: EntityRef;
  title: string;
  /** 次级信息，如项目文档所在的项目 */
  meta: string;
  /** 打开到实体里的具体位置（日记一天有多条时定位到相关那条）；缺省按 ref 打开 */
  open?: ContextOpenTarget;
}

/** 一个来源对我的引用；同一来源里的多处引用合并 */
export interface ContextBacklink {
  source: ContextEntity;
  snippets: InlineRefSnippet[];
}

export interface ContextQuestion {
  id: number;
  title: string;
  status: IQuestion["status"];
}

/** 点击脉络条目打开到哪里；正文实体走 openEntity，其余各自的页面 */
export type ContextOpenTarget =
  | { page: "entity"; ref: EntityRef; at?: EntityLocation; compose?: boolean }
  | { page: "chat"; id: string }
  | { page: "vibe-learning-detail"; id: number }
  | { page: "review"; deckId: number }
  | { page: "diary"; date: string; momentId: number; at?: EntityLocation }
  | { page: "whiteboard-detail"; id: number; pageId: number }
  | { page: "todos"; selectedId: number }
  | { page: "questions"; selectedId: number }
  | { page: "material"; target: MaterialOpenTarget };

/** 谱系的一端：来源或衍生 */
export interface ContextLineageItem {
  node: LineageNode;
  relation: LineageRelation;
  /** 端点已删除时为空串 */
  title: string;
  /** 次级信息：「对话」「Notebook · 项目名」「闪卡 · 卡组名」 */
  meta: string;
  /** 端点已删除（只有来源会保留这种条目，见 KL-026） */
  missing: boolean;
  open: ContextOpenTarget | null;
}

/** 被使用：白板（含文档里嵌入的白板）、待办、Notebook 资源 */
export type ContextUsage =
  | { kind: "whiteboard"; key: string; title: string; meta: string; open: ContextOpenTarget }
  | { kind: "todo"; key: string; title: string; completed: boolean; open: ContextOpenTarget }
  | { kind: "notebook"; key: string; title: string; open: ContextOpenTarget };

/** 脉络「相关」的一条：语义相近但还没有关系的内容（KL-057），不显示相似度 */
export interface ContextRelated {
  entity: ContextEntity;
  /** AI 一句话要点；没有元信息时为空串 */
  summary: string;
}

/** 「连接」分区的一条：显式连接或正文内联引用（合并去重） */
export interface ContextLink {
  entity: ContextEntity;
  /** 只来自正文内联引用（不是显式连接），不可在这里解除 */
  inlineOnly: boolean;
  /** 连接落点的目标正文 id（内联引用的老节点可能缺失） */
  contentId: number | null;
}

export interface EntityContext {
  self: ContextEntity;
  /** 自身（含共用正文身份）的正文 id，供连接选择器排除自己 */
  selfContentIds: number[];
  /** 连接：显式 content_links ∪ 我在正文里引用的实体，合并去重；最多 50 条 */
  links: ContextLink[];
  /** 共用同一份正文的其他身份 */
  projections: ContextEntity[];
  /** 谁在正文里引用了我，按来源最近更新排序；最多 50 条 */
  backlinks: ContextBacklink[];
  /** 引用我的来源总数（backlinks 被截断时大于其长度） */
  backlinkTotal: number;
  /** 我（或共用正文的身份）是哪些问题的材料 */
  questions: ContextQuestion[];
  /** 哪些插件内容关联了我（或共用正文的身份），按最近关联排序；最多 50 条 */
  pluginLinks: ContextEntity[];
  /** 我从哪来（谱系入边）；来源已删除的保留并标记 missing */
  sources: ContextLineageItem[];
  /** 我产生了什么（谱系出边 + 引用我正文的闪卡）；已删除的不返回 */
  derived: ContextLineageItem[];
  /** 共用正文的 Notebook 笔记（投影，KL-027） */
  notebookProjections: ContextLineageItem[];
  /** 谁在使用我：白板、待办、Notebook 资源 */
  usages: ContextUsage[];
}
