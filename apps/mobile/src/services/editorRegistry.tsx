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
} from "./tauri";
import { getMobileSettingByPath, subscribeMobileSettingSnapshot } from "./mobileSettingsBridge";
import { mobileVideoContentProviders } from "../editor-providers/videoProviders";

const UNSUPPORTED_REASON = "移动端不支持该功能";

function readMobileTheme(): "light" | "dark" {
  if (typeof document === "undefined") {
    return "light";
  }
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function createThemeColors(theme: "light" | "dark"): ThemeColors {
  if (theme === "dark") {
    return {
      hoverClass: "hover:bg-neutral-800",
      activeClass: "bg-neutral-800 text-neutral-100",
      hoverTextClass: "hover:text-neutral-100",
      borderClass: "border-neutral-800",
      hoverBorderClass: "hover:border-neutral-700",
      focusBorderClass: "border-neutral-700",
      textClass: "text-neutral-300",
      secondaryTextClass: "text-neutral-500",
      activeTextClass: "text-neutral-100",
      cardBorderClass: "border-neutral-800",
      cardBgClass: "bg-neutral-950",
      accentColor: "rgb(229 229 229)",
      accentSoftBg: "rgba(245, 245, 245, 0.12)",
    };
  }

  return {
    hoverClass: "hover:bg-neutral-100",
    activeClass: "bg-neutral-200 text-neutral-900",
    hoverTextClass: "hover:text-neutral-900",
    borderClass: "border-neutral-200",
    hoverBorderClass: "hover:border-neutral-300",
    focusBorderClass: "border-neutral-300",
    textClass: "text-neutral-600",
    secondaryTextClass: "text-neutral-400",
    activeTextClass: "text-neutral-900",
    cardBorderClass: "border-neutral-200",
    cardBgClass: "bg-white",
    accentColor: "rgb(64 64 64)",
    accentSoftBg: "rgba(38, 38, 38, 0.1)",
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

async function uploadResourceInMobile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  return uploadResourceCommand({
    fileName: file.name,
    mimeType: file.type,
    bytes: new Uint8Array(arrayBuffer),
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
        const url = await uploadResourceInMobile(file);
        if (!url) {
          throw new Error("RESOURCE_UPLOAD_FAILED: 资源上传失败");
        }
        return url;
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

/** 响应式版本：主题经 document class 切换、设置快照更新时重建配置 */
export function useMobileEditorConfig(): EditorConfig {
  const [config, setConfig] = useState(createMobileEditorConfig);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setConfig(createMobileEditorConfig());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
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
