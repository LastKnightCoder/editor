export type ResourceType = "image" | "video" | "audio" | "attachment";

export interface IResourceSource {
  type: "content" | "whiteboard" | "podcast";
  id: number;
}

export interface IResource {
  id: number;
  name: string;
  path: string;
  type: ResourceType;
  sources: IResourceSource[];
  refCount: number;
  groupId: number | null;
  createTime: number;
  updateTime: number;
}

export interface ICreateResource {
  name: string;
  path: string;
  type: ResourceType;
  source: IResourceSource;
}

export interface ResourceGroup {
  id: number;
  name: string;
  parentId: number | null;
  orderIndex: number;
  createTime: number;
  updateTime: number;
}

export interface CreateResourceGroup {
  name: string;
  parentId?: number | null;
  orderIndex?: number;
}

export interface UpdateResourceGroup {
  id: number;
  name?: string;
  parentId?: number | null;
  orderIndex?: number;
}
