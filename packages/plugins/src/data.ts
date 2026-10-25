/**
 * 业务数据接口。ID 与 ContentRef 都是不透明字符串：只用于传回宿主，不要解析其格式。
 * 每次调用前宿主按 manifest.permissions 与用户授权校验，未获准抛出 PluginPermissionError。
 * 修改与删除要传读到的 revision，数据已被别处修改时抛出 PluginConflictError。
 */
import type { Descendant } from "slate";
import type { PluginContentInput } from "./content-input";
import type { PluginEntityRef } from "./app";

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

export interface PluginWhiteboard {
  id: string;
  /** 白板信息（标题、说明、标签）的版本；画板内容的编辑不改变它 */
  revision: string;
  title: string;
  description: string;
  tags: string[];
  /** 画板页数 */
  pageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface PluginWhiteboardInput {
  title: string;
  description?: string;
  tags?: string[];
}

export type PluginWhiteboardPatch = Partial<PluginWhiteboardInput>;

export interface PluginProject {
  id: string;
  /** 项目的版本：改名、归档、置顶以及文档目录的变化都会改变它 */
  revision: string;
  title: string;
  archived: boolean;
  pinned: boolean;
  /** 根目录下的文档数 */
  documentCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface PluginProjectInput {
  title: string;
}

export interface PluginProjectPatch {
  title?: string;
  archived?: boolean;
  pinned?: boolean;
}

/**
 * 项目目录中的一处。同一篇文档可以挂在多处，这时会在目录里出现多次，documentId 相同。
 */
export interface PluginProjectNode {
  documentId: string;
  /** 文档的版本，documents.move 时作为 expectedRevision 传回 */
  revision: string;
  title: string;
  /** document（富文本）、white-board 等 */
  kind: string;
  /** 引用卡片或文章的条目：正文归被引用的内容，documents.get 读不到这一项 */
  ref?: PluginEntityRef;
  children: PluginProjectNode[];
}

export interface PluginDocumentInput {
  projectId: string;
  /** 挂在哪篇文档下；省略时挂在项目根目录末尾 */
  parentId?: string;
  title: string;
  /** 正文；省略时为空 */
  content?: PluginContentInput;
  tags?: string[];
}

/** 在同一项目内移动文档的一处位置；from / to 为父文档 ID，null 表示项目根目录 */
export interface PluginDocumentMove {
  projectId: string;
  from: string | null;
  to: string | null;
  /** 移动后在新位置中的序号，从 0 开始；省略时放在末尾 */
  index?: number;
}

export interface PluginNotebook {
  id: string;
  title: string;
  archived: boolean;
  pinned: boolean;
  /** 资料数 */
  resourceCount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Notebook 里的一份资料。只给清单信息：不含本机文件路径与资料转换后的文字。
 * source：local 本机文件、remote 网络链接、note 加入时的笔记快照、material 材料快照、
 * online-video 在线视频。
 */
export interface PluginNotebookResource {
  id: string;
  name: string;
  /** 文件类型：pdf、video、audio、image、md、html、docx 等，无法识别时为 other */
  type: string;
  source: "local" | "remote" | "note" | "material" | "online-video";
  /** remote 的网址 */
  url?: string;
  /** note / material：快照来自哪些内容，原内容可能已删除 */
  from?: PluginEntityRef[];
  /** 字节数，未知时为 null */
  size: number | null;
  /** 音视频时长（秒），未知时为 null */
  duration: number | null;
  createdAt: number;
}

/** 划线（excerpt）、PDF 标注（pdf-annotation）与剪藏（web-clip） */
export type PluginMaterialKind = "excerpt" | "pdf-annotation" | "web-clip";

export interface PluginMaterial {
  /** 与 PluginEntityRef 的 material 引用 ID 相同 */
  id: string;
  kind: PluginMaterialKind;
  title: string;
  /** 划下或标注的原文；剪藏为空 */
  quote: string;
  /** 用户写下的想法 */
  note: string;
  /** 出处说明，如「PDF · 文件名 · 第 3 页」 */
  source: string;
  /** 原处的网址：划线的外部链接、剪藏的网页 */
  url?: string;
  createdAt: number;
  updatedAt: number;
}

/** 对话的信息；消息内容不开放 */
export interface PluginChatSession {
  id: string;
  /** 未命名的对话为空字符串 */
  title: string;
  /** main 主对话、pdf PDF 对话、video-note 视频笔记对话、notebook Notebook 对话 */
  scene: "main" | "pdf" | "video-note" | "notebook";
  messageCount: number;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
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
  /** 白板的信息；画板内容不开放读写，用户在 Tau 中编辑 */
  readonly whiteboards: PluginEntityWriter<
    PluginWhiteboard,
    PluginWhiteboardInput,
    PluginWhiteboardPatch
  >;
  /** 项目本身；query 不支持 tag。项目里的文档见 documents */
  readonly projects: PluginEntityReader<PluginProject> & {
    /** 新建一个空项目 */
    create(input: PluginProjectInput): Promise<PluginProject>;
    /** 项目的文档目录；项目不存在时为 null */
    tree(id: string): Promise<PluginProjectNode[] | null>;
    update(
      id: string,
      patch: PluginProjectPatch,
      options: PluginWriteOptions
    ): Promise<PluginProject>;
    /** 只能删除空项目：项目里还有文档时拒绝 */
    delete(id: string, options: PluginWriteOptions): Promise<void>;
  };
  /** 项目文档：新建、修改标题与标签、在项目内移动与删除 */
  readonly documents: PluginEntityReader<PluginDocument> & {
    create(input: PluginDocumentInput): Promise<PluginDocument>;
    update(
      id: string,
      patch: PluginDocumentPatch,
      options: PluginWriteOptions
    ): Promise<PluginDocument>;
    /** 移动挂在 from 下的那一处；不能移到自己或自己的子文档下。返回文档的新版本 */
    move(
      id: string,
      move: PluginDocumentMove,
      options: PluginWriteOptions
    ): Promise<{ revision: string }>;
    /**
     * 从所有挂载处删除这篇文档。有子文档时拒绝；视频笔记不能由插件删除。
     * 用户可在插件详情页 7 天内恢复，恢复后挂回仍存在的原位置。
     */
    delete(id: string, options: PluginWriteOptions): Promise<void>;
  };
  /** Notebook 的信息与资料清单；query 不支持 tag */
  readonly notebooks: PluginEntityReader<PluginNotebook> & {
    /** 按 Notebook 中的顺序；Notebook 不存在时为 null */
    resources(id: string): Promise<PluginNotebookResource[] | null>;
  };
  /** 划线、PDF 标注与剪藏；query 不支持 tag，已删除的不返回 */
  readonly materials: PluginEntityReader<PluginMaterial>;
  /** AI 对话的信息，不含消息内容；query 不支持 tag */
  readonly chats: PluginEntityReader<PluginChatSession>;
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
  contracts?: import("@tau/db-schema/content-contracts").ContentContractDictionary;
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
