import { ipcMain } from "electron";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Module } from "../types/module";

interface IS3Upload {
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

class S3Module implements Module {
  name: string;

  constructor() {
    this.name = "s3";
  }

  async init() {
    ipcMain.handle("s3-upload", async (_event, uploadInfo: IS3Upload) => {
      return await this.upload(uploadInfo);
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
}

export default new S3Module();
