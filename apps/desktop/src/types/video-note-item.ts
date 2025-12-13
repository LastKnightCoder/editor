export interface VideoNoteItem {
  id: number;
  videoNoteId: number;
  contentId: number;
  title: string;
  createTime: number;
  updateTime: number;
}

export interface CreateVideoNoteItemPayload {
  videoNoteId: number;
  contentId: number;
  title?: string;
}

export interface UpdateVideoNoteItemPayload {
  id: number;
  title?: string;
}
