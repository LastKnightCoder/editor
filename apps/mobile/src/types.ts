import type { Descendant } from "slate";
import {
  type ImageBorderRadiusPreset,
  type ImageShadowPreset,
} from "@tau/editor/extensions/media/types";

export interface DatabaseItem {
  name: string;
  version: number;
}

export interface BootstrapResponse {
  appDir: string;
  settingPath: string;
  activeDatabase: string;
  databases: DatabaseItem[];
}

export interface DatabaseListResponse {
  activeDatabase: string;
  databases: DatabaseItem[];
}

export interface ActiveDatabaseResponse {
  activeDatabase: string;
  created: boolean;
}

export interface CardListItem {
  id: number;
  contentId: number;
  updateTime: number;
  tags: string[];
  excerpt: string;
  content: Descendant[];
}

export interface CardDetailResponse {
  id: number;
  contentId: number;
  createTime: number;
  updateTime: number;
  tags: string[];
  links: number[];
  content: Descendant[];
  count: number;
}

export interface ContentCardMeta {
  id: number;
  createTime: number;
  updateTime: number;
  tags: string[];
  links: number[];
}

export interface ContentDetailResponse {
  contentId: number;
  createTime: number;
  updateTime: number;
  content: Descendant[];
  count: number;
  card: ContentCardMeta | null;
}

export interface CardsOverviewResponse {
  total: number;
  page: number;
  pageSize: number;
  query: string;
  searchMode: "none" | "fts" | "like" | string;
  items: CardListItem[];
}

export type UnifiedSearchResultType =
  "card" | "article" | "project-item" | "diary-daily" | "flashcard";

export interface UnifiedSearchResult {
  id: number;
  type: UnifiedSearchResultType | string;
  title: string;
  excerpt: string;
  contentId: number | null;
  updateTime: number;
  score: number;
  date: string | null;
  containerId: number | null;
  containerTitle: string | null;
}

export interface UnifiedSearchResponse {
  total: number;
  page: number;
  pageSize: number;
  query: string;
  searchMode: "none" | "fts" | "like" | string;
  items: UnifiedSearchResult[];
}

export interface CardsQueryState {
  query: string;
  page: number;
  pageSize: number;
}

/* ── 文章 ── */

export interface ArticleListItem {
  id: number;
  title: string;
  author: string | null;
  tags: string[];
  bannerBg: string;
  bannerPosition: string;
  isTop: boolean;
  contentId: number | null;
  count: number;
  createTime: number;
  updateTime: number;
  /** 后端生成的纯文本摘要（截断）；列表不返回正文，正文走 articleGet */
  excerpt: string;
}

/** 文章详情：列表字段 + 正文（articleGet / articleCreate / articleUpdate 的返回类型） */
export interface ArticleDetail extends ArticleListItem {
  content: Descendant[] | null;
}

export interface ArticleListResponse {
  items: ArticleListItem[];
  total: number;
}

/* ── 项目 ── */

export interface ProjectListResponse {
  items: Project[];
  total: number;
}

export interface Project {
  id: number;
  title: string;
  descText: string;
  children: number[];
  archived: boolean;
  pinned: boolean;
  createTime: number;
  updateTime: number;
  itemCount: number;
}

export type ProjectItemType =
  "document" | "white-board" | "video-note" | "web-view" | "table-view" | "pdf" | string;

export interface ProjectItem {
  id: number;
  title: string;
  tags?: string[];
  children: number[];
  parents: number[];
  projects: number[];
  projectItemType: ProjectItemType;
  refType: string;
  refId: number;
  contentId: number | null;
  count: number;
  createTime: number;
  updateTime: number;
}

/* ── 首页汇总统计 ── */

export interface HomeStats {
  articlesTotal: number;
  projectsTotal: number;
  projectDocumentsTotal: number;
}

export interface SyncVersionResponse {
  databaseName: string;
  localVersion: number;
  remoteVersion: number;
}

