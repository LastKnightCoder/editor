/** 设置页「笔记元信息」进度（content-ai:status） */
export interface ContentAiStatus {
  /** 功能槽已配置且模型仍存在 */
  configured: boolean;
  /** 正在处理一轮 */
  running: boolean;
  /** 范围内有正文的卡片、文章、项目文档（按正文去重） */
  total: number;
  /** 已有元信息的 */
  processed: number;
}
