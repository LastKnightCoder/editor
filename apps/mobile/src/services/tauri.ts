import { invoke } from "@tauri-apps/api/core";
import type {
  ActiveDatabaseResponse,
  ArchiveTodoGroupPayload,
  BootstrapResponse,
  CardDetailResponse,
  CardListItem,
  CreateTodoGroupPayload,
  CreateTodoItemPayload,
  CreateTodoItemRelativePayload,
  CreateTodoRecurrencePayload,
  ContentDetailResponse,
  CardsOverviewResponse,
  UnifiedSearchResponse,
  CollaborationBinding,
  DatabaseListResponse,
  DatabaseSchemaStatusResponse,
  DiaryEntry,
  HomeStats,
  DiaryListPayload,
  DiaryTagSetting,
  DiaryUpsertPayload,
  DiaryWeatherMood,
  ListPomodoroSessionsPayload,
  ListTodoItemsPayload,
  ListTodoItemsByTypePayload,
  MoveAndReorderTodoItemPayload,
  ArticleDetail,
  ArticleListResponse,
  DocumentItem,
  DocumentLibrary,
  DocumentLibraryListResponse,
  Project,
  ProjectItem,
  ProjectListResponse,
  ReorderTodoGroupsPayload,
  ResourceSyncActionResponse,
  ResourceSyncProgress,
  ResourceSyncStatusFile,
  SettingWriteResponse,
  SyncActionResponse,
  SyncVersionResponse,
  PomodoroDailySummary,
  PomodoroMode,
  PomodoroPreset,
  PomodoroSession,
  PomodoroSummary,
  TodoGroup,
  TodoGroupStats,
  TodoItem,
  TodoRecurrence,
  TodoRecurrenceCompletion,
  ToggleTodoCompletePayload,
  UpdateTodoGroupPayload,
  UpdateTodoItemPayload,
  UpdateTodoRecurrencePayload,
} from "../types";
import type { KnownCardCategory } from "../features/cards/cardCategory";
import { logPerf } from "../utils/perf";

// IPC 计时包装：诊断卡顿时看每条命令的真实耗时（连接复用前后对比也靠它）
function trackedInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const start = performance.now();
  return invoke<T>(cmd, args).finally(() => {
    logPerf("ipc", cmd, performance.now() - start);
  });
}

const VERIFY_TIMEOUT_MS = 15_000;
const SYNC_CHECK_TIMEOUT_MS = 35_000;
// 卡片链路被 DB 写锁卡住时 invoke 可能永不返回（见冒烟报告 R2），
// 关闭/保存流程会随之永久挂起——超时兜底让用户可重试而非卡死
const CARD_INVOKE_TIMEOUT_MS = 8_000;