export interface SyncActionResponse {
  ok: boolean;
  code?: string | null;
  message: string;
  databaseName: string;
  localVersion: number;
  remoteVersion: number;
}

export type ResourceSyncStatus = "pending" | "syncing" | "synced" | "error";

export interface ResourceFileSyncStatus {
  syncStatus: ResourceSyncStatus;
  syncDirection: "upload" | "download" | null | string;
  fileSize: number | null;
  lastSyncTime: number | null;
  errorMessage: string | null;
  retryCount: number;
}

export interface ResourceSyncStatusFile {
  provider: string;
  config: Record<string, string>;
  lastSyncTime: number | null;
  files: Record<string, ResourceFileSyncStatus>;
}

export interface ResourceSyncProgress {
  totalFiles: number;
  processedFiles: number;
  currentFile: string | null;
  status: "idle" | "scanning" | "syncing" | "completed" | "error" | "cancelled";
  uploadCount: number;
  downloadCount: number;
  skippedCount: number;
  errorCount: number;
  startTime: number | null;
}

export interface UploadTestResponse {
  url: string;
  /** 能否按返回地址直接读取，false 表示传上去了但文档里会裂图 */
  readable: boolean;
  elapsedMs: number;
}

export interface ResourceSyncActionResponse {
  ok: boolean;
  code?: string | null;
  message: string;
}

export interface SettingWriteResponse {
  ok: boolean;
  code?: string | null;
  message: string;
}

export interface DatabaseSchemaStatusResponse {
  databaseName: string;
  mainSchemaVersion: number;
  indexSchemaVersion: number;
  mainSchemaHash: string;
  indexSchemaHash: string;
  mainTableCount: number;
  indexTableCount: number;
}

export type DiaryType = "daily" | "weekly" | "monthly";

export interface DiaryWeatherMood {
  type: "emoji" | "image";
  value: string;
}

export interface DiarySegment {
  id: number;
  diaryId: number;
  contentId: number;
  createTime: number;
  updateTime: number;
  wordCount: number;
  content: Descendant[];
  /** 标签与具体片段绑定：一天的多条日记各自独立打标签（类朋友圈） */
  tags: string[];
}

export interface DiaryEntry {
  id: number;
  type: DiaryType;
  date: string;
  contentId: number | null;
  weather: DiaryWeatherMood | null;
  mood: DiaryWeatherMood | null;
  wordCount: number;
  createTime: number;
  updateTime: number;
  content: Descendant[];
  segments: DiarySegment[];
  tags: string[];
}

export interface DiaryListPayload {
  type?: DiaryType;
  limit?: number;
  offset?: number;
}

export interface DiaryUpsertPayload {
  type: DiaryType;
  date: string;
  content: Descendant[];
  weather?: DiaryWeatherMood | null;
  mood?: DiaryWeatherMood | null;
  segmentId?: number;
  newSegment?: boolean;
}

/** 日记标签库（diary_tag_settings）：筛选条与标签管理的数据源 */
export interface DiaryTagSetting {
  name: string;
  color: string;
  sort: number;
  createTime: number;
  updateTime: number;
}

// planned（计划任务）已退役，只为读取尚未经桌面转换的旧行保留；新建 / 改类型不再提供
export type TodoItemType = "normal" | "deadline" | "planned" | "recurring";
/** 可选的任务类型（类型选择器用） */
export const SELECTABLE_TODO_TYPES = ["normal", "deadline", "recurring"] as const;

/* ── 番茄专注（与桌面端 apps/desktop/src/types/pomodoro.ts 同构） ── */

export type PomodoroMode = "countdown" | "countup";

export type PomodoroStatus = "running" | "paused" | "completed" | "stopped" | "aborted";

export interface PomodoroPreset {
  id: number;
  name: string;
  mode: PomodoroMode;
  durationMin: number;
  sortOrder: number;
  archived: boolean;
  createTime: number;
  updateTime: number;
}

export interface PomodoroPauseSpan {
  start: number;
  end?: number;
}

