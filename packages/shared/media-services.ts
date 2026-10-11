import { createServiceId } from "./service-contract.ts";

/** 宿主媒体信息探测能力：解析本地文件的像素尺寸（解码失败返回 null）。 */
export interface MediaInfoService {
  imageInfo(file: File): Promise<{ width: number; height: number } | null>;
  videoInfo(file: File): Promise<{ width: number; height: number } | null>;
}

export const IMediaInfoService = createServiceId<MediaInfoService>("mediaInfoService");

/** 宿主下载能力：将远程资源保存到宿主侧（浏览器下载、另存到本地等）。 */
export interface DownloadService {
  download(url: string): Promise<unknown>;
}

export const IDownloadService = createServiceId<DownloadService>("downloadService");
