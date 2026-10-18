import { invoke } from "@/electron";

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
