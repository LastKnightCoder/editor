import { convertFileSrc as tauriConvertFileSrc } from "@tauri-apps/api/core";
import { openUrl as tauriOpenUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import {
  importFromMarkdown as sharedImportFromMarkdown,
  createServiceRegistry,
  IEditorSlots,
  IFileService,
  IVideoContentProviders,
  IResourceService,
  type ServiceRegistry,
  type ThemeColors,
  type EditorSlots,
  type EditorConfig,
} from "@tau/editor/src";
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

function readMobileTheme(): "light" | "dark" {
  if (typeof document === "undefined") {
    return "light";
  }
  // 深色判定走 .dark 类（themeStore 对深色主题统一挂载，与具体主题 id 解耦）
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

// 编辑器 UI 类走宿主主题 token（--color-* 工具类），随 data-theme 自动切换；
// 仅 inline 颜色值需要按主题区分。
function createThemeColors(theme: "light" | "dark"): ThemeColors {
  if (theme === "dark") {
    return {
      hoverClass: "hover:bg-press",
      activeClass: "bg-press text-ink",
      hoverTextClass: "hover:text-ink",
      borderClass: "border-line",
      hoverBorderClass: "hover:border-line",
      focusBorderClass: "border-accent",
      textClass: "text-ink-2",
      secondaryTextClass: "text-ink-3",
      activeTextClass: "text-ink",
      cardBorderClass: "border-line",
      cardBgClass: "bg-surface",
      accentColor: "rgb(255, 180, 84)",
      accentSoftBg: "rgba(255, 180, 84, 0.13)",
    };
  }

  return {
    hoverClass: "hover:bg-press",
    activeClass: "bg-press text-ink",
    hoverTextClass: "hover:text-ink",
    borderClass: "border-line",
    hoverBorderClass: "hover:border-line",
    focusBorderClass: "border-accent",
    textClass: "text-ink-2",
    secondaryTextClass: "text-ink-3",
    activeTextClass: "text-ink",
    cardBorderClass: "border-line",
    cardBgClass: "bg-surface",
    accentColor: "rgb(217, 119, 87)",
    accentSoftBg: "rgba(217, 119, 87, 0.12)",
  };
}

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

/** Mobile 编辑器全局配置：主题取文档当前状态，图片外观读设置桥快照 */
export function createMobileEditorConfig(): EditorConfig {
  const theme = readMobileTheme();
  const image =
    getMobileSettingByPath<NonNullable<NonNullable<EditorConfig["appearance"]>["image"]>>(
      "appearance.image"
    );
  return {
    theme: {
      mode: theme,
      colors: createThemeColors(theme),
    },
    appearance: image ? { image } : undefined,
    openUrl: url => {
      void tauriOpenUrl(url);
    },
  };
}

/** 响应式版本：主题经 html[data-theme] 切换、设置快照更新时重建配置 */
export function useMobileEditorConfig(): EditorConfig {
  const [config, setConfig] = useState(createMobileEditorConfig);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setConfig(createMobileEditorConfig());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    const unsubscribeSettings = subscribeMobileSettingSnapshot(() => {
      setConfig(createMobileEditorConfig());
    });
    return () => {
      observer.disconnect();
      unsubscribeSettings();
    };
  }, []);

  return config;
}
