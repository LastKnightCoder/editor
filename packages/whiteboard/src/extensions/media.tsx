import { createContext, useContext, type ComponentType } from "react";
import type { PluginContextMenuItem } from "../types";

export interface MediaExtensionOptions {
  actions?: readonly string[];
  upload?(file: File): Promise<string | null>;
  download?(url: string): Promise<unknown>;
  imageInfo(file: File): Promise<{ width: number; height: number } | null>;
  videoInfo(file: File): Promise<{ width: number; height: number } | null>;
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
export const browserMediaOptions: MediaExtensionOptions = {
  imageInfo: file => info(file, false),
  videoInfo: file => info(file, true),
};
export const MediaExtensionContext = createContext(browserMediaOptions);
export const useMediaExtension = () => useContext(MediaExtensionContext);

export function mediaMenu(
  items: PluginContextMenuItem[],
  kind: "image" | "video" | "audio",
  options: MediaExtensionOptions
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
