import {
  IResource,
  ICreateResource,
  ResourceType,
  ResourceGroup,
  CreateResourceGroup,
  UpdateResourceGroup,
} from "@/types";
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

export const updateResourceName = async (
  id: number,
  name: string,
): Promise<IResource | null> => {
  return invoke("resource:update-name", id, name);
};

export const moveResourceToGroup = async (
  resourceId: number,
  groupId: number | null,
): Promise<IResource> => {
  return invoke("resource:move-to-group", resourceId, groupId);
};

// Resource Group commands
export const createResourceGroup = async (
  data: CreateResourceGroup,
): Promise<ResourceGroup> => {
  return invoke("resource-group:create", data);
};

export const updateResourceGroup = async (
  data: UpdateResourceGroup,
): Promise<ResourceGroup> => {
  return invoke("resource-group:update", data);
};

export const deleteResourceGroup = async (id: number): Promise<number> => {
  return invoke("resource-group:delete", id);
};

export const getAllResourceGroups = async (): Promise<ResourceGroup[]> => {
  return invoke("resource-group:get-all");
};
