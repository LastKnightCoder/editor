// 同步提供者统一接口
export interface IRemoteFileInfo {
  name: string;
  path: string;
  size: number;
  lastModified?: number;
  hash?: string;
}

export interface ISyncProvider {
  /** 宿主任务结束后释放任务登记；不是插件作者协议。 */
  dispose?(): Promise<void>;
  createFileIfAbsent(objectName: string, content: Uint8Array): Promise<boolean>;
  // 上传文件
  uploadFile(objectName: string, content: Uint8Array): Promise<boolean>;

  downloadFile(objectName: string): Promise<Uint8Array>;

  fileExists(objectName: string): Promise<boolean>;

  // 列出远程文件
  listFiles(prefix?: string): Promise<IRemoteFileInfo[]>;

  deleteFile(objectName: string): Promise<boolean>;

  getProviderName(): string;
}

// 同步结果
export interface ISyncResult {
  success: boolean;
  message?: string;
}
