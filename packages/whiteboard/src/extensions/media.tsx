import { createContext, useContext, type ComponentType } from "react";
import { IResourceService, type ResourceService } from "@tau/shared/host-services";
import {
  IDownloadService,
  IMediaInfoService,
  type MediaInfoService,
} from "@tau/shared/media-services";
import type { PluginContextMenuItem } from "../types";
import type { WhiteboardAPI } from "./api";

/** 媒体插件的宿主能力：由扩展从宿主服务构造，upload/download 缺失时对应入口隐藏 */
export interface MediaCapabilities {
  actions?: readonly string[];
  upload?(file: File): Promise<string | null>;
  download?(url: string): Promise<unknown>;
  imageInfo(file: File): Promise<{ width: number; height: number } | null>;
  videoInfo(file: File): Promise<{ width: number; height: number } | null>;
}

/** 宿主对内置媒体扩展的 UI 配置（菜单动作与图片组件），保留为工厂参数、不进服务 */
export interface MediaExtensionOptions {
  actions?: readonly string[];
  Image?: ComponentType<{
    url: string;
    alt?: string;
    className?: string;
    style?: React.CSSProperties;
    onLoad?: React.ReactEventHandler<HTMLImageElement>;
    onError?: React.ReactEventHandler<HTMLImageElement>;
  }>;
}

const info = (file: File, video: boolean) =>
  new Promise<{ width: number; height: number } | null>(resolve => {
    const url = URL.createObjectURL(file);
    const element = video ? document.createElement("video") : new Image();
    const finish = (value: { width: number; height: number } | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    element.onerror = () => finish(null);
    if (element instanceof HTMLVideoElement)
      element.onloadedmetadata = () =>
        finish({ width: element.videoWidth, height: element.videoHeight });
    else
      element.onload = () => finish({ width: element.naturalWidth, height: element.naturalHeight });
    element.src = url;
  });

/** 浏览器实现的媒体信息探测（objectURL 解码），无宿主 IMediaInfoService 时的兜底 */
export const browserMediaInfo: MediaInfoService = {
  imageInfo: file => info(file, false),
  videoInfo: file => info(file, true),
};

export const MediaExtensionContext = createContext<MediaExtensionOptions>({});
export const useMediaExtension = () => useContext(MediaExtensionContext);

/**
 * 从宿主服务构造媒体插件的运行时能力：
 * upload 按 shared 契约把“空串 / null / 抛错”统一视为失败（空串归一为 null，抛错自然冒泡），
 * 缺失 IMediaInfoService 时退回浏览器实现。
 */
export function mediaCapabilitiesFromServices(
  api: WhiteboardAPI,
  actions?: readonly string[]
): MediaCapabilities {
  const resource = api.tryGetService(IResourceService);
  const mediaInfo = api.tryGetService(IMediaInfoService);
  const download = api.tryGetService(IDownloadService);
  return {
    actions,
    upload: resource ? (file: File) => normalizeUpload(resource, file) : undefined,
    download: download ? (url: string) => download.download(url) : undefined,
    imageInfo: mediaInfo?.imageInfo.bind(mediaInfo) ?? browserMediaInfo.imageInfo,
    videoInfo: mediaInfo?.videoInfo.bind(mediaInfo) ?? browserMediaInfo.videoInfo,
  };
}

async function normalizeUpload(resource: ResourceService, file: File): Promise<string | null> {
  const url = await resource.upload(file);
  return url || null;
}

export function mediaMenu(
  items: PluginContextMenuItem[],
  kind: "image" | "video" | "audio",
  options: MediaCapabilities
): PluginContextMenuItem[] {
  const actions = new Set(options.actions ?? [`${kind}-url`]);
  const restricted = new Set([
    `${kind}-local`,
    `${kind}-url`,
    `${kind}-ai`,
    `${kind}-tts`,
    `${kind}-bilibili`,
    `${kind}-youtube`,
    "open-video-note",
  ]);
  return items
    .filter(item => {
      if (item.key === `download-${kind}`) return !!options.download;
      return !restricted.has(item.key) || actions.has(item.key);
    })
    .map(item => ({
      ...item,
      children: item.children ? mediaMenu(item.children, kind, options) : undefined,
    }));
}