export interface PomodoroSession {
  id: number;
  presetId: number;
  startTime: number;
  endTime?: number | null;
  expectedMs?: number | null;
  focusMs: number;
  pauseTotalMs: number;
  pauseCount: number;
  pauses: PomodoroPauseSpan[];
  status: PomodoroStatus;
  createTime: number;
  updateTime: number;
}

export interface PomodoroSummary {
  count: number;
  focusMs: number;
}

export interface PomodoroDailySummary {
  dayStart: number;
  count: number;
  focusMs: number;
}

export interface ListPomodoroSessionsPayload {
  presetId?: number;
  start?: number;
  end?: number;
  limit?: number;
  offset?: number;
}

export type TodoSystemGroupType = "all" | "normal" | "deadline" | "recurring" | null;

export type RecurrenceType = "daily" | "weekdays" | "weekly" | "monthly" | "yearly" | "custom";

export interface TodoGroup {
  id: number;
  title: string;
  color?: string | null;
  sortIndex: number;
  isArchived: boolean;
  isSystem: boolean;
  systemType: TodoSystemGroupType;
  createTime: number;
  updateTime: number;
}

export interface TodoRecurrence {
  segments?: import("@tau/shared/task-assistant").TaskRecurrenceSegment[];
  occurrenceState?: Record<string, import("@tau/shared/task-assistant").TaskOccurrenceState>;
  id: number;
  todoItemId: number;
  type: RecurrenceType;
  interval: number;
  weekdays?: number[] | null;
  monthDay?: number | null;
  yearMonth?: number | null;
  yearDay?: number | null;
  excludeHolidays: boolean;
  startDate: number;
  endDate?: number | null;
  maxOccurrences?: number | null;
  createTime: number;
  updateTime: number;
}

export interface TodoItem {
  id: number;
  groupId: number;
  parentId: number | null;
  title: string;
  type: TodoItemType;
  descriptionContentId?: number | null;
  descriptionContent?: Descendant[] | null;
  isCompleted: boolean;
  startAt?: number | null;
  dueAt?: number | null;
  remindBefore?: number | null;
  completedAt?: number | null;
  sortIndex: number;
  isArchived: boolean;
  createTime: number;
  updateTime: number;
  recurrence?: TodoRecurrence | null;
}

export interface TodoRecurrenceCompletion {
  id: number;
  recurrenceId: number;
  scheduledDate: number;
  completedAt?: number | null;
  skipped: boolean;
  createTime: number;
}

export interface TodoGroupStats {
  groupId: number;
  total: number;
  uncompleted: number;
  overdue: number;
}

export interface CreateTodoGroupPayload {
  title: string;
  color?: string | null;
  isSystem?: boolean;
  systemType?: TodoSystemGroupType;
}

export interface UpdateTodoGroupPayload {
  id: number;
  title?: string;
  color?: string | null;
  sortIndex?: number;
  isArchived?: boolean;
}

export interface ArchiveTodoGroupPayload {
  id: number;
  isArchived: boolean;
}

export interface ReorderTodoGroupsPayload {
  orderedIds: number[];
}

export interface ListTodoItemsPayload {
  groupId: number;
}

export interface ListTodoItemsByTypePayload {
  type: Exclude<TodoSystemGroupType, null>;
}

export interface CreateTodoItemPayload {
  groupId: number;
  parentId?: number | null;
  title: string;
  type?: TodoItemType;
  description?: string;
  startAt?: number | null;
  dueAt?: number | null;
  remindBefore?: number | null;
}

export type CreateRelativePosition = "child" | "above" | "below";

export interface CreateTodoItemRelativePayload {
  refId: number;
  position: CreateRelativePosition;
  title: string;
  type?: TodoItemType;
  description?: string;
  startAt?: number | null;
  dueAt?: number | null;
  remindBefore?: number | null;
}

