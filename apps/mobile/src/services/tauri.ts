import { invoke } from "@tauri-apps/api/core";
import type {
  ActiveDatabaseResponse,
  ArchiveTodoGroupPayload,
  BootstrapResponse,
  CardDetailResponse,
  CreateTodoGroupPayload,
  CreateTodoItemPayload,
  CreateTodoItemRelativePayload,
  CreateTodoRecurrencePayload,
  ContentDetailResponse,
  CardsOverviewResponse,
  DatabaseListResponse,
  DatabaseSchemaStatusResponse,
  DiaryEntry,
  DiaryListPayload,
  DiaryUpsertPayload,
  DiaryWeatherMood,
  ListTodoItemsPayload,
  ListTodoItemsByTypePayload,
  MoveAndReorderTodoItemPayload,
  ReorderTodoGroupsPayload,
  ResourceSyncActionResponse,
  ResourceSyncProgress,
  ResourceSyncStatusFile,
  SettingWriteResponse,
  SyncActionResponse,
  SyncVersionResponse,
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

const VERIFY_TIMEOUT_MS = 15_000;
const SYNC_CHECK_TIMEOUT_MS = 35_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string) {
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

export function bootstrapApp() {
  return invoke<BootstrapResponse>("bootstrap_app");
}

export function readSettingJson() {
  return invoke<string>("read_setting_json");
}

export function writeSettingJson(payload: string) {
  return invoke<SettingWriteResponse>("write_setting_json", { payload });
}

export function verifyGithubToken(token: string) {
  return invoke<{ name: string; email: string }>("verify_github_token", {
    token,
  });
}

export function listGithubRepos(token: string, owner: string) {
  return invoke<string[]>("list_github_repos", { token, owner });
}

export function listGithubBranches(token: string, owner: string, repo: string) {
  return invoke<string[]>("list_github_branches", { token, owner, repo });
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
    invoke<string>("verify_s3_credentials", { payload: params }),
    VERIFY_TIMEOUT_MS,
    `S3_VERIFY_FAILED:S3 验证超时（${Math.floor(VERIFY_TIMEOUT_MS / 1000)} 秒），请检查网络后重试`
  );
}

export function verifyWebdavCredentials(params: {
  url: string;
  username: string;
  password: string;
}) {
  return invoke<string>("verify_webdav_credentials", { payload: params });
}

export function verifyAliOssCredentials(params: {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
}) {
  return invoke<string>("verify_alioss_credentials", { payload: params });
}

export function listDatabases() {
  return invoke<DatabaseListResponse>("list_databases");
}

export function setActiveDatabase(name: string) {
  return invoke<ActiveDatabaseResponse>("set_active_database", { name });
}

export function getCardsOverview(params: {
  page: number;
  pageSize: number;
  query?: string;
  category?: string;
}) {
  return invoke<CardsOverviewResponse>("get_cards_overview", params);
}

export function getCardDetail(id: number) {
  return invoke<CardDetailResponse>("get_card_detail", { id });
}

export function getContentDetail(contentId: number) {
  return invoke<ContentDetailResponse>("get_content_detail", { contentId });
}

export function createTemporaryCard(params: { content: unknown[]; count: number }) {
  return invoke<CardDetailResponse>("create_temporary_card", {
    payload: params,
  });
}

export function updateContent(params: { contentId: number; content: unknown[]; count: number }) {
  return invoke<ContentDetailResponse>("update_content", {
    payload: params,
  });
}

export function updateCardCategory(params: { id: number; category: KnownCardCategory }) {
  return invoke<CardDetailResponse>("update_card_category", {
    payload: params,
  });
}

export function deleteCard(id: number) {
  return invoke<number>("delete_card", { id });
}

export function getDatabaseSchemaStatus(name?: string) {
  return invoke<DatabaseSchemaStatusResponse>("get_database_schema_status", {
    name,
  });
}

export function createContent(params: { content: unknown[]; count?: number }) {
  return invoke<number>("create_content", { payload: params });
}

export function diaryListEntries(payload?: DiaryListPayload) {
  const call = payload
    ? invoke<RawDiaryEntry[]>("diary_list_entries", { payload })
    : invoke<RawDiaryEntry[]>("diary_list_entries");
  return call.then(rows => rows.map(normalizeDiaryEntry));
}

export function diaryGetEntry(payload: { type: DiaryEntry["type"]; date: string }) {
  return invoke<RawDiaryEntry | null>("diary_get_entry", { payload }).then(row =>
    row ? normalizeDiaryEntry(row) : null
  );
}

export function diaryUpsertEntry(payload: DiaryUpsertPayload) {
  return invoke<RawDiaryEntry>("diary_upsert_entry", { payload }).then(normalizeDiaryEntry);
}

export function diaryDeleteEntry(id: number) {
  return invoke<number>("diary_delete_entry", { payload: { id } });
}

export function diaryDeleteSegment(diaryId: number, segmentId: number) {
  return invoke<RawDiaryEntry>("diary_delete_segment", {
    payload: { diaryId, segmentId },
  }).then(normalizeDiaryEntry);
}

export function todoListGroups() {
  return invoke<TodoGroup[]>("todo_list_groups");
}

export function todoGetSystemGroups() {
  return invoke<TodoGroup[]>("todo_get_system_groups");
}

export function todoCreateGroup(payload: CreateTodoGroupPayload) {
  return invoke<TodoGroup>("todo_create_group", { payload });
}

export function todoUpdateGroup(payload: UpdateTodoGroupPayload) {
  return invoke<TodoGroup>("todo_update_group", { payload });
}

export function todoArchiveGroup(payload: ArchiveTodoGroupPayload) {
  return invoke<number>("todo_archive_group", { payload });
}

