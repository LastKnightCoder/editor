/**
 * 脉络（entity-context:get）的返回结构：一个实体与其他内容的关系。
 */

import type { EntityRef } from "@/entity/ref";
import type { InlineRefSnippet } from "@/entity/inline-refs";
import type { IQuestion } from "./question";

export interface ContextEntity {
  ref: EntityRef;
  title: string;
  /** 次级信息，如项目文档所在的项目 */
  meta: string;
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

export interface EntityContext {
  self: ContextEntity;
  /** 共用同一份正文的其他身份 */
  projections: ContextEntity[];
  /** 谁在正文里引用了我，按来源最近更新排序；最多 50 条 */
  backlinks: ContextBacklink[];
  /** 引用我的来源总数（backlinks 被截断时大于其长度） */
  backlinkTotal: number;
  /** 我（或共用正文的身份）是哪些问题的材料 */
  questions: ContextQuestion[];
}
