export interface ISyncProvider {
  uploadFile(objectName: string, content: Uint8Array): Promise<boolean>;
  downloadFile(objectName: string): Promise<Uint8Array>;
  fileExists(objectName: string): Promise<boolean>;
  getProviderName(): string;
}

export interface IDatabaseInfo {
  version: number;
  [key: string]: unknown;
}
