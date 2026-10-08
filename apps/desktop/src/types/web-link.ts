import type { WebLinkSourceType } from "@tau/shared/media-types";
export type { WebLinkSourceType } from "@tau/shared/media-types";

export interface WebLink {
  id: number;
  title: string;
  url: string;
  sourceType: WebLinkSourceType;
  createTime: number;
  updateTime: number;
}

export interface CreateWebLinkPayload {
  title: string;
  url: string;
  sourceType: WebLinkSourceType;
}

export interface UpdateWebLinkPayload {
  id: number;
  title?: string;
  url?: string;
  sourceType?: WebLinkSourceType;
}
