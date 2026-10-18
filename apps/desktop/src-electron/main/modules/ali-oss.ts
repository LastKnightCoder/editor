import OSS from "ali-oss";
import { Module } from "../types/module";
import { ipcMain } from "electron";

const ALI_OSS_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

interface IPutObject {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  objectName: string;
  file: Uint8Array;
}

class AliOss implements Module {
  name: string;
  constructor() {
    this.name = "ali-oss";
  }

  async init() {
    ipcMain.handle("get-bucket-list", async (_event, keyId: string, keySecret: string) => {
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
    });

    ipcMain.handle("put-object", async (_event, putObj: IPutObject) => {
      return await this.putObject(putObj);
    });
  }

  async putObject(putObj: IPutObject): Promise<string> {
    const { accessKeyId, accessKeySecret, bucket, region, objectName, file } = putObj;
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
}

export default new AliOss();
