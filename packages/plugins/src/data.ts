/**
 * 业务数据接口。ID 与 ContentRef 都是不透明字符串：只用于传回宿主，不要解析其格式。
 * 每次调用前宿主按 manifest.permissions 与用户授权校验，未获准抛出 PluginPermissionError。
 * 修改与删除要传读到的 revision，数据已被别处修改时抛出 PluginConflictError。
 */
import type { Descendant } from "slate";
import type { PluginContentInput } from "./content-input";

/** 一份正文的句柄，从实体上取得，传给 context.content 读取 */
export type PluginContentRef = string;

export interface PluginPage<T> {
  items: T[];
  /** 还有下一页时给出，原样传回 query 的 cursor */
  cursor?: string;
}

export interface PluginEntityQuery {
  /** 毫秒时间戳，含起点、不含终点 */
  createdAfter?: number;
  createdBefore?: number;
  updatedAfter?: number;
  updatedBefore?: number;
  /** 层级标签按前缀命中：「读书」也命中「读书/小说」 */
  tag?: string;
  /** 默认按更新时间倒序 */
  sort?: "created" | "updated";
  /** 1–200，默认 50 */
  limit?: number;
  cursor?: string;
}

interface PluginEntityBase {
  id: string;
  /** 元数据版本，修改与删除时作为 expectedRevision 传回；正文修改不改变它 */
  revision: string;
  title: string;
  tags: string[];
  wordCount: number;
  createdAt: number;
  /** 元数据与正文中较晚的修改时间 */
  updatedAt: number;
}

export interface PluginCard extends PluginEntityBase {
  /** 卡片没有标题字段，这里是 AI 标题或正文开头 */
  title: string;
  pinned: boolean;
  contentRef: PluginContentRef;
}

export interface PluginArticle extends PluginEntityBase {
  pinned: boolean;
  contentRef: PluginContentRef;
}

export interface PluginDocument extends PluginEntityBase {
  /** document（富文本）、white-board 等；非富文本类型没有正文 */
  kind: string;
  contentRef: PluginContentRef | null;
  projectIds: string[];
}

export interface PluginEntityReader<T> {
  get(id: string): Promise<T | null>;
  query(query?: PluginEntityQuery): Promise<PluginPage<T>>;
}

export interface PluginWriteOptions {
  /** 读取时得到的 revision */
  expectedRevision: string;
}

export interface PluginCardInput {
  /** 正文；省略时为空卡片 */
  content?: PluginContentInput;
  tags?: string[];
  pinned?: boolean;
}

export interface PluginCardPatch {
  tags?: string[];
  pinned?: boolean;
}

export interface PluginArticleInput {
  title: string;
  /** 正文；省略时为空文章 */
  content?: PluginContentInput;
  tags?: string[];
}

export interface PluginArticlePatch {
  title?: string;
  tags?: string[];
  pinned?: boolean;
}

export interface PluginDocumentPatch {
  title?: string;
  tags?: string[];
}

/** 新建与修改需要 `*:write`，删除需要 `*:delete`；删除可由用户在插件详情页 7 天内恢复 */
export interface PluginEntityWriter<T, Input, Patch> extends PluginEntityReader<T> {
  create(input: Input): Promise<T>;
  update(id: string, patch: Patch, options: PluginWriteOptions): Promise<T>;
  delete(id: string, options: PluginWriteOptions): Promise<void>;
}

export interface PluginTodoQuery {
  /** 缺省为全部：独立待办与正文里的勾选项 */
  source?: "all" | "todo" | "document";
  completed?: boolean;
  keyword?: string;
  /** YYYY-MM-DD，按截止日期筛选 */
  start?: string;
  end?: string;
  /** 1–100，默认 50 */
  limit?: number;
  cursor?: string;
}

export interface PluginTodo {
  id: string;
  revision: string;
  title: string;
  completed: boolean;
  archived: boolean;
  /** YYYY-MM-DD 或 ISO 时间 */
  dueAt: string | null;
  /** 正文里的勾选项所在的文档 */
  source?: { kind: "card" | "article" | "document" | "diary"; id: string; title?: string };
}

export interface PluginCalendarQuery {
  /** YYYY-MM-DD 或带时区的 ISO 时间，必填 */
  start: string;
  end: string;
  /** 1–100，默认 50 */
  limit?: number;
  cursor?: string;
}

