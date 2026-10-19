import { IFileService, IResourceService } from "@tau/shared/host-services";
import React, { forwardRef } from "react";
import { createServiceRegistry, type ServiceRegistration } from "@tau/editor";
import {
  IEditorSlots,
  IVideoContentProviders,
  type VideoContentProvider,
} from "@tau/editor/extensions/media/services";
import { IRuntimeStyleCompiler } from "@tau/shared/runtime-style";
export { extensionImportFromMarkdown } from "./editorMarkdown";
import type WebSocketClient from "../utils/WebSocketClient";
import RpcLocalImage from "../components/RpcLocalImage";
import RpcLocalVideo from "../components/RpcLocalVideo";
import RpcLocalAudio from "../components/RpcLocalAudio";

/** 不支持操作时的统一提示 */
const UNSUPPORTED = (name: string) =>
  Promise.reject(new Error(`[Tau Extension] ${name} 在浏览器扩展中暂不支持`));

interface CreateEditorRegistryOptions {
  wsClient: WebSocketClient | null;
}

/** 视频插件提供的视频依赖桌面端插件取源，降级为提示，避免按页面地址拉流失败 */
function createDegradedVideoProviders(): VideoContentProvider[] {
  const DegradedContent = () => (
    <div className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-500">
      该视频请在桌面端查看
    </div>
  );
  return [
    {
      id: "online",
      match: element => typeof element.metaInfo?.type === "string",
      Content: DegradedContent,
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
export function createExtensionEditorServices({
  wsClient,
}: CreateEditorRegistryOptions): ServiceRegistration {
  const rpc = async <T = unknown,>(method: string, params: unknown = null): Promise<T> => {
    if (!wsClient?.isConnected) {
      throw new Error("WebSocket 未连接，无法执行此操作");
    }
    return wsClient.sendRequest(method, params) as Promise<T>;
  };

  return register => {
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

    register(IRuntimeStyleCompiler, {
      compile: async ({ source, language }) => {
        return rpc<string>("compiler.tailwindRuntime", { html: source, extension: language });
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
  };
}
