/**
 * 视频下载进度（视频插件 / 远程直链共用的宽松形状，字段按需可选）
 */
export interface VideoLoaderStreamProgress {
  stage: string;
  message?: string;
  downloaded?: number;
  total?: number;
  processed?: number;
  percent?: number;
  videoDownloaded?: number;
  videoTotal?: number;
  audioDownloaded?: number;
  audioTotal?: number;
}
