import type { Disposable, JsonValue } from "./contract";

/**
 * 插件私有的视频引用，宿主原样写入文档与数据库；必须可长期保存，不放会过期的直链。
 * 宿主在元数据中占用 type / title / thumbnail 三个键，引用不得使用。
 */
export type VideoRef = { readonly [key: string]: JsonValue };

export interface VideoStream {
  url: string;
  /** 宿主下载时附带的请求头（如 Referer、Cookie），不写入文档或缓存索引。 */
  headers?: Record<string, string>;
}

/** 播放源描述：插件只说明流在哪里，下载、合并、缓存与播放由宿主完成。 */
export type VideoPlaybackSource =
  | { kind: "file"; stream: VideoStream }
  | { kind: "split"; video: VideoStream; audio: VideoStream }
  | {
      kind: "extract";
      /** 交给宿主视频解析服务的页面地址。 */
      url: string;
      videoFormat?: string;
      audioFormat?: string;
      proxy?: string;
    };

export interface VideoVariant {
  label: string;
  hint?: string;
  ref: VideoRef;
}

export interface ResolvedVideo {
  title: string;
  cover?: string;
  /** 可选清晰度等变体，至少一项；用户选中项的 ref 被保存。 */
  variants: readonly VideoVariant[];
  defaultVariant?: number;
}

export interface VideoInstance {
  /** 同步识别链接是否属于本提供方，不发网络请求。 */
  matches(url: string): boolean;
  resolve(url: string, signal: AbortSignal): Promise<ResolvedVideo>;
  /** 稳定的缓存身份（应包含清晰度）；已缓存时宿主不再调用 getPlayback。 */
  cacheKey(ref: VideoRef): string;
  getPlayback(ref: VideoRef, signal: AbortSignal): Promise<VideoPlaybackSource>;
}

export interface VideoProviderDefinition {
  id: string;
  name: string;
  /** 按当前插件配置同步创建实例，不发网络请求。 */
  create(config: JsonValue): VideoInstance;
}

export interface PluginVideo {
  register(definition: VideoProviderDefinition): Disposable;
}
