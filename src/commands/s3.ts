import { invoke } from "@/electron";

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

export const s3Upload = async (uploadInfo: IS3Upload): Promise<string> => {
  return invoke("s3-upload", uploadInfo);
};
