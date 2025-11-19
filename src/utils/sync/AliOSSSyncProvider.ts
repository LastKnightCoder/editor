import { ISyncProvider } from "@/types/sync";
import {
  isObjectExist,
  getObject,
  createObject,
  updateObject,
  deleteObject,
} from "@/commands";

export interface IAliOSSConfig {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  path: string;
}

export class AliOSSSyncProvider implements ISyncProvider {
  private config: IAliOSSConfig;

  constructor(config: IAliOSSConfig) {
    this.config = config;
  }

  getProviderName(): string {
    return "AliOSS";
  }

  async uploadFile(objectName: string, content: Uint8Array): Promise<boolean> {
    try {
      const fullPath = `${this.config.path}/${objectName}`;
      const ossOptions = {
        accessKeyId: this.config.accessKeyId,
        accessKeySecret: this.config.accessKeySecret,
        bucket: this.config.bucket,
        region: this.config.region,
        objectName: fullPath,
      };

      const exists = await this.fileExists(objectName);

      if (exists) {
        await updateObject(ossOptions, content);
      } else {
        await createObject(ossOptions, content);
      }

      return true;
    } catch (e) {
      console.error("AliOSS 上传失败:", e);
      return false;
    }
  }

  async downloadFile(objectName: string): Promise<Uint8Array> {
    try {
      const fullPath = `${this.config.path}/${objectName}`;
      const result = await getObject({
        accessKeyId: this.config.accessKeyId,
        accessKeySecret: this.config.accessKeySecret,
        bucket: this.config.bucket,
        region: this.config.region,
        objectName: fullPath,
      });

      const blob = new Blob([result.content]);
      return new Uint8Array(await blob.arrayBuffer());
    } catch (e) {
      console.error("AliOSS 下载失败:", e);
      throw e;
    }
  }

  async fileExists(objectName: string): Promise<boolean> {
    try {
      const fullPath = `${this.config.path}/${objectName}`;
      return await isObjectExist({
        accessKeyId: this.config.accessKeyId,
        accessKeySecret: this.config.accessKeySecret,
        bucket: this.config.bucket,
        region: this.config.region,
        objectName: fullPath,
      });
    } catch (e) {
      console.error("AliOSS 检查文件存在失败:", e);
      return false;
    }
  }

  async deleteFile(objectName: string): Promise<boolean> {
    try {
      const fullPath = `${this.config.path}/${objectName}`;
      await deleteObject({
        accessKeyId: this.config.accessKeyId,
        accessKeySecret: this.config.accessKeySecret,
        bucket: this.config.bucket,
        region: this.config.region,
        objectName: fullPath,
      });
      return true;
    } catch (e) {
      console.error("AliOSS 删除文件失败:", e);
      return false;
    }
  }
}
