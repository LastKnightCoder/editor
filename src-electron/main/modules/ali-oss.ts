import OSS from 'ali-oss';
import { Module } from "../types/module";
import { ipcMain } from 'electron';

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

class AliOss implements Module {
  name: string;
  constructor() {
    this.name = 'ali-oss';
  }

  async init() {
    ipcMain.handle('get-bucket-list', async (_event, keyId: string, keySecret: string) => {
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

    ipcMain.handle('put-object', async (_event, putObj: IPutObject) => {
      return await this.putObject(putObj);
    });

    ipcMain.handle('get-object', async (_event, objInfo: IGetObject) => {
      return await this.getObject(objInfo);
    });

    ipcMain.handle('is-object-exist', async (_event, objInfo: IGetObject) => {
      return await this.isObjectExist(objInfo);
    });

    ipcMain.handle('update-object', async (_event, objInfo: IGetObject, content: Uint8Array) => {
      return await this.updateObject(objInfo, content);
    });

    ipcMain.handle('create-object', async (_event, objInfo: IGetObject, content: Uint8Array) => {
      return await this.createObject(objInfo, content);
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
    const result = await oss.put(objectName, Buffer.from(file));
    return result.url;
  }

  async getObject(objInfo: IGetObject) {
    const { accessKeyId, accessKeySecret, bucket, region, objectName } = objInfo;
    const oss = new OSS({
      accessKeyId,
      accessKeySecret,
      bucket,
      region,
    });
    return await oss.get(objectName);
  }

  async isObjectExist(objInfo: IGetObject) {
    const { accessKeyId, accessKeySecret, bucket, region, objectName } = objInfo;
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
    const { accessKeyId, accessKeySecret, bucket, region, objectName } = objInfo;
    const oss = new OSS({
      accessKeyId,
      accessKeySecret,
      bucket,
      region,
    });
    const headers = {
      'x-oss-storage-class': 'Standard',
      'x-oss-object-acl': 'private',
      'x-oss-forbid-overwrite': 'false',
    }
    return await oss.put(objectName, Buffer.from(content), { headers });
  }

  async createObject(objInfo: IGetObject, content: Uint8Array) {
    const { accessKeyId, accessKeySecret, bucket, region, objectName } = objInfo;
    const oss = new OSS({
      accessKeyId,
      accessKeySecret,
      bucket,
      region,
    });
    const headers = {
      'x-oss-storage-class': 'Standard',
      'x-oss-object-acl': 'private',
      'x-oss-forbid-overwrite': 'true',
    }
    return await oss.put(objectName, Buffer.from(content), { headers });
  }
}

export default new AliOss();