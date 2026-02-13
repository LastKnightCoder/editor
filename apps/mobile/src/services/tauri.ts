import { invoke } from "@tauri-apps/api/core";
import type {
  ActiveDatabaseResponse,
  BootstrapResponse,
  CardDetailResponse,
  ContentDetailResponse,
  CardsOverviewResponse,
  DatabaseListResponse,
  ResourceSyncActionResponse,
  ResourceSyncProgress,
  ResourceSyncStatusFile,
  SettingWriteResponse,
  SyncActionResponse,
  SyncVersionResponse,
} from "../types";
import type { KnownCardCategory } from "../features/cards/cardCategory";

const VERIFY_TIMEOUT_MS = 15_000;
const SYNC_CHECK_TIMEOUT_MS = 35_000;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
) {
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
    `S3_VERIFY_FAILED:S3 验证超时（${Math.floor(
      VERIFY_TIMEOUT_MS / 1000,
    )} 秒），请检查网络后重试`,
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

export function createTemporaryCard(params: {
  content: unknown[];
  count: number;
}) {
  return invoke<CardDetailResponse>("create_temporary_card", {
    payload: params,
  });
}

export function updateCardContent(params: {
  id: number;
  content: unknown[];
  count: number;
}) {
  return invoke<CardDetailResponse>("update_card_content", {
    payload: params,
  });
}

export function updateCardCategory(params: {
  id: number;
  category: KnownCardCategory;
}) {
  return invoke<CardDetailResponse>("update_card_category", {
    payload: params,
  });
}

export function deleteCard(id: number) {
  return invoke<number>("delete_card", { id });
}

export function syncCheckVersions() {
  return withTimeout(
    invoke<SyncVersionResponse>("sync_check_versions"),
    SYNC_CHECK_TIMEOUT_MS,
    `SYNC_CHECK_FAILED:同步状态刷新超时（${Math.floor(
      SYNC_CHECK_TIMEOUT_MS / 1000,
    )} 秒），请检查网络、Endpoint 或 URL 风格`,
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

export function uploadResource(params: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}) {
  return invoke<string>("upload_resource", { payload: params });
}
