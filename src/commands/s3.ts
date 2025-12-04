import { invoke } from "@/electron";
import { IRemoteFileInfo } from "@/types";

interface IS3Upload {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  endpoint?: string;
  urlStyle?: "path" | "virtualHosted";
  key: string;
  file: Uint8Array;
  contentType?: string;
}

interface IS3ListObjects {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  endpoint?: string;
  urlStyle?: "path" | "virtualHosted";
  prefix?: string;
}

export const s3Upload = async (uploadInfo: IS3Upload): Promise<string> => {
  return invoke("s3-upload", uploadInfo);
};

export const s3ListObjects = async (
  listInfo: IS3ListObjects,
): Promise<IRemoteFileInfo[]> => {
  return invoke("s3-list-objects", listInfo);
};
