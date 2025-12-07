import { invoke } from "@/electron";
import type {
  IResourceSyncProgress,
  ISyncStatusFile,
  ResourceSyncOptions,
} from "@/types";

interface SyncResponse {
  ok: boolean;
  message?: string;
}

export const startResourceSync = async (
  options: ResourceSyncOptions,
): Promise<SyncResponse> => {
  return invoke("resource-sync:start", options);
};

export const resumeResourceSync = async (
  options?: ResourceSyncOptions,
): Promise<SyncResponse> => {
  return invoke("resource-sync:resume", options);
};

export const retryFailedResourceSync = async (
  options?: ResourceSyncOptions,
): Promise<SyncResponse> => {
  return invoke("resource-sync:retry-failed", options);
};

export const cancelResourceSync = async (): Promise<SyncResponse> => {
  return invoke("resource-sync:cancel");
};

export const getResourceSyncProgress =
  async (): Promise<IResourceSyncProgress> => {
    return invoke("resource-sync:get-progress");
  };

export const getResourceSyncStatuses =
  async (): Promise<ISyncStatusFile | null> => {
    return invoke("resource-sync:get-statuses");
  };

export const refreshResourceSyncStatuses = async (
  options?: ResourceSyncOptions,
): Promise<ISyncStatusFile | null> => {
  return invoke("resource-sync:refresh", options);
};
