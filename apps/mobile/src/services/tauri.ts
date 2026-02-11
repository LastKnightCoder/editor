import { invoke } from "@tauri-apps/api/core";
import type {
  ActiveDatabaseResponse,
  BootstrapResponse,
  CardDetailResponse,
  CardsOverviewResponse,
  DatabaseListResponse,
  SettingWriteResponse,
  SyncActionResponse,
  SyncVersionResponse,
} from "../types";

export function bootstrapApp() {
  return invoke<BootstrapResponse>("bootstrap_app");
}

export function readSettingJson() {
  return invoke<string>("read_setting_json");
}

export function writeSettingJson(payload: string) {
  return invoke<SettingWriteResponse>("write_setting_json", { payload });
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

export function syncCheckVersions() {
  return invoke<SyncVersionResponse>("sync_check_versions");
}

export function syncUploadDatabase() {
  return invoke<SyncActionResponse>("sync_upload_database");
}

export function syncDownloadDatabase() {
  return invoke<SyncActionResponse>("sync_download_database");
}
