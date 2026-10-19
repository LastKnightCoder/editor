import type { ResolvedVideo, VideoPlaybackSource, VideoRef } from "@tau/plugins";

/** 在线视频提供方请求：主窗口渲染宿主按当前设置创建插件实例后执行。 */
export type VideoRendererRequest =
  /** 返回识别该链接的提供方 ID；指定 pluginId 时只检查该提供方。 */
  | { kind: "match"; url: string; pluginId?: string }
  | { kind: "resolve"; pluginId: string; url: string }
  | { kind: "cacheKey"; pluginId: string; ref: VideoRef }
  | { kind: "playback"; pluginId: string; ref: VideoRef };

export interface VideoRendererResults {
  match: string | null;
  resolve: ResolvedVideo;
  cacheKey: string;
  playback: VideoPlaybackSource;
}

export interface VideoProviderInfo {
  id: string;
  name: string;
}

/** ready 为 false 时主窗口插件尚未完成首次激活，缺少提供方不代表未安装。 */
export interface VideoProvidersState {
  ready: boolean;
  providers: VideoProviderInfo[];
}

export interface VideoRendererMessage {
  requestId: string;
  hostSession: string;
  request: VideoRendererRequest;
}

export interface VideoRendererReply {
  requestId: string;
  hostSession: string;
  result?: unknown;
  error?: string;
  errorName?: string;
}

/** 在线视频缓存进度，音视频分流下载时分别给出两路字节数。 */
export interface OnlineVideoCacheProgress {
  requestId: string;
  stage: "downloading" | "merging" | "completed";
  message?: string;
  percent?: number;
  downloaded?: number;
  total?: number;
  videoDownloaded?: number;
  videoTotal?: number;
  audioDownloaded?: number;
  audioTotal?: number;
}

export interface OnlineVideoCacheResult {
  localPath: string;
  fileSize: number;
  cached: boolean;
}
