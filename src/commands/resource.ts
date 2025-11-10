import { IResource, ICreateResource, ResourceType } from "@/types";
import { invoke } from "@/electron";

export const createOrUpdateResource = async (
  data: ICreateResource,
): Promise<IResource> => {
  return invoke("resource:create-or-update", data);
};

export const incrementResourceRefCount = async (
  path: string,
  source?: { type: string; id: number },
): Promise<void> => {
  return invoke("resource:increment-ref", path, source);
};

export const decrementResourceRefCount = async (
  path: string,
): Promise<void> => {
  return invoke("resource:decrement-ref", path);
};

export const getAllResources = async (): Promise<IResource[]> => {
  return invoke("resource:get-all");
};

export const searchResources = async (
  keyword: string,
): Promise<IResource[]> => {
  return invoke("resource:search", keyword);
};

export const getResourcesByType = async (
  type: ResourceType,
): Promise<IResource[]> => {
  return invoke("resource:get-by-type", type);
};

export const scanAndUpdateResources = async (): Promise<void> => {
  return invoke("resource:scan-and-update");
};
