import React, { forwardRef } from "react";
import {
  createServiceRegistry,
  ICompilerService,
  IEditorSlots,
  IFileService,
  IResourceService,
  IVideoContentProviders,
  type ServiceRegistry,
  type ThemeColors,
  type VideoContentProvider,
  type EditorConfig,
} from "@tau/editor";
import { importFromMarkdown } from "@tau/editor";
import { markdownCustomDirectives } from "@tau/shared";
import type WebSocketClient from "../utils/WebSocketClient";
import type { ResolvedTheme } from "../utils/types";
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

interface CreateEditorRegistryOptions {
  wsClient: WebSocketClient | null;
}

/** 平台解析类视频降级为提示，避免按直链拉流播放失败 */
function createDegradedVideoProviders(): VideoContentProvider[] {
  const degraded = (platform: string): VideoContentProvider["Content"] => {
    const DegradedContent = () => (
      <div className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-500">
        {platform} 视频请在桌面端查看
      </div>
    );
    return DegradedContent;
  };
  const matchesHostSuffix = (url: string, suffix: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "").endsWith(suffix);
    } catch {
      return false;
    }
  };
  return [
    {
      id: "bilibili",
      match: element => element.metaInfo?.type === "bilibili",
      isSourceUrl: url => matchesHostSuffix(url, "bilibili.com"),
      Content: degraded("Bilibili"),
    },
    {
      id: "youtube",
      match: element => element.metaInfo?.type === "youtube",
      isSourceUrl: url =>
        matchesHostSuffix(url, "youtube.com") || matchesHostSuffix(url, "youtu.be"),
      Content: degraded("YouTube"),
    },
  ];
}

type ImagePropsWithoutWs = Omit<React.ComponentPropsWithoutRef<typeof RpcLocalImage>, "wsClient">;
type VideoPropsWithoutWs = Omit<React.ComponentPropsWithoutRef<typeof RpcLocalVideo>, "wsClient">;
type AudioPropsWithoutWs = Omit<React.ComponentPropsWithoutRef<typeof RpcLocalAudio>, "wsClient">;

/**
 * 创建浏览器扩展专用的服务注册表
 *
 * 设计原则：
 * - compiler 等重型服务通过 WebSocket RPC 代理（rpc 闭包随 wsClient 建立连接）
 * - utility 在本地实现
 * - resource/file 等桌面端特有服务提供最小化实现
 */
export function createExtensionEditorRegistry({
  wsClient,
}: CreateEditorRegistryOptions): ServiceRegistry {
  const rpc = async <T = unknown,>(method: string, params: unknown = null): Promise<T> => {
    if (!wsClient?.isConnected) {
      throw new Error("WebSocket 未连接，无法执行此操作");
    }
    return wsClient.sendRequest(method, params) as Promise<T>;
  };

  return createServiceRegistry(register => {
    // ==================== 媒体文件服务（简化实现）====================
    register(IResourceService, {
      upload: async (_file: File) => {
        // 后续可通过 WebSocket 传输文件
        return UNSUPPORTED("资源上传") as never;
      },
    });

    register(IFileService, {
      select: async () => null,
      readText: async () => UNSUPPORTED("文件读取") as never,
      getBaseName: (filePath: string) => {
        const parts = filePath.replace(/\\/g, "/").split("/");
        return parts[parts.length - 1] || "";
      },
      getHomeDir: async () => "",
    });

    register(ICompilerService, {
      typst: async (code: string) => {
        return rpc<string>("compiler.typst", { code });
      },
      tailwindRuntime: async (html: string) => {
        return rpc<string>("compiler.tailwindRuntime", { html });
      },
    });

    register(IEditorSlots, {
      Image: forwardRef<HTMLImageElement, ImagePropsWithoutWs>((props, ref) =>
        React.createElement(RpcLocalImage, { ...props, wsClient, ref })
      ),
      Video: forwardRef<HTMLVideoElement, VideoPropsWithoutWs>((props, ref) =>
        React.createElement(RpcLocalVideo, { ...props, wsClient, ref })
      ),
      Audio: forwardRef<HTMLAudioElement, AudioPropsWithoutWs>((props, ref) =>
        React.createElement(RpcLocalAudio, { ...props, wsClient, ref })
      ),
    });

    register(IVideoContentProviders, createDegradedVideoProviders());
  });
}

/** 扩展端编辑器全局配置：主题随 sidepanel 明暗状态 */
export function createExtensionEditorConfig(resolvedTheme: ResolvedTheme): EditorConfig {
  return {
    theme: {
      mode: resolvedTheme,
      colors: createThemeColors(),
    },
    openUrl: url => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
  };
}

/** markdown 粘贴导入用的解析函数（合并业务 customDirectives），供宿主扩展工厂注入 */
export const extensionImportFromMarkdown = (
  markdown: string,
  ignoreTypes?: string[],
  options?: Parameters<typeof importFromMarkdown>[2]
) =>
  importFromMarkdown(markdown, ignoreTypes, {
    customDirectives: {
      ...markdownCustomDirectives,
      ...options?.customDirectives,
    },
  });
