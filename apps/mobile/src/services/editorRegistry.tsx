import {
  IFetchService,
  IFileService,
  IOpenerService,
  IResourceService,
} from "@tau/shared/host-services";
import { mobileHostFetch } from "../app/plugins/host-fetch";
import { convertFileSrc as tauriConvertFileSrc } from "@tauri-apps/api/core";
import { openUrl as tauriOpenUrl } from "@tauri-apps/plugin-opener";
import {
  createServiceRegistry,
  IEditorNotifier,
  type ServiceRegistration,
  type ServiceRegistry,
} from "@tau/editor";
import {
  IEditorSlots,
  IVideoContentProviders,
  type EditorSlots,
} from "@tau/editor/extensions/media/services";
import {
  type ImageAppearanceConfig,
  type ImageAppearanceSource,
} from "@tau/editor/extensions/media";
export { mobileImportFromMarkdown } from "./editorMarkdown";
import LocalAudio from "../components/editor/LocalAudio";
import LocalImage from "../components/editor/LocalImage";
import LocalVideo from "../components/editor/LocalVideo";
import { getMobileHomeDir } from "../components/editor/localMedia";
import {
  remoteResourceToLocal as remoteResourceToLocalCommand,
  uploadResource as uploadResourceCommand,
} from "./tauri";
import { getMobileSettingByPath, subscribeMobileSettingSnapshot } from "./mobileSettingsBridge";
import { mobileVideoContentProviders } from "../editor-providers/videoProviders";
import { mobileEditorNotifier } from "./editorNotifier";
import { recordUploadFailure, recordUploadSuccess } from "./uploadOutcome";
import { IEditorInteraction, IOverlayBackDismiss } from "@tau/editor/api";
import { MobileEditorOverlayDismiss } from "./editorOverlayDismiss";
import { IRuntimeStyleCompiler } from "@tau/shared/runtime-style";
import { mobileRuntimeStyleCompiler } from "./runtimeStyles";

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

async function uploadResourceInMobile(file: File): Promise<string> {
  return uploadResourceCommand({
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    content: file,
  });
}

export const mobileEditorSlots: EditorSlots = {
  Image: LocalImage,
  Video: LocalVideo,
  Audio: LocalAudio,
};

/** Mobile 的服务注册项：kit 与 registry 共用同一份 */
export const mobileEditorServices: ServiceRegistration = register => {
  register(IRuntimeStyleCompiler, mobileRuntimeStyleCompiler);
  register(IOverlayBackDismiss, { Layer: MobileEditorOverlayDismiss });
  // 媒体等带手柄的块改用触屏交互，操作由配件栏的媒体上下文承接
  register(IEditorInteraction, { touch: true });
  register(IResourceService, {
    upload: async file => {
      // 分步日志经 WebView console 进 logcat，用于真机排查上传链路
      console.log(`[resource-upload] start: ${file.name}, ${file.size}B, ${file.type}`);
      const providerId =
        getMobileSettingByPath<string>("imageBed.active") === "plugin"
          ? (getMobileSettingByPath<string>("imageBed.plugin.id") ?? "")
          : "local";
      try {
        const url = await uploadResourceInMobile(file);
        console.log("[resource-upload] done");
        if (!url) {
          throw new Error("RESOURCE_UPLOAD_FAILED: 资源上传失败");
        }
        recordUploadSuccess(providerId);
        return url;
      } catch (error) {
        console.log(`[resource-upload] failed: ${String(error)}`);
        recordUploadFailure(providerId, error);
        throw error;
      }
    },
    remoteResourceToLocal: async url => remoteResourceToLocalCommand(url),
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
  // 跨域请求复用插件网络传输（网页书签读取网页信息）
  register(IFetchService, { fetch: mobileHostFetch });
  register(IEditorSlots, mobileEditorSlots);
  register(IVideoContentProviders, mobileVideoContentProviders);
  register(IEditorNotifier, mobileEditorNotifier);
};

export function createMobileEditorRegistry(): ServiceRegistry {
  return createServiceRegistry(mobileEditorServices);
}

/** 图片默认外观：读设置桥快照，快照更新时编辑器随之刷新 */
export const mobileImageAppearance: ImageAppearanceSource = {
  get: () => getMobileSettingByPath<ImageAppearanceConfig>("appearance.image"),
  subscribe: subscribeMobileSettingSnapshot,
};
