// 移动端脉络的类型：与 Rust entity_context.rs 的 serde 输出（camelCase）一一对应。
// 分区口径对齐桌面端 types/entity-context.ts，裁剪差异：无「相关」与「被使用 · 白板」。

export type EntityKind = "card" | "article" | "project-item" | "diary-moment";

/** 日记条目的定位（跳转到当天的该片段）；其余类型由前端按 kind 映射目标页 */
export interface DiaryLocator {
  date: string;
  momentId: number;
}

export interface ContextEntity {
  kind: EntityKind;
  id: number;
  contentId: number | null;
  title: string;
  meta: string;
  diary: DiaryLocator | null;
}

export interface ContextLink {
  entity: ContextEntity;
  inlineOnly: boolean;
}

export interface RefSnippet {
  before: string;
  label: string;
  after: string;
}

export interface ContextBacklink {
  source: ContextEntity;
  snippets: RefSnippet[];
}

export interface ContextQuestion {
  id: number;
  title: string;
  status: string;
}

/** 谱系条目：kind 覆盖实体与外部材料（摘录、PDF 标注、对话、闪卡、问题、Notebook 等） */
export interface ContextLineageItem {
  kind: string;
  nodeId: string;
  relation: string;
  title: string;
  meta: string;
  missing: boolean;
}

export interface ContextUsage {
  kind: "todo" | "notebook";
  key: string;
  title: string;
  completed: boolean | null;
}

/** 桌面端后台预生成的 AI 元信息（随整库同步到达），只读展示 */
export interface AiMetaSummary {
  title: string | null;
  summary: string | null;
}

export interface EntityContext {
  selfEntity: ContextEntity;
  selfContentIds: number[];
  /** 显式连接；内联引用由前端解析 inlineSources 后合并进该分区 */
  links: ContextLink[];
  projections: ContextEntity[];
  backlinks: ContextBacklink[];
  backlinkTotal: number;
  questions: ContextQuestion[];
  sources: ContextLineageItem[];
  derived: ContextLineageItem[];
  notebookProjections: ContextLineageItem[];
  usages: ContextUsage[];
  aiMeta: AiMetaSummary | null;
  /** 自身正文（SQL 预过滤含 content-link 的），用 @tau/shared/inline-refs 解析 */
  inlineSources: string[];
}

export interface PendingRefContent {
  contentId: number;
  updateTime: number;
  content: string | null;
}

export interface PendingRefBatch {
  pending: PendingRefContent[];
  removed: number[];
}
