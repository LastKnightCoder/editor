import { createReadStream, createWriteStream } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

export const R2_BUCKET = "tau-release";
export const R2_PUBLIC_BASE_URL = "https://dl.taunote.app";
export const R2_ENV_KEYS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];

const CONTENT_TYPES = [
  [".yml", "text/plain; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".apk", "application/vnd.android.package-archive"],
  [".woff2", "font/woff2"],
  [".txt", "text/plain; charset=utf-8"],
];

export function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

function contentTypeOf(key) {
  return CONTENT_TYPES.find(([ext]) => key.endsWith(ext))?.[1] ?? "application/octet-stream";
}

/** 发布脚本共用的 R2 原语：key 为 bucket 内对象 key，404 统一表现为返回 null */
export function createR2Client({ bucket = R2_BUCKET } = {}) {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${requiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  const isNotFound = error =>
    error?.$metadata?.httpStatusCode === 404 || error?.name === "NoSuchKey";
  const putParams = (key, body, cacheControl) => ({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentTypeOf(key),
    CacheControl: cacheControl,
  });
  return {
    async getText(key) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return await result.Body.transformToString("utf8");
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    async getFile(key, target, maxBytes) {
      if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error("无效的 R2 下载预算");
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if (result.ContentLength > maxBytes) {
          result.Body?.destroy?.();
          throw new Error("R2 文件超过下载预算");
        }
        let bytes = 0;
        const limit = new Transform({
          transform(chunk, _encoding, callback) {
            bytes += chunk.length;
            callback(bytes > maxBytes ? new Error("R2 文件超过下载预算") : null, chunk);
          },
        });
        await pipeline(result.Body, limit, createWriteStream(target, { flags: "wx" }));
        return true;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    },
    async putFile(key, filePath, cacheControl, onProgress) {
      const body = createReadStream(filePath);
      try {
        // 分段使用可重试的缓冲区，避免连接中断后重传整个文件；queueSize>1 让分片并发上传。
        const upload = new Upload({
          client,
          params: putParams(key, body, cacheControl),
          partSize: 8 * 1024 * 1024,
          queueSize: 4,
        });
        if (onProgress) {
          upload.on("httpUploadProgress", ({ loaded, total }) => onProgress(loaded, total));
        }
        await upload.done();
      } finally {
        body.destroy();
      }
    },
    async putText(key, content, cacheControl, { ifNoneMatch } = {}) {
      await client.send(
        new PutObjectCommand({
          ...putParams(key, content, cacheControl),
          IfNoneMatch: ifNoneMatch,
        })
      );
    },
  };
}
