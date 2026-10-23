import { isCollaborationResource } from "@tau/collaboration";
import { getHomeDir } from "@/commands";
import { addRemoteImageCacheEntry } from "@/commands/remote-image-cache";
import { addRemoteVideoCacheEntry } from "@/commands/remote-video-cache";
import { addRemoteAudioCacheEntry } from "@/commands/remote-audio-cache";
import { remoteResourceToLocal } from "@/utils";
import { getCachedRemoteResource } from "@/utils/resouce";
import { isLikelyVideoSource } from "@/utils/video";
import {
  isDirectMediaUrl,
  resolveLocalMediaPath,
  toLocalMediaPreviewUrl,
  type LocalMediaPreviewMethod,
} from "@/utils/localMediaPath";

export type MediaSourceKind = "image" | "video" | "audio" | "file";

export interface MediaSourceRequest {
  kind: MediaSourceKind;
  /** 远程地址是否落地缓存（图片、音频取设置，视频始终缓存，文件不缓存） */
  autoCacheRemote: boolean;
  /** 写入远程缓存条目的标题 */
  title?: string;
  /** 协作资源的作用域解析；不传时协作资源按普通地址处理（由外层插槽先行解析） */
  resolveCollaborationResource?: (url: string) => Promise<string>;
}

export interface MediaSource {
  /** 可直接交给媒体元素的地址 */
  url: string;
  method: "direct" | "remote" | LocalMediaPreviewMethod;
  /** 本地文件路径（音频波形经 IPC 读文件） */
  localPath?: string;
  /** 远程音频未命中缓存：先播放远程地址，后台缓存完成后得到本地路径，失败为 undefined */
  pendingLocalPath?: Promise<string | undefined>;
  /** 解析出错后回退到原地址，调用方不应缓存该结果 */
  failed?: true;
}

const remote = (url: string): MediaSource => ({ url, method: "remote" });
const fallback = (url: string): MediaSource => ({ url, method: "remote", failed: true });

async function fromLocalPath(path: string): Promise<MediaSource> {
  const absolutePath = path.startsWith("~") ? `${await getHomeDir()}${path.slice(1)}` : path;
  const { url, method } = await toLocalMediaPreviewUrl(absolutePath);
  return { url, method, localPath: absolutePath };
}

async function cacheRemoteImage(url: string, title?: string) {
  const localPath = await remoteResourceToLocal(url);
  await addRemoteImageCacheEntry({ url, localPath, title });
  return localPath;
}

async function cacheRemoteVideo(source: string, url: string, title?: string) {
  const localPath = await remoteResourceToLocal(url);
  if (source.startsWith("http") && isLikelyVideoSource(source)) {
    try {
      await addRemoteVideoCacheEntry({ url: source, localPath, title });
    } catch (error) {
      console.error("记录远程视频缓存失败:", error);
    }
  }
  return localPath;
}

async function cacheRemoteAudio(url: string) {
  const localPath = await remoteResourceToLocal(url);
  await addRemoteAudioCacheEntry({ url, localPath });
  return localPath;
}

async function resolveRemote(
  source: string,
  url: string,
  request: MediaSourceRequest
): Promise<MediaSource> {
  try {
    switch (request.kind) {
      case "image":
        if (!request.autoCacheRemote) return remote(url);
        return await fromLocalPath(await cacheRemoteImage(url, request.title));
      case "video":
        return await fromLocalPath(await cacheRemoteVideo(source, url, request.title));
      case "audio": {
        if (!request.autoCacheRemote) return remote(url);
        const cached = await getCachedRemoteResource(url);
        if (cached) return await fromLocalPath(cached);
        // 大文件整段下载要等很久，先流式播放远程地址，缓存完成后供波形读取、下次直接走本地
        const pendingLocalPath = cacheRemoteAudio(url).catch(error => {
          console.error("[LocalAudio] 后台缓存失败", error);
          return undefined;
        });
        return { ...remote(url), pendingLocalPath };
      }
      case "file":
        return remote(url);
    }
  } catch (error) {
    console.error(error);
    return fallback(url);
  }
}

/**
 * 把文档里的媒体引用解析为可加载的地址：协作资源走作用域解析；
 * 本地相对路径、`~`、绝对路径转预览地址；远程地址按类型的缓存策略落地。
 * 协作资源解析失败会抛出，其余失败回退到原地址。
 */
export async function resolveMediaSource(
  source: string,
  request: MediaSourceRequest
): Promise<MediaSource | undefined> {
  if (!source) return undefined;
  if (request.resolveCollaborationResource && isCollaborationResource(source)) {
    return await fromLocalPath(await request.resolveCollaborationResource(source));
  }
  try {
    const resolved = await resolveLocalMediaPath(source);
    if (isDirectMediaUrl(resolved)) return { url: resolved, method: "direct" };
    if (resolved.startsWith("http")) return await resolveRemote(source, resolved, request);
    return await fromLocalPath(resolved);
  } catch (error) {
    console.error(error);
    return fallback(source);
  }
}

/**
 * 图片解析结果缓存（请求 → 地址）。
 * 解析是异步的（路径换算、远程图落地缓存），不缓存的话每次挂载都会先空一帧再出图，列表重进时整片闪烁。
 */
const PREVIEW_CACHE_LIMIT = 500;
const previewCache = new Map<string, string>();

export const imagePreviewCacheKey = (url: string, autoCacheRemote: boolean) =>
  `${autoCacheRemote ? 1 : 0}|${url}`;

export const imagePreviewCache = {
  get: (key: string) => previewCache.get(key),
  has: (key: string) => previewCache.has(key),
  set(key: string, value: string) {
    previewCache.delete(key);
    previewCache.set(key, value);
    if (previewCache.size > PREVIEW_CACHE_LIMIT) {
      previewCache.delete(previewCache.keys().next().value!);
    }
  },
  delete: (key: string) => previewCache.delete(key),
};