function withCardTimeout<T>(promise: Promise<T>, action: string): Promise<T> {
  return withTimeout(
    promise,
    CARD_INVOKE_TIMEOUT_MS,
    `CARD_INVOKE_TIMEOUT: ${action}超时（${CARD_INVOKE_TIMEOUT_MS / 1000} 秒），请重试`
  );
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

type RawDiaryEntry = Omit<DiaryEntry, "weather" | "mood" | "content"> & {
  weather?: string | DiaryWeatherMood | null;
  mood?: string | DiaryWeatherMood | null;
  content?: unknown;
};

function parseDiaryWeatherMood(raw: unknown): DiaryWeatherMood | null {
  if (raw == null) {
    return null;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as DiaryWeatherMood;
      if (
        parsed &&
        (parsed.type === "emoji" || parsed.type === "image") &&
        typeof parsed.value === "string"
      ) {
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (
    typeof raw === "object" &&
    raw !== null &&
    ((raw as DiaryWeatherMood).type === "emoji" || (raw as DiaryWeatherMood).type === "image") &&
    typeof (raw as DiaryWeatherMood).value === "string"
  ) {
    return raw as DiaryWeatherMood;
  }
  return null;
}

function normalizeDiaryEntry(raw: RawDiaryEntry): DiaryEntry {
  return {
    ...raw,
    weather: parseDiaryWeatherMood(raw.weather),
    mood: parseDiaryWeatherMood(raw.mood),
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    segments: (raw.segments ?? []).map(segment => ({
      ...segment,
      content: Array.isArray(segment.content) ? segment.content : [],
    })),
    content: Array.isArray(raw.content) ? (raw.content as DiaryEntry["content"]) : [],
  };
}

// Android WebView 首次加载期间，最早的 invoke 可能被 IPC 层直接丢弃（既不 resolve 也不 reject），
// 首启引导若不重试会永久卡死在初始化；后续 IPC 就绪后重试即可正常返回。
const BOOTSTRAP_TIMEOUT_MS = 8_000;
let bootstrapInFlight: Promise<BootstrapResponse> | null = null;

function runBootstrap(): Promise<BootstrapResponse> {
  const request = trackedInvoke<BootstrapResponse>("bootstrap_app");
  return withTimeout(
    request,
    BOOTSTRAP_TIMEOUT_MS,
    `BOOTSTRAP_TIMEOUT: 引导超时（${BOOTSTRAP_TIMEOUT_MS / 1000} 秒），请重试`
  );
}

export function bootstrapApp(): Promise<BootstrapResponse> {
  if (!bootstrapInFlight) {
    bootstrapInFlight = runBootstrap().finally(() => {
      bootstrapInFlight = null;
    });
  }
  return bootstrapInFlight;
}

export function readSettingJson() {
  return trackedInvoke<string>("read_setting_json");
}

export function writeSettingJson(payload: string) {
  return trackedInvoke<SettingWriteResponse>("write_setting_json", { payload });
}

export function verifyGithubToken(token: string) {
  return trackedInvoke<{ name: string; email: string }>("verify_github_token", {
    token,
  });
}

export function listGithubRepos(token: string, owner: string) {
  return trackedInvoke<string[]>("list_github_repos", { token, owner });
}

export function listGithubBranches(token: string, owner: string, repo: string) {
  return trackedInvoke<string[]>("list_github_branches", { token, owner, repo });
}

export function verifyS3Credentials(params: {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  urlStyle: "path" | "virtualHosted" | string;
  bucket: string;
  region: string;
}) {
  return withTimeout(
    trackedInvoke<string>("verify_s3_credentials", { payload: params }),
    VERIFY_TIMEOUT_MS,
    `S3_VERIFY_FAILED:S3 验证超时（${Math.floor(VERIFY_TIMEOUT_MS / 1000)} 秒），请检查网络后重试`
  );
}

export function verifyWebdavCredentials(params: {
  url: string;
  username: string;
  password: string;
}) {
  return trackedInvoke<string>("verify_webdav_credentials", { payload: params });
}

export function verifyAliOssCredentials(params: {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
}) {
  return trackedInvoke<string>("verify_alioss_credentials", { payload: params });
}

export function listDatabases() {
  return trackedInvoke<DatabaseListResponse>("list_databases");
}

/** 当前激活数据库文件大小（字节，含 WAL/SHM） */
export function getActiveDatabaseSize() {
  return trackedInvoke<number>("get_active_database_size");
}

export function setActiveDatabase(name: string) {
  return trackedInvoke<ActiveDatabaseResponse>("set_active_database", { name });
}

export function getCardsOverview(params: {
  page: number;
  pageSize: number;
  query?: string;
  category?: string;
}) {
  return withCardTimeout(
    trackedInvoke<CardsOverviewResponse>("get_cards_overview", params),
    "读取卡片列表"
  );
}

export function searchAllContent(params: {
  query: string;
  page?: number;
  pageSize?: number;
  types?: string[];
}) {
  return withCardTimeout(
    trackedInvoke<UnifiedSearchResponse>("search_all_content", params),
    "搜索内容"
  );
}

export function getCardDetail(id: number) {
  return withCardTimeout(
    trackedInvoke<CardDetailResponse>("get_card_detail", { id }),
    "读取卡片详情"
  );
}

export function getContentDetail(contentId: number) {
  return trackedInvoke<ContentDetailResponse>("get_content_detail", { contentId });
}

export function createTemporaryCard(params: { content: unknown[]; count: number }) {
  // 创建是非幂等操作：超时只代表放弃等待，后端事务可能仍会提交，
  // 引导用户确认而非盲目重试，避免产生重复卡片
  return withTimeout(
    trackedInvoke<CardDetailResponse>("create_temporary_card", {
      payload: params,
    }),
    CARD_INVOKE_TIMEOUT_MS,
    `CARD_INVOKE_TIMEOUT: 创建卡片超时（${CARD_INVOKE_TIMEOUT_MS / 1000} 秒），请返回列表确认是否已创建，勿直接重试`
  );
}

export function updateContent(params: { contentId: number; content: unknown[]; count: number }) {
  return withCardTimeout(
    trackedInvoke<ContentDetailResponse>("update_content", {
      payload: params,
    }),
    "保存卡片内容"
  );
}

export function updateCardCategory(params: { id: number; category: KnownCardCategory }) {
  return withCardTimeout(
    trackedInvoke<CardDetailResponse>("update_card_category", {
      payload: params,
    }),
    "更新卡片分类"
  );
}

export function updateCardTags(params: { id: number; tags: string[] }) {
  return withCardTimeout(
    trackedInvoke<CardDetailResponse>("update_card_tags", {
      payload: params,
    }),
    "更新卡片标签"
  );
}

export function updateCardLinks(params: { id: number; links: number[] }) {
  return withCardTimeout(
    trackedInvoke<CardDetailResponse>("update_card_links", {
      payload: params,
    }),
    "更新卡片关联"
  );
}

export function getCardsByIds(ids: number[]) {
  return withCardTimeout(
    trackedInvoke<CardListItem[]>("get_cards_by_ids", { payload: { ids } }),
    "读取关联卡片"
  );
}

export function deleteCard(id: number) {
  return withCardTimeout(trackedInvoke<number>("delete_card", { id }), "删除卡片");
}

export function getDatabaseSchemaStatus(name?: string) {
  return trackedInvoke<DatabaseSchemaStatusResponse>("get_database_schema_status", {
    name,
  });
}

export function createContent(params: { content: unknown[]; count?: number }) {
  return trackedInvoke<number>("create_content", { payload: params });
}

export function diaryListEntries(payload?: DiaryListPayload) {
  const call = payload
    ? trackedInvoke<RawDiaryEntry[]>("diary_list_entries", { payload })
    : trackedInvoke<RawDiaryEntry[]>("diary_list_entries");
  return call.then(rows => rows.map(normalizeDiaryEntry));
}

export function diaryGetEntry(payload: { type: DiaryEntry["type"]; date: string }) {
  return trackedInvoke<RawDiaryEntry | null>("diary_get_entry", { payload }).then(row =>
    row ? normalizeDiaryEntry(row) : null
  );
}

export function diaryUpsertEntry(payload: DiaryUpsertPayload) {
  return trackedInvoke<RawDiaryEntry>("diary_upsert_entry", { payload }).then(normalizeDiaryEntry);
}

export function diaryDeleteEntry(id: number) {
  return trackedInvoke<number>("diary_delete_entry", { payload: { id } });
}

/** 删除日记片段；返回 null 表示该日记已无片段、后端连空壳 entry 一起删掉了 */
export function diaryDeleteSegment(diaryId: number, segmentId: number) {
  return trackedInvoke<RawDiaryEntry | null>("diary_delete_segment", {
    payload: { diaryId, segmentId },
  }).then(raw => (raw ? normalizeDiaryEntry(raw) : null));
}

export function diaryGetTagSettings() {
  return trackedInvoke<DiaryTagSetting[]>("diary_get_tag_settings");
}

export function diaryUpsertTagSetting(payload: { name: string; color: string }) {
  return trackedInvoke<DiaryTagSetting[]>("diary_upsert_tag_setting", { payload });
}

export function diaryRenameTagSetting(payload: { name: string; newName: string }) {
  return trackedInvoke<DiaryTagSetting[]>("diary_rename_tag_setting", { payload });
}

export function diaryDeleteTagSetting(name: string) {
  return trackedInvoke<DiaryTagSetting[]>("diary_delete_tag_setting", {
    payload: { name },
  });
}

export function diaryUpdateTags(payload: { id: number; tags: string[] }) {
  return trackedInvoke<RawDiaryEntry>("diary_update_tags", { payload }).then(normalizeDiaryEntry);
}

export function todoListGroups() {
  return trackedInvoke<TodoGroup[]>("todo_list_groups");
}

export function todoGetSystemGroups() {
  return trackedInvoke<TodoGroup[]>("todo_get_system_groups");
}

export function todoCreateGroup(payload: CreateTodoGroupPayload) {
  return trackedInvoke<TodoGroup>("todo_create_group", { payload });
}

export function todoUpdateGroup(payload: UpdateTodoGroupPayload) {
  return trackedInvoke<TodoGroup>("todo_update_group", { payload });
}

export function todoArchiveGroup(payload: ArchiveTodoGroupPayload) {
  return trackedInvoke<number>("todo_archive_group", { payload });
}

export function todoReorderGroups(payload: ReorderTodoGroupsPayload) {
  return trackedInvoke<number>("todo_reorder_groups", { payload });
}

export function todoGetGroupStats() {
  return trackedInvoke<TodoGroupStats[]>("todo_get_group_stats");
}

export function todoGetSystemGroupStats() {
  return trackedInvoke<TodoGroupStats[]>("todo_get_system_group_stats");
}

export function todoListItems(payload: ListTodoItemsPayload) {
  return trackedInvoke<TodoItem[]>("todo_list_items", { payload });
}

export function todoListItemsByType(payload: ListTodoItemsByTypePayload) {
  return trackedInvoke<TodoItem[]>("todo_list_items_by_type", { payload });
}

export function todoCreateItem(payload: CreateTodoItemPayload) {
  return trackedInvoke<TodoItem>("todo_create_item", { payload });
}

export function todoCreateItemRelative(payload: CreateTodoItemRelativePayload) {
  return trackedInvoke<TodoItem>("todo_create_item_relative", { payload });
}

export function todoUpdateItem(payload: UpdateTodoItemPayload) {
  return trackedInvoke<TodoItem>("todo_update_item", { payload });
}

export function todoToggleCompleteCascade(payload: ToggleTodoCompletePayload) {
  return trackedInvoke<number>("todo_toggle_complete_cascade", { payload });
}

export function todoMoveAndReorder(payload: MoveAndReorderTodoItemPayload) {
  return trackedInvoke<TodoItem>("todo_move_and_reorder", { payload });
}

export function todoArchiveItem(id: number, isArchived: boolean) {
  return trackedInvoke<number>("todo_archive_item", {
    payload: { id, isArchived },
  });
}

export function todoDeleteItem(id: number) {
  return trackedInvoke<number>("todo_delete_item", { payload: { id } });
}

export function todoDeleteItemCascade(id: number) {
  return trackedInvoke<number>("todo_delete_item_cascade", { payload: { id } });
}

export function todoGetRecurrence(id: number) {
  return trackedInvoke<TodoRecurrence | null>("todo_get_recurrence", {
    payload: { id },
  });
}

export function todoGetRecurrenceByItem(todoItemId: number) {
  return trackedInvoke<TodoRecurrence | null>("todo_get_recurrence_by_item", {
    payload: { todoItemId },
  });
}

export function todoCreateRecurrence(payload: CreateTodoRecurrencePayload) {
  return trackedInvoke<TodoRecurrence>("todo_create_recurrence", { payload });
}

export function todoUpdateRecurrence(payload: UpdateTodoRecurrencePayload) {
  return trackedInvoke<TodoRecurrence>("todo_update_recurrence", { payload });
}

export function todoDeleteRecurrence(id: number) {
  return trackedInvoke<number>("todo_delete_recurrence", {
    payload: { id },
  });
}

export function todoDeleteRecurrenceByItem(todoItemId: number) {
  return trackedInvoke<number>("todo_delete_recurrence_by_item", {
    payload: { todoItemId },
  });
}

export function todoGetRecurrenceCompletions(
  recurrenceId: number,
  startDate?: number,
  endDate?: number
) {
  return trackedInvoke<TodoRecurrenceCompletion[]>("todo_get_recurrence_completions", {
    payload: { recurrenceId, startDate, endDate },
  });
}

export function todoGetRecurrenceCompletion(recurrenceId: number, scheduledDate: number) {
  return trackedInvoke<TodoRecurrenceCompletion | null>("todo_get_recurrence_completion", {
    payload: { recurrenceId, scheduledDate },
  });
}

export function todoCompleteRecurrence(recurrenceId: number, scheduledDate: number) {
  return trackedInvoke<TodoRecurrenceCompletion>("todo_complete_recurrence", {
    payload: { recurrenceId, scheduledDate },
  });
}

export function todoUncompleteRecurrence(recurrenceId: number, scheduledDate: number) {
  return trackedInvoke<number>("todo_uncomplete_recurrence", {
    payload: { recurrenceId, scheduledDate },
  });
}

export function todoSkipRecurrence(recurrenceId: number, scheduledDate: number) {
  return trackedInvoke<TodoRecurrenceCompletion>("todo_skip_recurrence", {
    payload: { recurrenceId, scheduledDate },
  });
}

/* ── 番茄专注 ── */

export function pomodoroListPresets() {
  return trackedInvoke<PomodoroPreset[]>("pomodoro_list_presets");
}

export function pomodoroCreatePreset(payload: {
  name: string;
  mode: PomodoroMode;
  durationMin?: number;
}) {
  return trackedInvoke<PomodoroPreset>("pomodoro_create_preset", { payload });
}

export function pomodoroUpdatePreset(payload: {
  id: number;
  name?: string;
  mode?: PomodoroMode;
  durationMin?: number;
}) {
  return trackedInvoke<PomodoroPreset>("pomodoro_update_preset", { payload });
}

export function pomodoroArchivePreset(id: number, archived: boolean) {
  return trackedInvoke<number>("pomodoro_archive_preset", { payload: { id, archived } });
}

export function pomodoroReorderPresets(orderedIds: number[]) {
  return trackedInvoke<number>("pomodoro_reorder_presets", { payload: { orderedIds } });
}

export function pomodoroDeletePreset(id: number) {
  return trackedInvoke<number>("pomodoro_delete_preset", { payload: { id } });
}

export function pomodoroGetActiveSession() {
  return trackedInvoke<PomodoroSession | null>("pomodoro_get_active_session");
}

export function pomodoroStartSession(presetId: number, expectedMs?: number) {
  return trackedInvoke<PomodoroSession>("pomodoro_start_session", {
    payload: { presetId, expectedMs: expectedMs ?? null },
  });
}

export function pomodoroPauseSession() {
  return trackedInvoke<PomodoroSession | null>("pomodoro_pause_session");
}

export function pomodoroResumeSession() {
  return trackedInvoke<PomodoroSession | null>("pomodoro_resume_session");
}

export function pomodoroStopSession(asComplete = true) {
  return trackedInvoke<PomodoroSession | null>("pomodoro_stop_session", {
    payload: { asComplete },
  });
}

export function pomodoroListSessions(payload: ListPomodoroSessionsPayload = {}) {
  return trackedInvoke<PomodoroSession[]>("pomodoro_list_sessions", { payload });
}

export function pomodoroUpdateSession(sessionId: number, focusMs: number) {
  return trackedInvoke<PomodoroSession>("pomodoro_update_session", {
    payload: { sessionId, focusMs },
  });
}

export function pomodoroDeleteSession(sessionId: number) {
  return trackedInvoke<number>("pomodoro_delete_session", { payload: { sessionId } });
}

export function pomodoroDeleteSessions(sessionIds: number[]) {
  return trackedInvoke<number>("pomodoro_delete_sessions", { payload: { sessionIds } });
}

/** 今日汇总；时间边界由前端算（本地时区当天零点~23:59:59.999），后端无时区依赖 */
export function pomodoroSummaryToday(start: number, end: number) {
  return trackedInvoke<PomodoroSummary>("pomodoro_summary_today", { payload: { start, end } });
}

export function pomodoroSummaryTotal() {
  return trackedInvoke<PomodoroSummary>("pomodoro_summary_total");
}

/** 按日聚合（用于周条形图）；day_starts 为各天本地零点毫秒 */
export function pomodoroSummaryDaily(dayStarts: number[]) {
  return trackedInvoke<PomodoroDailySummary[]>("pomodoro_summary_daily", {
    payload: { dayStarts },
  });
}

export function syncCheckVersions() {
  return withTimeout(
    trackedInvoke<SyncVersionResponse>("sync_check_versions"),
    SYNC_CHECK_TIMEOUT_MS,
    `SYNC_CHECK_FAILED:同步状态刷新超时（${Math.floor(
      SYNC_CHECK_TIMEOUT_MS / 1000
    )} 秒），请检查网络、Endpoint 或 URL 风格`
  );
}

export function syncUploadDatabase() {
  return trackedInvoke<SyncActionResponse>("sync_upload_database");
}

export function syncDownloadDatabase() {
  return trackedInvoke<SyncActionResponse>("sync_download_database");
}

export function resourceSyncRefresh() {
  return trackedInvoke<ResourceSyncStatusFile | null>("resource_sync_refresh");
}

export function resourceSyncStart() {
  return trackedInvoke<ResourceSyncActionResponse>("resource_sync_start");
}

export function resourceSyncRetryFailed() {
  return trackedInvoke<ResourceSyncActionResponse>("resource_sync_retry_failed");
}

export function resourceSyncCancel() {
  return trackedInvoke<ResourceSyncActionResponse>("resource_sync_cancel");
}

export function resourceSyncGetProgress() {
  return trackedInvoke<ResourceSyncProgress>("resource_sync_get_progress");
}

export function resourceSyncGetStatus() {
  return trackedInvoke<ResourceSyncStatusFile | null>("resource_sync_get_status");
}

// Android 的 IPC 二进制通道不可靠（tauri#10573 会把二进制包装成逐字节 JSON），
// 上传/读取统一走 base64 字符串；调用方负责先做前端预压缩以控制负载
export function uploadResource(params: { fileName: string; mimeType: string; base64: string }) {
  return trackedInvoke<string>("upload_resource", { payload: params });
}

// 读取 .editor 内资源文件，返回 base64 字符串（Android asset protocol 缺陷 tauri#12364 的替代通道）
export function readResourceBytes(path: string) {
  return trackedInvoke<string>("read_resource_bytes", { path });
}

// 读取资源缩略图（后端按需生成并缓存 <stem>_thumb.webp，最长边 640px），列表等小图场景使用
export function readResourceThumb(path: string) {
  return trackedInvoke<string>("read_resource_thumb", { path });
}

export function remoteResourceToLocal(url: string, fileName?: string) {
  return trackedInvoke<string>("remote_resource_to_local", {
    url,
    fileName,
  });
}

/* ── 文章 ── */

export function articleList(params: { offset?: number; limit?: number } = {}) {
  return trackedInvoke<ArticleListResponse>("article_list", { payload: params });
}

export function articleGet(id: number) {
  return trackedInvoke<ArticleDetail>("article_get", { payload: { id } });
}

export function articleCreate(params: { title: string; author?: string }) {
  return trackedInvoke<ArticleDetail>("article_create", { payload: params });
}

export function articleUpdate(params: {
  id: number;
  title?: string;
  author?: string;
  tags?: string[];
  bannerBg?: string;
  bannerPosition?: string;
  isTop?: boolean;
}) {
  return trackedInvoke<ArticleDetail>("article_update", { payload: params });
}

export function articleDelete(id: number) {
  return trackedInvoke<number>("article_delete", { payload: { id } });
}

/* ── 项目 ── */

export function projectList(params: { offset?: number; limit?: number } = {}) {
  return trackedInvoke<ProjectListResponse>("project_list", { payload: params });
}

export function projectGet(id: number) {
  return trackedInvoke<Project>("project_get", { payload: { id } });
}

export function projectItemList() {
  return trackedInvoke<ProjectItem[]>("project_item_list");
}

export function projectCreate(params: { title: string; desc?: string; projectType?: string }) {
  return trackedInvoke<Project>("project_create", { payload: params });
}

export function projectUpdate(params: {
  id: number;
  title?: string;
  desc?: string;
  pinned?: boolean;
  archived?: boolean;
}) {
  return trackedInvoke<Project>("project_update", { payload: params });
}

export function projectDelete(id: number) {
  return trackedInvoke<number>("project_delete", { payload: { id } });
}

export function projectItemCreate(params: {
  projectId: number;
  parentId?: number;
  title: string;
  itemType?: string;
  refType?: string;
  refId?: number;
}) {
  return trackedInvoke<ProjectItem>("project_item_create", { payload: params });
}

export function projectItemUpdate(params: { id: number; title?: string }) {
  return trackedInvoke<number>("project_item_update", { payload: params });
}

export function projectItemDelete(id: number) {
  return trackedInvoke<number>("project_item_delete", { payload: { id } });
}

/* ── 知识库 ── */

export function documentLibraryList(params: { offset?: number; limit?: number } = {}) {
  return trackedInvoke<DocumentLibraryListResponse>("document_library_list", { payload: params });
}

export function documentLibraryGet(id: number) {
  return trackedInvoke<DocumentLibrary>("document_library_get", { payload: { id } });
}

export function documentItemList() {
  return trackedInvoke<DocumentItem[]>("document_item_list");
}

export function documentLibraryCreate(params: { title: string; desc?: string }) {
  return trackedInvoke<DocumentLibrary>("document_library_create", { payload: params });
}

export function documentLibraryUpdate(params: {
  id: number;
  title?: string;
  desc?: string;
  isTop?: boolean;
}) {
  return trackedInvoke<DocumentLibrary>("document_library_update", { payload: params });
}

export function documentLibraryDelete(id: number) {
  return trackedInvoke<number>("document_library_delete", { payload: { id } });
}

export function documentItemCreate(params: {
  documentId: number;
  parentId?: number;
  title: string;
  refType?: string;
  refId?: number;
}) {
  return trackedInvoke<DocumentItem>("document_item_create", { payload: params });
}

export function documentItemUpdate(params: { id: number; title?: string; tags?: string[] }) {
  return trackedInvoke<number>("document_item_update", { payload: params });
}

export function documentItemDelete(id: number) {
  return trackedInvoke<number>("document_item_delete", { payload: { id } });
}

/* ── 首页汇总统计 ── */

export function getHomeStats() {
  return trackedInvoke<HomeStats>("get_home_stats");
}

/* ── 协作 ── */

export function collabBindContent(params: {
  contentId: number;
  serverUrl: string;
  documentId: string;
  sourceType?: string;
  sourceId?: number;
  sourceTitle?: string;
}) {
  return trackedInvoke<CollaborationBinding>("collab_bind_content", { payload: params });
}

export function collabGetBinding(contentId: number) {
  return trackedInvoke<CollaborationBinding | null>("collab_get_binding", { contentId });
}

export function collabListBindings() {
  return trackedInvoke<CollaborationBinding[]>("collab_list_bindings");
}

export function collabUnbindContent(contentId: number) {
  return trackedInvoke<void>("collab_unbind_content", { contentId });
}

/** 协作投影专用写通道：绑定漂移时服务端侧自动解绑并返回 reason=drift */
export function collabProjectContent(params: {
  contentId: number;
  content: unknown[];
  count: number;
}) {
  return trackedInvoke<{ projected: boolean; changed?: boolean; reason?: string }>(
    "collab_project_content",
    { payload: params }
  );
}
