/** 共享状态查询键：画布的共享入口与文档客户端挂接远端同步共用一份缓存。 */
export const whiteboardShareStatusKey = (databaseName: string, documentId: string) =>
  ["whiteboard-share", databaseName, documentId] as const;
