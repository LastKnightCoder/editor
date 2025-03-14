import { invoke } from "@/electron";

export const getBucketList = async (
  keyId: string,
  keySecret: string,
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
  file: File;
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

export const getObject = async (objInfo: IGetObject) => {
  return invoke("get-object", objInfo);
};

export const isObjectExist = async (objInfo: IGetObject) => {
  return invoke("is-object-exist", objInfo);
};

export const updateObject = async (
  objInfo: IGetObject,
  content: Uint8Array,
) => {
  return invoke("update-object", objInfo, content);
};

export const createObject = async (
  objInfo: IGetObject,
  content: Uint8Array,
) => {
  return invoke("create-object", objInfo, content);
};

export const deleteObject = async (objInfo: IGetObject) => {
  return invoke("delete-object", objInfo);
};
