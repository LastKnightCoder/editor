export interface WebNote {
  id: number;
  projectItemId: number;
  contentId: number;
  title: string;
  createTime: number;
  updateTime: number;
}

export interface CreateWebNotePayload {
  projectItemId: number;
  contentId: number;
  title: string;
}

export interface UpdateWebNotePayload {
  id: number;
  title?: string;
}
