import OSS from "ali-oss";
import { Module } from "../types/module";
import { ipcMain } from "electron";
import { basename } from "node:path";

const ALI_OSS_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;
const ALI_OSS_DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

interface IPutObject {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  objectName: string;
  file: Uint8Array;
}

interface IGetObject {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  objectName: string;
}

interface IListObjects {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  prefix?: string;
}

class AliOss implements Module {
  name: string;
  constructor() {
    this.name = "ali-oss";
  }

  async init() {
    ipcMain.handle(
      "get-bucket-list",
      async (_event, keyId: string, keySecret: string) => {
        const client = new OSS({
          accessKeyId: keyId,
          accessKeySecret: keySecret,
        });
        // @ts-ignore
        const res: any = await client.listBuckets();
        const data = res.buckets.map((item: any) => ({
          bucket: item.name,
          region: item.region,
        }));
        return data;
      },
    );

    ipcMain.handle("put-object", async (_event, putObj: IPutObject) => {
      return await this.putObject(putObj);
    });

    ipcMain.handle("get-object", async (_event, objInfo: IGetObject) => {
      return await this.getObject(objInfo);
    });

    ipcMain.handle("is-object-exist", async (_event, objInfo: IGetObject) => {
      return await this.isObjectExist(objInfo);
    });

    ipcMain.handle(
      "update-object",
      async (_event, objInfo: IGetObject, content: Uint8Array) => {
        return await this.updateObject(objInfo, content);
      },
    );

    ipcMain.handle(
      "create-object",
      async (_event, objInfo: IGetObject, content: Uint8Array) => {
        return await this.createObject(objInfo, content);
      },
    );

    ipcMain.handle("delete-object", async (_event, objInfo: IGetObject) => {
      return await this.deleteObject(objInfo);
    });

    ipcMain.handle("list-objects", async (_event, listParams: IListObjects) => {
      return await this.listObjects(listParams);
    });
  }

  async putObject(putObj: IPutObject): Promise<string> {
    const { accessKeyId, accessKeySecret, bucket, region, objectName, file } =
      putObj;
    const oss = new OSS({
      accessKeyId,
      accessKeySecret,
      bucket,
      region,
    });
    const result = await oss.put(objectName, Buffer.from(file), {
      timeout: ALI_OSS_UPLOAD_TIMEOUT_MS,
    });
    return result.url;
  }

  async getObject(objInfo: IGetObject) {
    const { accessKeyId, accessKeySecret, bucket, region, objectName } =
      objInfo;
    const oss = new OSS({
      accessKeyId,
      accessKeySecret,
      bucket,
      region,
    });
    return await oss.get(objectName, {
      timeout: ALI_OSS_DOWNLOAD_TIMEOUT_MS,
    });
  }

  async isObjectExist(objInfo: IGetObject) {
    const { accessKeyId, accessKeySecret, bucket, region, objectName } =
      objInfo;
    const oss = new OSS({
      accessKeyId,
      accessKeySecret,
      bucket,
      region,
    });
    try {
      await oss.head(objectName);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  async updateObject(objInfo: IGetObject, content: Uint8Array) {
    const { accessKeyId, accessKeySecret, bucket, region, objectName } =
      objInfo;
    const oss = new OSS({
      accessKeyId,
      accessKeySecret,
      bucket,
      region,
    });
    const headers = {
      "x-oss-storage-class": "Standard",
      "x-oss-object-acl": "private",
      "x-oss-forbid-overwrite": "false",
    };
    return await oss.put(objectName, Buffer.from(content), {
      headers,
      timeout: ALI_OSS_UPLOAD_TIMEOUT_MS,
    });
  }

  async createObject(objInfo: IGetObject, content: Uint8Array) {
    const { accessKeyId, accessKeySecret, bucket, region, objectName } =
      objInfo;
    const oss = new OSS({
      accessKeyId,
      accessKeySecret,
      bucket,
      region,
    });
    const headers = {
      "x-oss-storage-class": "Standard",
      "x-oss-object-acl": "private",
      "x-oss-forbid-overwrite": "true",
    };
    return await oss.put(objectName, Buffer.from(content), {
      headers,
      timeout: ALI_OSS_UPLOAD_TIMEOUT_MS,
    });
  }

  async deleteObject(objInfo: IGetObject) {
    const { accessKeyId, accessKeySecret, bucket, region, objectName } =
      objInfo;
    const oss = new OSS({
      accessKeyId,
      accessKeySecret,
      bucket,
      region,
    });
    return await oss.delete(objectName);
  }

  async listObjects(listParams: IListObjects) {
    const { accessKeyId, accessKeySecret, bucket, region, prefix } = listParams;
    const oss = new OSS({
      accessKeyId,
      accessKeySecret,
      bucket,
      region,
    });

    const normalizedPrefix = prefix
      ? prefix.replace(/^\/+/, "").replace(/\/+/g, "/")
      : "";

    const files: Array<{
      name: string;
      path: string;
      size: number;
      lastModified?: number;
    }> = [];

    try {
      let marker: string | undefined;
      do {
        const res = await oss.list(
          {
            prefix: normalizedPrefix || undefined,
            marker,
            "max-keys": 1000,
          },
          {},
        );

        const objects = res.objects || [];
        objects.forEach((obj: any) => {
          if (!obj.name || String(obj.name).endsWith("/")) return;
          files.push({
            name: basename(obj.name),
            path: obj.name,
            size: obj.size || 0,
            lastModified: obj.lastModified
              ? new Date(obj.lastModified).getTime()
              : undefined,
          });
        });

        marker = res.isTruncated ? res.nextMarker : undefined;
      } while (marker);

      return files;
    } catch (error) {
      console.error("AliOSS 列举对象失败:", error);
      throw error;
    }
  }
}

export default new AliOss();
