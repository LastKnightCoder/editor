import { invoke } from "@/electron";
import {
  NotionSync,
  CreateNotionSync,
  UpdateNotionSync,
} from "@/types/notion-sync";

export async function createNotionSync(
  data: CreateNotionSync,
): Promise<NotionSync> {
  return await invoke("create-notion-sync", data);
}

export async function updateNotionSync(
  id: number,
  data: UpdateNotionSync,
): Promise<NotionSync | null> {
  return await invoke("update-notion-sync", id, data);
}

export async function getNotionSync(id: number): Promise<NotionSync | null> {
  return await invoke("get-notion-sync", id);
}

export async function getNotionSyncByPageId(
  pageId: string,
): Promise<NotionSync | null> {
  return await invoke("get-notion-sync-by-page-id", pageId);
}

export async function deleteNotionSync(id: number): Promise<boolean> {
  return await invoke("delete-notion-sync", id);
}

export async function getAllNotionSyncs(): Promise<NotionSync[]> {
  return await invoke("get-all-notion-syncs");
}

export async function getPendingSyncs(): Promise<NotionSync[]> {
  return await invoke("get-pending-syncs");
}

export async function markAsPendingSync(
  id: number,
  pending = true,
): Promise<boolean> {
  return await invoke("mark-as-pending-sync", id, pending);
}
