import type { FormattedText } from "@tau/editor";

/** 指向一段对话（或其中一轮）的行内引用；title / turn 是插入时的快照，失效或协作时照样显示 */
export interface ChatRefElement {
  type: "chat-ref";
  sessionId: string;
  /** 该轮用户消息的 pi entry id；缺省 = 整个对话 */
  entryId?: string;
  title: string;
  turn?: number;
  children: FormattedText[];
}

/** 对话摘录块：原文是正文的一部分，对话删除后照样显示 */
export interface ChatQuoteElement {
  type: "chat-quote";
  sessionId: string;
  entryId: string;
  quoteText: string;
  title: string;
  turn?: number;
  model?: string;
  children: FormattedText[];
}

/** 插入、复制、粘贴共用的引用载荷 */
export interface ChatRefPayload {
  sessionId: string;
  entryId?: string;
  title: string;
  turn?: number;
  /** 选中的原文；有它才能插成摘录块 */
  text?: string;
  model?: string;
}
