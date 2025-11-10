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
  createTime: number;
  updateTime: number;
}

export interface ICreateResource {
  name: string;
  path: string;
  type: ResourceType;
  source: IResourceSource;
}
