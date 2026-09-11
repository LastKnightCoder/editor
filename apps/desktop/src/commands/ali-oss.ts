import { invoke } from "@/electron";
import { IRemoteFileInfo } from "@/types";

export const getBucketList = async (
  keyId: string,
  keySecret: string
): Promise<
  Array<{
    bucket: string;
    region: string;
  }>
> => {
  return await invoke("get-bucket-list", keyId, keySecret);
};

interface IPutObject {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  objectName: string;
  file: Uint8Array;
}

export const putObject = async (putObj: IPutObject): Promise<string> => {
  return invoke("put-object", putObj);
};

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

export const getObject = async (objInfo: IGetObject) => {
  return invoke<{ content: Uint8Array }>("get-object", objInfo);
};

export const isObjectExist = async (objInfo: IGetObject) => {
  return invoke<boolean>("is-object-exist", objInfo);
};

export const updateObject = async (objInfo: IGetObject, content: Uint8Array) => {
  return invoke("update-object", objInfo, content);
};

export const createObject = async (objInfo: IGetObject, content: Uint8Array) => {
  return invoke("create-object", objInfo, content);
};

export const deleteObject = async (objInfo: IGetObject) => {
  return invoke("delete-object", objInfo);
};

export const listObjects = async (listParams: IListObjects): Promise<IRemoteFileInfo[]> => {
  return invoke("list-objects", listParams);
};
