import OSS from 'ali-oss';
import { Module } from "../types/module";
import { ipcMain } from 'electron';

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
      console.log(data);
      return data;
    })
  }
}

export default new AliOss();