export interface UpdateTodoItemPayload {
  id: number;
  title?: string;
  type?: TodoItemType;
  descriptionContentId?: number | null;
  startAt?: number | null;
  dueAt?: number | null;
  remindBefore?: number | null;
}

export interface ToggleTodoCompletePayload {
  id: number;
  isCompleted: boolean;
}

export interface MoveAndReorderTodoItemPayload {
  id: number;
  toGroupId: number;
  toParentId: number | null;
  beforeId?: number;
  afterId?: number;
}

export interface CreateTodoRecurrencePayload {
  todoItemId: number;
  type: RecurrenceType;
  interval?: number;
  weekdays?: number[] | null;
  monthDay?: number | null;
  yearMonth?: number | null;
  yearDay?: number | null;
  excludeHolidays?: boolean;
  startDate: number;
  endDate?: number | null;
  maxOccurrences?: number | null;
}

export interface UpdateTodoRecurrencePayload {
  id: number;
  type?: RecurrenceType;
  interval?: number;
  weekdays?: number[] | null;
  monthDay?: number | null;
  yearMonth?: number | null;
  yearDay?: number | null;
  excludeHolidays?: boolean;
  startDate?: number;
  endDate?: number | null;
  maxOccurrences?: number | null;
}

export interface SettingCompat {
  database: {
    active: string;
    databases: DatabaseItem[];
  };
  imageBed: {
    active: "local" | "github" | "aliOSS" | "s3" | "webdav" | string;
    /** 同时控制前端预压缩与后端转 webp，关闭即原图上传；键名与桌面端一致 */
    enableCompression: boolean;
    github: {
      repo: string;
      branch: string;
      pathPrefix: string;
    };
    aliOSS: {
      bucket: string;
      region: string;
      pathPrefix: string;
    };
    local: {
      path: string;
    };
    s3: {
      bucket: string;
      region: string;
      pathPrefix: string;
    };
    webdav: {
      pathPrefix: string;
    };
  };
  sync: {
    active: "webdav" | "aliOSS" | "s3" | "github" | string;
    webdav: {
      pathPrefix: string;
    };
    aliOSS: {
      bucket: string;
      region: string;
      path: string;
    };
    s3: {
      bucket: string;
      region: string;
      pathPrefix: string;
    };
    github: {
      repo: string;
      branch: string;
      pathPrefix: string;
    };
  };
  integration: {
    github: {
      token: string;
      user: {
        name: string;
        email: string;
      };
    };
    s3: {
      accessKeyId: string;
      secretAccessKey: string;
      endpoint: string;
      urlStyle: "path" | "virtualHosted" | string;
    };
    webdav: {
      url: string;
      username: string;
      password: string;
    };
    aliOSS: {
      accessKeyId: string;
      accessKeySecret: string;
    };
  };
  /** 外观类设置（与桌面端 setting.json 的 appearance 节同构）：image 为图片渲染默认外观 */
  appearance?: {
    image?: {
      borderRadius?: ImageBorderRadiusPreset;
      shadow?: ImageShadowPreset | boolean;
    };
    [key: string]: unknown;
  };
  /** 移动端编辑器偏好：openMode 为打开已有文档时的初始状态，缺省为 read（阅读态） */
  editor?: {
    openMode?: "read" | "edit";
  };
  module?: {
    todo?: {
      enable?: boolean;
    };
    dailyNote?: {
      enable?: boolean;
    };
    pomodoro?: {
      enable?: boolean;
    };
    calendar?: {
      enable?: boolean;
    };
    [key: string]: unknown;
  };
  /** 协作设置：展示昵称（服务器固定为默认协作服务器，协作常开） */
  collaboration?: {
    nickname?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** 本地内容与协作房间的绑定记录（与桌面端 collaboration_bindings 同字段） */
export interface CollaborationBinding {
  contentId: number;
  contentCreatedAt: number;
  serverUrl: string;
  documentId: string;
  sourceType?: string | null;
  sourceId?: number | null;
  sourceTitle?: string | null;
}