export function todoReorderGroups(payload: ReorderTodoGroupsPayload) {
  return invoke<number>("todo_reorder_groups", { payload });
}

export function todoGetGroupStats() {
  return invoke<TodoGroupStats[]>("todo_get_group_stats");
}

export function todoGetSystemGroupStats() {
  return invoke<TodoGroupStats[]>("todo_get_system_group_stats");
}

export function todoListItems(payload: ListTodoItemsPayload) {
  return invoke<TodoItem[]>("todo_list_items", { payload });
}

export function todoListItemsByType(payload: ListTodoItemsByTypePayload) {
  return invoke<TodoItem[]>("todo_list_items_by_type", { payload });
}

export function todoCreateItem(payload: CreateTodoItemPayload) {
  return invoke<TodoItem>("todo_create_item", { payload });
}

export function todoCreateItemRelative(payload: CreateTodoItemRelativePayload) {
  return invoke<TodoItem>("todo_create_item_relative", { payload });
}

export function todoUpdateItem(payload: UpdateTodoItemPayload) {
  return invoke<TodoItem>("todo_update_item", { payload });
}

export function todoToggleCompleteCascade(payload: ToggleTodoCompletePayload) {
  return invoke<number>("todo_toggle_complete_cascade", { payload });
}

export function todoMoveAndReorder(payload: MoveAndReorderTodoItemPayload) {
  return invoke<TodoItem>("todo_move_and_reorder", { payload });
}

export function todoArchiveItem(id: number, isArchived: boolean) {
  return invoke<number>("todo_archive_item", {
    payload: { id, isArchived },
  });
}

export function todoDeleteItem(id: number) {
  return invoke<number>("todo_delete_item", { payload: { id } });
}

export function todoDeleteItemCascade(id: number) {
  return invoke<number>("todo_delete_item_cascade", { payload: { id } });
}

export function todoGetRecurrence(id: number) {
  return invoke<TodoRecurrence | null>("todo_get_recurrence", {
    payload: { id },
  });
}

export function todoGetRecurrenceByItem(todoItemId: number) {
  return invoke<TodoRecurrence | null>("todo_get_recurrence_by_item", {
    payload: { todoItemId },
  });
}

export function todoCreateRecurrence(payload: CreateTodoRecurrencePayload) {
  return invoke<TodoRecurrence>("todo_create_recurrence", { payload });
}

export function todoUpdateRecurrence(payload: UpdateTodoRecurrencePayload) {
  return invoke<TodoRecurrence>("todo_update_recurrence", { payload });
}

export function todoDeleteRecurrence(id: number) {
  return invoke<number>("todo_delete_recurrence", {
    payload: { id },
  });
}

export function todoDeleteRecurrenceByItem(todoItemId: number) {
  return invoke<number>("todo_delete_recurrence_by_item", {
    payload: { todoItemId },
  });
}

export function todoGetRecurrenceCompletions(
  recurrenceId: number,
  startDate?: number,
  endDate?: number
) {
  return invoke<TodoRecurrenceCompletion[]>("todo_get_recurrence_completions", {
    payload: { recurrenceId, startDate, endDate },
  });
}

export function todoGetRecurrenceCompletion(recurrenceId: number, scheduledDate: number) {
  return invoke<TodoRecurrenceCompletion | null>("todo_get_recurrence_completion", {
    payload: { recurrenceId, scheduledDate },
  });
}

export function todoCompleteRecurrence(recurrenceId: number, scheduledDate: number) {
  return invoke<TodoRecurrenceCompletion>("todo_complete_recurrence", {
    payload: { recurrenceId, scheduledDate },
  });
}

export function todoUncompleteRecurrence(recurrenceId: number, scheduledDate: number) {
  return invoke<number>("todo_uncomplete_recurrence", {
    payload: { recurrenceId, scheduledDate },
  });
}

export function todoSkipRecurrence(recurrenceId: number, scheduledDate: number) {
  return invoke<TodoRecurrenceCompletion>("todo_skip_recurrence", {
    payload: { recurrenceId, scheduledDate },
  });
}

export function syncCheckVersions() {
  return withTimeout(
    invoke<SyncVersionResponse>("sync_check_versions"),
    SYNC_CHECK_TIMEOUT_MS,
    `SYNC_CHECK_FAILED:同步状态刷新超时（${Math.floor(
      SYNC_CHECK_TIMEOUT_MS / 1000
    )} 秒），请检查网络、Endpoint 或 URL 风格`
  );
}

export function syncUploadDatabase() {
  return invoke<SyncActionResponse>("sync_upload_database");
}

export function syncDownloadDatabase() {
  return invoke<SyncActionResponse>("sync_download_database");
}

export function resourceSyncRefresh() {
  return invoke<ResourceSyncStatusFile | null>("resource_sync_refresh");
}

export function resourceSyncStart() {
  return invoke<ResourceSyncActionResponse>("resource_sync_start");
}

export function resourceSyncRetryFailed() {
  return invoke<ResourceSyncActionResponse>("resource_sync_retry_failed");
}

export function resourceSyncCancel() {
  return invoke<ResourceSyncActionResponse>("resource_sync_cancel");
}

export function resourceSyncGetProgress() {
  return invoke<ResourceSyncProgress>("resource_sync_get_progress");
}

export function resourceSyncGetStatus() {
  return invoke<ResourceSyncStatusFile | null>("resource_sync_get_status");
}

export function uploadResource(params: { fileName: string; mimeType: string; bytes: Uint8Array }) {
  return invoke<string>("upload_resource", { payload: params });
}

export function remoteResourceToLocal(url: string, fileName?: string) {
  return invoke<string>("remote_resource_to_local", {
    url,
    fileName,
  });
}
