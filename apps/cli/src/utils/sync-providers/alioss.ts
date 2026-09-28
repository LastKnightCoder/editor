import OSS from "ali-oss";
import type { ISyncProvider } from "./types.js";

export class AliOSSSyncProvider implements ISyncProvider {
  private client: OSS;
  private pathPrefix: string;
  private bucket: string;

  constructor(config: {
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    region: string;
    path?: string;
  }) {
    this.bucket = config.bucket;
    this.pathPrefix = (config.path || "/").replace(/\/$/, "");
    this.client = new OSS({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      bucket: config.bucket,
      region: config.region,
    });
  }

  private getObjectKey(objectName: string): string {
    return `${this.pathPrefix}/${objectName}`.replace(/^\/+/, "");
  }

  async createFileIfAbsent(objectName: string, content: Uint8Array): Promise<boolean> {
    const versioning = await (
      this.client as OSS & {
        getBucketVersioning(bucket: string): Promise<{ versionStatus?: string }>;
      }
    ).getBucketVersioning(this.bucket);
    if (versioning.versionStatus === "Enabled" || versioning.versionStatus === "Suspended")
      throw new Error("此 OSS 桶启用了版本控制，无法保证原子防覆盖；请使用未启用版本控制的同步桶");
    await this.client.put(this.getObjectKey(objectName), Buffer.from(content), {
      headers: { "x-oss-forbid-overwrite": "true" },
    });
    return true;
  }

  async uploadFile(objectName: string, content: Uint8Array): Promise<boolean> {
    const key = this.getObjectKey(objectName);
    const result = await this.client.put(key, Buffer.from(content));
    return result.res.status === 200;
  }

  async downloadFile(objectName: string): Promise<Uint8Array> {
    const key = this.getObjectKey(objectName);
    const result = await this.client.get(key);
    return new Uint8Array(result.content as Buffer);
  }

  async fileExists(objectName: string): Promise<boolean> {
    try {
      const key = this.getObjectKey(objectName);
      await this.client.head(key);
      return true;
    } catch (error) {
      if ((error as { status?: number }).status === 404) return false;
      throw error;
    }
  }

  getProviderName(): string {
    return "AliOSS";
  }
}
