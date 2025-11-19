// 同步提供者统一接口
export interface ISyncProvider {
  // 上传文件
  uploadFile(objectName: string, content: Uint8Array): Promise<boolean>;

  // 下载文件
  downloadFile(objectName: string): Promise<Uint8Array>;

  // 检查文件是否存在
  fileExists(objectName: string): Promise<boolean>;

  // 删除文件
  deleteFile(objectName: string): Promise<boolean>;

  // 获取提供者名称
  getProviderName(): string;
}

// 数据库信息类型
export interface IDatabaseInfo {
  version: number;
  [key: string]: unknown;
}

// 同步结果
export interface ISyncResult {
  success: boolean;
  message?: string;
}
