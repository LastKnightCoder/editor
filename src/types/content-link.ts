export type ContentLinkSourceType =
  | "project_item"
  | "card"
  | "article"
  | "document";
export type ContentLinkTargetType = "web_clip";

export interface ContentLink {
  id: number;
  sourceId: number;
  sourceType: ContentLinkSourceType;
  targetId: number;
  targetType: ContentLinkTargetType;
  createTime: number;
}

export interface CreateContentLinkPayload {
  sourceId: number;
  sourceType: ContentLinkSourceType;
  targetId: number;
  targetType: ContentLinkTargetType;
}

export interface QueryContentLinkPayload {
  sourceId: number;
  sourceType: ContentLinkSourceType;
  targetType?: ContentLinkTargetType;
}
