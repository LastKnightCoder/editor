import React, { forwardRef } from "react";
import {
  importFromMarkdown,
  isMarkdownLikeText,
  type EditorServices,
  type ThemeColors,
} from "@tau/editor";
import type WebSocketClient from "../utils/WebSocketClient";
import type { ResolvedTheme } from "../utils/types";
import dayjs from "dayjs";
import RpcLocalImage from "../components/RpcLocalImage";
import RpcLocalVideo from "../components/RpcLocalVideo";
import RpcLocalAudio from "../components/RpcLocalAudio";

/** 不支持操作时的统一提示 */
const UNSUPPORTED = (name: string) =>
  Promise.reject(new Error(`[Tau Extension] ${name} 在浏览器扩展中暂不支持`));

/** 创建一个空的 ThemeColors 对象 */
function createThemeColors(): ThemeColors {
  return {
    hoverClass: "hover:bg-gray-100 dark:hover:bg-zinc-800",
    activeClass: "bg-[#eee] text-gray-900 dark:bg-zinc-800 dark:text-gray-100",
    hoverTextClass: "hover:text-gray-900 dark:hover:text-gray-100",
    borderClass: "border-[#f0f0f0] dark:border-[#2a2a2a]",
    hoverBorderClass: "hover:border-[#eaeaea] dark:hover:border-[#3a3a3a]",
    focusBorderClass: "border-[#f0f0f0] dark:border-[#2a2a2a]",
    textClass: "text-gray-600 dark:text-gray-400",
    secondaryTextClass: "text-gray-400 dark:text-gray-500",
    activeTextClass: "text-gray-900 dark:text-gray-100",
    cardBorderClass: "border-gray-200 dark:border-gray-800",
    cardBgClass: "bg-gray-50/80 dark:bg-zinc-900/50",
  };
}

interface CreateEditorServicesOptions {
  wsClient: WebSocketClient | null;
  resolvedTheme: ResolvedTheme;
}

type ImagePropsWithoutWs = Omit<
  React.ComponentPropsWithoutRef<typeof RpcLocalImage>,
  "wsClient"
>;
type VideoPropsWithoutWs = Omit<
  React.ComponentPropsWithoutRef<typeof RpcLocalVideo>,
  "wsClient"
>;
type AudioPropsWithoutWs = Omit<
  React.ComponentPropsWithoutRef<typeof RpcLocalAudio>,
  "wsClient"
>;

/**
 * 创建浏览器扩展专用的 EditorServices
 *
 * 设计原则：
 * - compiler/ai 等重型服务通过 WebSocket RPC 代理
 * - theme/settings/utility 在本地实现
 * - resource/file 等桌面端特有服务提供最小化实现
 */
export function createExtensionEditorServices({
  wsClient,
  resolvedTheme,
}: CreateEditorServicesOptions): EditorServices {
  const rpc = async <T = unknown>(
    method: string,
    params: unknown = null,
  ): Promise<T> => {
    if (!wsClient?.isConnected) {
      throw new Error("WebSocket 未连接，无法执行此操作");
    }
    return wsClient.sendRequest(method, params) as Promise<T>;
  };

  return {
    // ==================== 资源管理（简化实现）====================
    resource: {
      upload: async (_file: File) => {
        // 后续可通过 WebSocket 传输文件
        return UNSUPPORTED("资源上传") as never;
      },
      create: async () => {
        // no-op
      },
      decrementRef: async () => {
        // no-op
      },
    },

    file: {
      select: async () => null,
      readText: async () => UNSUPPORTED("文件读取") as never,
      getBaseName: (filePath: string) => {
        const parts = filePath.replace(/\\/g, "/").split("/");
        return parts[parts.length - 1] || "";
      },
      getHomeDir: async () => "",
      uploadFile: async () => null,
    },

    media: {
      getYoutubeInfo: async () => UNSUPPORTED("YouTube 信息获取") as never,
      getBilibiliInfo: async () => UNSUPPORTED("Bilibili 信息获取") as never,
      getNotionInfo: async () => UNSUPPORTED("Notion 信息获取") as never,
      isYoutubeUrl: (url: string) => /youtube\.com|youtu\.be/.test(url),
      isBilibiliUrl: (url: string) => /bilibili\.com|b23\.tv/.test(url),
      quickCheckBilibiliUrl: (url: string) => /bilibili\.com|b23\.tv/.test(url),
      shouldUseLocalCache: () => false,
    },

    settings: {
      get: <T = unknown>(_key: string): T => {
        return undefined as T;
      },
      getYoutubeProxy: () => null,
      isDarkMode: () => resolvedTheme === "dark",
    },

    theme: {
      current: () => resolvedTheme,
      colors: () => createThemeColors(),
    },

    ai: {
      chatStream: async () => {
        // 后续通过 WebSocket 代理
      },
      textToSpeech: async () => null,
    },

    compiler: {
      typst: async (code: string) => {
        return rpc<string>("compiler.typst", { code });
      },
      tailwindRuntime: async (html: string) => {
        return rpc<string>("compiler.tailwindRuntime", { html });
      },
    },

    utility: {
      formatDate: (date, format) => {
        const d = dayjs(date);
        return format ? d.format(format) : d.format("YYYY-MM-DD HH:mm:ss");
      },
      openUrl: async (url: string) => {
        window.open(url, "_blank");
      },
      nodeFetch: async (url: string, options: RequestInit) => {
        const resp = await fetch(url, options);
        return resp.text();
      },
      getMarkdown: () => {
        // 简化实现，后续可增强
        return "";
      },
      importFromMarkdown,
      isMarkdownLikeText,
    },

    components: {
      Image: forwardRef<HTMLImageElement, ImagePropsWithoutWs>((props, ref) =>
        React.createElement(RpcLocalImage, { ...props, wsClient, ref }),
      ),
      Video: forwardRef<HTMLVideoElement, VideoPropsWithoutWs>((props, ref) =>
        React.createElement(RpcLocalVideo, { ...props, wsClient, ref }),
      ),
      Audio: forwardRef<HTMLAudioElement, AudioPropsWithoutWs>((props, ref) =>
        React.createElement(RpcLocalAudio, { ...props, wsClient, ref }),
      ),
      ResourcePickerModal: () => null,
    },
  };
}
