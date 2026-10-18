export interface ISyncProvider {
  dispose?(): Promise<void>;
  createFileIfAbsent(objectName: string, content: Uint8Array): Promise<boolean>;
  uploadFile(objectName: string, content: Uint8Array): Promise<boolean>;
  downloadFile(objectName: string): Promise<Uint8Array>;
  fileExists(objectName: string): Promise<boolean>;
  getProviderName(): string;
}

export interface IDatabaseInfo {
  databaseObject?: string;
  sessionsObject?: string;
  version: number;
  dataModelVersion?: number;
  [key: string]: unknown;
}
