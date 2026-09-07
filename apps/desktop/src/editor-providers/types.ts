/**
 * 视频流式下载进度（bilibili / youtube / remote 共用的宽松形状，字段按需可选）
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
