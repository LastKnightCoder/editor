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

interface IGetObject {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  objectName: string;
}

export const getObject = async (objInfo: IGetObject) => {
  const { accessKeyId, accessKeySecret, bucket, region, objectName } = objInfo;
  const oss = new Oss({
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
  });
  return await oss.get(objectName);
}

export const isObjectExist = async (objInfo: IGetObject) => {
  const { accessKeyId, accessKeySecret, bucket, region, objectName } = objInfo;
  const oss = new Oss({
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
  });
  try {
    await oss.head(objectName);
    return true;
  } catch (e) {
    return false;
  }
}

export const updateObject = async (objInfo: IGetObject, content: Blob) => {
  const { accessKeyId, accessKeySecret, bucket, region, objectName } = objInfo;
  const oss = new Oss({
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
  return await oss.put(objectName, content, { headers });
}

export const createObject = async (objInfo: IGetObject, content: Blob) => {
  const { accessKeyId, accessKeySecret, bucket, region, objectName } = objInfo;
  const oss = new Oss({
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
  return await oss.put(objectName, content, { headers });
}
