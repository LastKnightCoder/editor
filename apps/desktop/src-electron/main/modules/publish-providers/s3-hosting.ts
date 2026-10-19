import { IPublishProvider, IS3HostingConfig } from "./types";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import log from "electron-log";
import { lookup } from "mime-types";

/**
 * S3 静态托管发布提供者
 */
export class S3HostingProvider implements IPublishProvider {
  readonly name = "S3 Hosting";
  private client: S3Client;
  private config: IS3HostingConfig;

  constructor(config: IS3HostingConfig) {
    this.config = config;

    const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    };

    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
      clientConfig.forcePathStyle = config.urlStyle === "path";
    }

    this.client = new S3Client(clientConfig);
  }

  /**
   * 获取完整的对象键（包含前缀）
   */
  private getFullKey(path: string): string {
    const prefix = this.config.pathPrefix || "";
    if (!prefix) {
      return path;
    }
    const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
    return `${normalizedPrefix}${normalizedPath}`;
  }

  /**
   * 获取文件的 MIME 类型
   */
  private getContentType(path: string): string {
    const mimeType = lookup(path);
    return mimeType || "application/octet-stream";
  }

  async uploadFile(path: string, content: Buffer): Promise<void> {
    const key = this.getFullKey(path);
    const contentType = this.getContentType(path);

    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: content,
      ContentType: contentType,
      // 只有协议保证的摘要资源使用不可变缓存，模板普通资产允许原路径更新。
      CacheControl:
        /^(?:data\/.*[./][a-f0-9]{64}\.(?:json|css)|_tau\/client\/[a-f0-9]{64}\/|plugin-assets\/[^/]+\/[^/]+\/[a-f0-9]{64}\/)/.test(
          path
        )
          ? "public, max-age=31536000, immutable"
          : "no-cache, must-revalidate",
    });

    try {
      await this.client.send(command);
      log.info(`Uploaded ${path} to S3`);
    } catch (error) {
      log.error(`Failed to upload ${path} to S3:`, error);
      throw error;
    }
  }

  async deleteFile(path: string): Promise<void> {
    const key = this.getFullKey(path);

    const command = new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    });

    try {
      await this.client.send(command);
      log.info(`Deleted ${path} from S3`);
    } catch (error) {
      log.error(`Failed to delete ${path} from S3:`, error);
      throw error;
    }
  }

  async listFiles(prefix = ""): Promise<string[]> {
    const fullPrefix = this.getFullKey(prefix);
    const files: string[] = [];
    let continuationToken: string | undefined;

    try {
      do {
        const command = new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: fullPrefix,
          ContinuationToken: continuationToken,
        });

        const response = await this.client.send(command);

        if (response.Contents) {
          for (const obj of response.Contents) {
            if (obj.Key) {
              // 移除前缀，返回相对路径
              const pathPrefix = this.config.pathPrefix || "";
              let relativePath = obj.Key;
              if (pathPrefix && obj.Key.startsWith(pathPrefix)) {
                relativePath = obj.Key.slice(pathPrefix.length);
                if (relativePath.startsWith("/")) {
                  relativePath = relativePath.slice(1);
                }
              }
              files.push(relativePath);
            }
          }
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      return files;
    } catch (error) {
      log.error(`Failed to list files from S3:`, error);
      throw error;
    }
  }

  async checkConnection(): Promise<boolean> {
    try {
      const command = new HeadBucketCommand({
        Bucket: this.config.bucket,
      });
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }
}
