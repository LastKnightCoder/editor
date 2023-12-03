import Oss from 'ali-oss'
import { invoke } from '@tauri-apps/api';

export const getBucketList = async (keyId: string, keySecret: string): Promise<Array<{
  bucket: string;
  region: string;
}>> => {
  return await invoke('get_ali_oss_buckets', {
    keyId,
    keySecret,
  })
}

interface IPutObject {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  objectName: string;
  file: File;
}

export const putObject = async (putObj: IPutObject): Promise<string> => {
  const { accessKeyId, accessKeySecret, bucket, region, objectName, file } = putObj;
  const oss = new Oss({
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
  });
  const result = await oss.put(objectName, file);
  return result.url;
}
