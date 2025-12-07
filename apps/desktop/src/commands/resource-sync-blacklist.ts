import { invoke } from "@/electron";
import { IResourceSyncBlacklistItem } from "@/types";

export const listResourceSyncBlacklist = async (): Promise<
  IResourceSyncBlacklistItem[]
> => {
  return invoke("resource-sync-blacklist:list");
};

export const addResourceSyncBlacklist = async (
  fileNames: string[],
): Promise<IResourceSyncBlacklistItem[]> => {
  return invoke("resource-sync-blacklist:add", fileNames);
};

export const removeResourceSyncBlacklist = async (payload: {
  ids?: number[];
  fileNames?: string[];
}): Promise<IResourceSyncBlacklistItem[]> => {
  return invoke("resource-sync-blacklist:remove", payload);
};

export const clearResourceSyncBlacklist = async (): Promise<
  IResourceSyncBlacklistItem[]
> => {
  return invoke("resource-sync-blacklist:clear");
};
