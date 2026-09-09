import type { Descendant } from "slate";

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
  category: string;
  tags: string[];
  excerpt: string;
  content: Descendant[];
}

export interface CardDetailResponse {
  id: number;
  contentId: number;
  createTime: number;
  updateTime: number;
  category: string;
  tags: string[];
  links: number[];
  content: Descendant[];
  count: number;
}

export interface ContentCardMeta {
  id: number;
  createTime: number;
  updateTime: number;
  category: string;
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
  category: string;
  searchMode: "none" | "fts" | "like" | string;
  items: CardListItem[];
}

export interface CardsQueryState {
  query: string;
  category: string;
  page: number;
  pageSize: number;
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
  tags?: string[];
}

export type TodoItemType = "normal" | "deadline" | "planned" | "recurring";

export type TodoSystemGroupType = "all" | "normal" | "deadline" | "planned" | "recurring" | null;

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
    enableCompression: boolean;
    github: {
      repo: string;
      branch: string;
      cdn: string | null;
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
  module?: {
    todo?: {
      enable?: boolean;
    };
    dailyNote?: {
      enable?: boolean;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
