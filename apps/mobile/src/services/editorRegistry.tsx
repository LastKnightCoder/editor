import { convertFileSrc as tauriConvertFileSrc } from "@tauri-apps/api/core";
import { openUrl as tauriOpenUrl } from "@tauri-apps/plugin-opener";
import {
  createServiceRegistry,
  IEditorSlots,
  IFileService,
  IVideoContentProviders,
  IOpenerService,
  IResourceService,
  type ServiceRegistry,
  type EditorSlots,
  type ImageAppearanceConfig,
  type ImageAppearanceSource,
} from "@tau/editor/src";
import { importFromMarkdown as sharedImportFromMarkdown } from "@tau/markdown";
import { markdownCustomDirectives } from "@tau/shared";
import LocalAudio from "../components/editor/LocalAudio";
import LocalImage from "../components/editor/LocalImage";
import LocalVideo from "../components/editor/LocalVideo";
import { getMobileHomeDir } from "../components/editor/localMedia";
import {
  remoteResourceToLocal as remoteResourceToLocalCommand,
  uploadResource as uploadResourceCommand,
  withTimeout,
} from "./tauri";
import { getMobileSettingByPath, subscribeMobileSettingSnapshot } from "./mobileSettingsBridge";
import { mobileVideoContentProviders } from "../editor-providers/videoProviders";
import { arrayBufferToBase64 } from "../utils/base64";
import { compressImageForUpload } from "../utils/imageCompress";

const UNSUPPORTED_REASON = "移动端不支持该功能";

function createUnsupportedError(feature: string): Error {
  return new Error(`MOBILE_UNSUPPORTED: ${feature} - ${UNSUPPORTED_REASON}`);
}

function rejectUnsupported<T>(feature: string): Promise<T> {
  return Promise.reject(createUnsupportedError(feature));
}

function readLastPathSegment(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || "";
}

// Rust 端网络策略为 12s×3 次重试（约 40s）；前端再兜一层，覆盖 arrayBuffer
// 读取挂起 / 大字节 invoke 在 Android IPC 上不落起等场景，保证占位可退出并提示
const UPLOAD_TIMEOUT_MS = 60_000;

async function uploadResourceInMobile(file: File): Promise<string> {
  // 先在 WebView 内预压缩（相机原图 3–8MB → webp 数百 KB），再 base64 走字符串通道
  const compressed = await compressImageForUpload(file);
  const buffer = await compressed.blob.arrayBuffer();
  return uploadResourceCommand({
    fileName: compressed.fileName,
    mimeType: compressed.mimeType,
    base64: arrayBufferToBase64(buffer),
  });
}

const mobileEditorSlots: EditorSlots = {
  Image: LocalImage,
  Video: LocalVideo,
  Audio: LocalAudio,
};

export function createMobileEditorRegistry(): ServiceRegistry {
  return createServiceRegistry(register => {
    register(IResourceService, {
      upload: async file => {
        // 分步日志经 WebView console 进 logcat，用于真机排查上传链路
        console.log(`[resource-upload] start: ${file.name}, ${file.size}B, ${file.type}`);
        try {
          const url = await withTimeout(
            uploadResourceInMobile(file),
            UPLOAD_TIMEOUT_MS,
            `RESOURCE_UPLOAD_TIMEOUT: 资源上传超时（${UPLOAD_TIMEOUT_MS / 1000} 秒），请检查图床网络后重试`
          );
          console.log(`[resource-upload] done: ${url}`);
          if (!url) {
            throw new Error("RESOURCE_UPLOAD_FAILED: 资源上传失败");
          }
          return url;
        } catch (error) {
          console.log(`[resource-upload] failed: ${String(error)}`);
          throw error;
        }
      },
      remoteResourceToLocal: async url => remoteResourceToLocalCommand(url),
      resolveCdnUrl: url => url,
    });

    register(IFileService, {
      select: _options => rejectUnsupported("file.select"),
      readText: _filePath => rejectUnsupported("file.readText"),
      getBaseName: filePath => readLastPathSegment(filePath),
      getHomeDir: async () => getMobileHomeDir(),
      convertFileSrc: async filePath => tauriConvertFileSrc(filePath),
    });

    register(IOpenerService, {
      open: url => {
        void tauriOpenUrl(url);
      },
    });
    register(IEditorSlots, mobileEditorSlots);
    register(IVideoContentProviders, mobileVideoContentProviders);
  });
}

/** markdown 粘贴导入用的解析函数（合并业务 customDirectives），供宿主扩展工厂注入 */
export const mobileImportFromMarkdown = (
  markdown: string,
  ignoreTypes?: string[],
  options?: Parameters<typeof sharedImportFromMarkdown>[2]
) =>
  sharedImportFromMarkdown(markdown, ignoreTypes, {
    customDirectives: {
      ...markdownCustomDirectives,
      ...options?.customDirectives,
    },
  });

/** 图片默认外观：读设置桥快照，快照更新时编辑器随之刷新 */
export const mobileImageAppearance: ImageAppearanceSource = {
  get: () => getMobileSettingByPath<ImageAppearanceConfig>("appearance.image"),
  subscribe: subscribeMobileSettingSnapshot,
};
