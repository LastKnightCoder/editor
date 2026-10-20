/**
 * 业务数据只读接口。ID 与 ContentRef 都是不透明字符串：只用于传回宿主，不要解析其格式。
 * 每次调用前宿主按 manifest.permissions 与用户授权校验，未获准抛出 PluginPermissionError。
 */

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
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarId: string;
  /** 由待办安排出的日程 */
  todoId?: string;
}

export interface PluginData {
  readonly cards: PluginEntityReader<PluginCard>;
  readonly articles: PluginEntityReader<PluginArticle>;
  readonly documents: PluginEntityReader<PluginDocument>;
  readonly todos: { query(query?: PluginTodoQuery): Promise<PluginPage<PluginTodo>> };
  readonly calendar: {
    query(query: PluginCalendarQuery): Promise<PluginPage<PluginCalendarEvent>>;
  };
}

export interface PluginContentSnapshot {
  ref: PluginContentRef;
  /** format 为 markdown（默认）时给出 */
  markdown?: string;
  /** format 为 nodes 时给出编辑器节点 JSON；结构随编辑器演进，优先使用 markdown */
  nodes?: unknown[];
  wordCount: number;
  updatedAt: number;
}

export interface PluginContent {
  /** 需要拥有该正文所属实体的读取权限；正文不存在时返回 null */
  read(
    ref: PluginContentRef,
    options?: { format?: "markdown" | "nodes" }
  ): Promise<PluginContentSnapshot | null>;
}
