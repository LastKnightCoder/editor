import { ipcMain } from "electron";
import { S3Client, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Module } from "../types/module";
import { basename } from "node:path";

interface IS3Upload {
  ifNoneMatch?: "*";
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  endpoint?: string;
  urlStyle?: "path" | "virtualHosted";
  key: string;
  file: Uint8Array;
  contentType?: string;
}

interface IS3ListObjects {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  endpoint?: string;
  urlStyle?: "path" | "virtualHosted";
  prefix?: string;
}

class S3Module implements Module {
  name: string;

  constructor() {
    this.name = "s3";
  }

  async init() {
    ipcMain.handle("s3-upload", async (_event, uploadInfo: IS3Upload) => {
      return await this.upload(uploadInfo);
    });

    ipcMain.handle("s3-list-objects", async (_event, listInfo: IS3ListObjects) => {
      return await this.listObjects(listInfo);
    });
  }

  async upload(uploadInfo: IS3Upload): Promise<string> {
    const {
      accessKeyId,
      secretAccessKey,
      bucket,
      region,
      endpoint,
      urlStyle,
      key,
      file,
      contentType,
    } = uploadInfo;

    try {
      const s3Client = new S3Client({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        ...(endpoint && { endpoint }),
        forcePathStyle: urlStyle === "path",
      });

      const command = new PutObjectCommand({
        IfNoneMatch: uploadInfo.ifNoneMatch,
        Bucket: bucket,
        Key: key,
        Body: Buffer.from(file),
        ContentType: contentType,
      });

      await s3Client.send(command);

      // 构建文件 URL
      const endpointUrl = endpoint || `https://s3.${region}.amazonaws.com`;
      const baseUrl = endpointUrl.replace(/\/$/, "");
      if (urlStyle === "virtualHosted") {
        // 虚拟托管风格: https://bucket.endpoint/key
        if (endpoint) {
          // 如果是自定义 endpoint，假设它是 host
          // 需要判断 endpoint 是否包含 protocol
          const url = new URL(endpoint);
          return `${url.protocol}//${bucket}.${url.host}/${key}`;
        } else {
          // AWS standard
          return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
        }
      }
      return `${baseUrl}/${bucket}/${key}`;
    } catch (error) {
      console.error("S3 上传失败:", error);
      throw error;
    }
  }

  async listObjects(listInfo: IS3ListObjects) {
    const { accessKeyId, secretAccessKey, bucket, region, endpoint, urlStyle, prefix } = listInfo;

    const s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      ...(endpoint && { endpoint }),
      forcePathStyle: urlStyle === "path",
    });

    const normalizedPrefix = prefix ? prefix.replace(/^\/+/, "").replace(/\/+/g, "/") : undefined;

    const files: Array<{
      name: string;
      path: string;
      size: number;
      lastModified?: number;
    }> = [];

    try {
      let continuationToken: string | undefined;
      do {
        const command = new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: normalizedPrefix,
          ContinuationToken: continuationToken,
        });

        const res = await s3Client.send(command);
        (res.Contents || []).forEach(obj => {
          if (!obj.Key || obj.Key.endsWith("/")) return;
          files.push({
            name: basename(obj.Key),
            path: obj.Key,
            size: Number(obj.Size || 0),
            lastModified: obj.LastModified ? new Date(obj.LastModified).getTime() : undefined,
          });
        });

        continuationToken = res.IsTruncated ? res.NextContinuationToken || undefined : undefined;
      } while (continuationToken);

      return files;
    } catch (error) {
      console.error("S3 列举对象失败:", error);
      throw error;
    }
  }
}

export default new S3Module();
