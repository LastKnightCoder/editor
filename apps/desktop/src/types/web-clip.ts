export interface WebClip {
  id: number;
  contentId: number;
  url: string;
  title: string;
  createTime: number;
  updateTime: number;
}

export interface CreateWebClipPayload {
  contentId: number;
  url: string;
  title: string;
}

export interface UpdateWebClipPayload {
  id: number;
  contentId?: number;
  url?: string;
  title?: string;
}
