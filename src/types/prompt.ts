export interface Prompt {
  id: number;
  name: string;
  tags: string[];
  content: string;
  createTime: number;
  updateTime: number;
}

export interface CreatePromptPayload {
  name: string;
  tags?: string[];
  content: string;
}

export interface UpdatePromptPayload {
  id: number;
  name?: string;
  tags?: string[];
  content?: string;
}
