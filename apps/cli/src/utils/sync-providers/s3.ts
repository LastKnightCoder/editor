import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import type { ISyncProvider } from "./types.js";

export class S3SyncProvider implements ISyncProvider {
  private client: S3Client;
  private bucket: string;
  private pathPrefix: string;

  constructor(config: {
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    region: string;
    endpoint?: string;
    urlStyle?: string;
    pathPrefix?: string;
  }) {
    this.bucket = config.bucket;
    this.pathPrefix = (config.pathPrefix || "").replace(/^\/+|\/+$/g, "");
    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(config.endpoint && { endpoint: config.endpoint }),
      ...(config.urlStyle === "path" && { forcePathStyle: true }),
    });
  }

  private getObjectKey(objectName: string): string {
    return this.pathPrefix ? `${this.pathPrefix}/${objectName}` : objectName;
  }

  async createFileIfAbsent(objectName: string, content: Uint8Array): Promise<boolean> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.getObjectKey(objectName),
        Body: content,
        IfNoneMatch: "*",
      })
    );
    return true;
  }

  async uploadFile(objectName: string, content: Uint8Array): Promise<boolean> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.getObjectKey(objectName),
      Body: content,
    });
    await this.client.send(command);
    return true;
  }

  async downloadFile(objectName: string): Promise<Uint8Array> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.getObjectKey(objectName),
    });
    const response = await this.client.send(command);
    const body = await response.Body?.transformToByteArray();
    if (!body) throw new Error("Empty response body");
    return body;
  }

  async fileExists(objectName: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: this.getObjectKey(objectName),
      });
      await this.client.send(command);
      return true;
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
        return false;
      throw error;
    }
  }

  getProviderName(): string {
    return "S3";
  }
}
