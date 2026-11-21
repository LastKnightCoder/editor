import { invoke } from "@/electron";
import type { ResourceSyncSnapshot, ISyncStatusFile, ResourceSyncOptions } from "@/types";

interface SyncResponse {
  ok: boolean;
  cancelled?: boolean;
  message?: string;
}

export const startResourceSync = async (options: ResourceSyncOptions): Promise<SyncResponse> => {
  return invoke("resource-sync:start", options);
};

export const resumeResourceSync = async (options?: ResourceSyncOptions): Promise<SyncResponse> => {
  return invoke("resource-sync:resume", options);
};

export const retryFailedResourceSync = async (
  options?: ResourceSyncOptions,
  fileName?: string
): Promise<SyncResponse> => {
  return invoke("resource-sync:retry-failed", options, fileName);
};

export const cancelResourceSync = async (): Promise<SyncResponse> => {
  return invoke("resource-sync:cancel");
};

export const getResourceSyncSnapshot = (
  options: ResourceSyncOptions
): Promise<ResourceSyncSnapshot> => invoke("resource-sync:get-snapshot", options);

export const refreshResourceSyncStatuses = async (
  options?: ResourceSyncOptions
): Promise<ISyncStatusFile | null> => {
  return invoke("resource-sync:refresh", options);
};
