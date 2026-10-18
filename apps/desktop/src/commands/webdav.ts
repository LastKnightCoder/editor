import { invoke } from "@/electron";

interface IWebDavUpload {
  url: string;
  username: string;
  password: string;
  remotePath: string;
  file: Uint8Array;
  contentType?: string;
}

interface IWebDavDownload {
  url: string;
  username: string;
  password: string;
  remotePath: string;
}

export const webdavUpload = async (uploadInfo: IWebDavUpload): Promise<string> => {
  return invoke("webdav-upload", uploadInfo);
};

export const webdavDownload = async (downloadInfo: IWebDavDownload): Promise<Uint8Array> => {
  return invoke("webdav-download", downloadInfo);
};
