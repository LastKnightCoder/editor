import OSS from "ali-oss";
import type { ISyncProvider } from "./types.js";

export class AliOSSSyncProvider implements ISyncProvider {
  private client: OSS;
  private pathPrefix: string;

  constructor(config: {
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    region: string;
    path?: string;
  }) {
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
    } catch {
      return false;
    }
  }

  getProviderName(): string {
    return "AliOSS";
  }
}