export interface PluginCalendarEvent {
  id: string;
  revision: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarId: string;
  /** 由待办安排出的日程 */
  todoId?: string;
}

export interface PluginTodoInput {
  title: string;
  /** YYYY-MM-DD 或带时区的 ISO 时间 */
  dueAt?: string | null;
}

export interface PluginTodoPatch {
  title?: string;
  dueAt?: string | null;
}

export interface PluginCalendarInput {
  title: string;
  /** 全天日程用 YYYY-MM-DD，结束日期不含当天（当天全天的 end 为次日）；定时日程用带时区的 ISO 时间 */
  start: string;
  end: string;
  allDay: boolean;
  /** 缺省为默认日历 */
  calendarId?: string;
}

export type PluginCalendarPatch = Partial<PluginCalendarInput>;

export interface PluginData {
  readonly cards: PluginEntityWriter<PluginCard, PluginCardInput, PluginCardPatch>;
  readonly articles: PluginEntityWriter<PluginArticle, PluginArticleInput, PluginArticlePatch>;
  /** 项目文档只能修改标题与标签；新建、移动与删除涉及文档树，暂不开放 */
  readonly documents: PluginEntityReader<PluginDocument> & {
    update(
      id: string,
      patch: PluginDocumentPatch,
      options: PluginWriteOptions
    ): Promise<PluginDocument>;
  };
  readonly todos: {
    query(query?: PluginTodoQuery): Promise<PluginPage<PluginTodo>>;
    create(input: PluginTodoInput): Promise<PluginTodo>;
    update(id: string, patch: PluginTodoPatch, options: PluginWriteOptions): Promise<PluginTodo>;
    setCompleted(id: string, completed: boolean, options: PluginWriteOptions): Promise<PluginTodo>;
    /** 有子待办时拒绝删除 */
    delete(id: string, options: PluginWriteOptions): Promise<void>;
  };
  readonly calendar: {
    query(query: PluginCalendarQuery): Promise<PluginPage<PluginCalendarEvent>>;
    create(input: PluginCalendarInput): Promise<PluginCalendarEvent>;
    update(
      id: string,
      patch: PluginCalendarPatch,
      options: PluginWriteOptions
    ): Promise<PluginCalendarEvent>;
    delete(id: string, options: PluginWriteOptions): Promise<void>;
  };
}

export interface PluginContentSnapshot {
  ref: PluginContentRef;
  /** 正文版本，edit 时作为 expectedRevision 传回 */
  revision: string;
  /** format 为 markdown（默认）时给出 */
  markdown?: string;
  /** format 为 nodes 时给出编辑器节点，可原样作为 PluginContentInput 的 nodes 写回 */
  nodes?: Descendant[];
  /** format 为 nodes 时给出节点结构版本，见 EDITOR_NODE_SCHEMA_VERSION */
  schemaVersion?: number;
  wordCount: number;
  updatedAt: number;
}

/**
 * 正文修改。append / prepend 只加入新内容（不能为空），原有内容保持不变；replaceAll 用新内容替换
 * 整篇（可以为空）。replaceText 在 Markdown 文本上查找替换，会把整篇经 Markdown 重建，
 * Markdown 无法表达的格式可能简化。
 */
export type PluginContentEdit =
  | { op: "append"; content: PluginContentInput }
  | { op: "prepend"; content: PluginContentInput }
  /** find 必须在当前 Markdown 中恰好出现一次 */
  | { op: "replaceText"; find: string; markdown: string }
  | { op: "replaceAll"; content: PluginContentInput };

export interface PluginContent {
  /** 需要拥有该正文所属实体的读取权限；正文不存在时返回 null */
  read(
    ref: PluginContentRef,
    options?: { format?: "markdown" | "nodes" }
  ): Promise<PluginContentSnapshot | null>;
  /**
   * 修改正文，需要所属实体的写入权限。经协作会话写入：打开中的编辑器与协作者实时看到；
   * 修改不进入编辑器的撤销记录。返回新的 revision。
   */
  edit(
    ref: PluginContentRef,
    edit: PluginContentEdit,
    options: PluginWriteOptions
  ): Promise<{ revision: string }>;
}
