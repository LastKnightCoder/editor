import { convertFileSrc as tauriConvertFileSrc } from "@tauri-apps/api/core";
import { openUrl as tauriOpenUrl } from "@tauri-apps/plugin-opener";
import type {
  EditorServices,
  ThemeColors,
} from "@tau/editor/src/types/services";
import LocalAudio from "../components/editor/LocalAudio";
import LocalImage from "../components/editor/LocalImage";
import LocalVideo from "../components/editor/LocalVideo";
import { getMobileHomeDir } from "../components/editor/localMedia";
import { uploadResource as uploadResourceCommand } from "./tauri";

const UNSUPPORTED_REASON = "移动端不支持该功能";

const EMPTY_MARKDOWN = "";

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

function inferResourceTypeFromFile(file?: File): string {
  const mime = file?.type?.toLowerCase() ?? "";
  if (mime.startsWith("image/")) {
    return "image";
  }
  if (mime.startsWith("video/")) {
    return "video";
  }
  if (mime.startsWith("audio/")) {
    return "audio";
  }
  return "attachment";
}

async function uploadResourceInMobile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  return uploadResourceCommand({
    fileName: file.name,
    mimeType: file.type,
    bytes: new Uint8Array(arrayBuffer),
  });
}

function toNormalizedDate(date: Date | string | number): Date | null {
  if (date instanceof Date) {
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const normalizedDate = new Date(date);
  if (Number.isNaN(normalizedDate.getTime())) {
    return null;
  }
  return normalizedDate;
}

function descendantsToMarkdown(content: unknown[]): string {
  if (!Array.isArray(content)) {
    return EMPTY_MARKDOWN;
  }

  const lines = content
    .map((node) => {
      const chunks: string[] = [];
      const visit = (current: any) => {
        if (!current) {
          return;
        }
        if (typeof current.text === "string") {
          chunks.push(current.text);
          return;
        }
        if (Array.isArray(current.children)) {
          current.children.forEach((child: any) => visit(child));
        }
      };
      visit(node);
      return chunks.join("");
    })
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.join("\n");
}

function PlaceholderPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-500">
      <p className="font-medium text-slate-600">{title}</p>
      <p className="mt-1 leading-relaxed">{description}</p>
    </div>
  );
}

function PlaceholderVideoLoader(props: {
  loading?: boolean;
  error?: string | null;
  streamProgress?: { message?: string; stage?: string } | null;
}) {
  if (!props.loading && !props.error) {
    return null;
  }
  return (
    <PlaceholderPanel
      title="视频加载降级"
      description={
        props.error ?? props.streamProgress?.message ?? "暂不支持该平台视频解析"
      }
    />
  );
}

function PlaceholderModal(): null {
  return null;
}

export function createMobileEditorServices(): EditorServices {
  return {
    resource: {
      upload: async (file) => {
        const url = await uploadResourceInMobile(file);
        if (!url) {
          throw new Error("RESOURCE_UPLOAD_FAILED: 资源上传失败");
        }
        return {
          id: url,
          url,
          type: inferResourceTypeFromFile(file),
          name: file.name,
          path: url,
        };
      },
      create: async () => Promise.resolve(),
      decrementRef: async () => Promise.resolve(),
      remoteResourceToLocal: async (url) => url,
      useGithubCdnUrl: (url) => url,
    },
    file: {
      select: (_options) => rejectUnsupported("file.select"),
      readText: (_filePath) => rejectUnsupported("file.readText"),
      getBaseName: (filePath) => readLastPathSegment(filePath),
      getHomeDir: async () => getMobileHomeDir(),
      uploadFile: async (file) => {
        const url = await uploadResourceInMobile(file);
        if (!url) {
          throw new Error("RESOURCE_UPLOAD_FAILED: 文件上传失败");
        }
        return url;
      },
      convertFileSrc: async (filePath) => tauriConvertFileSrc(filePath),
    },
    media: {
      getYoutubeInfo: (_url) => rejectUnsupported("media.getYoutubeInfo"),
      getBilibiliInfo: (_url) => rejectUnsupported("media.getBilibiliInfo"),
      getNotionInfo: (_url) => rejectUnsupported("media.getNotionInfo"),
      isYoutubeUrl: (url) =>
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)/i.test(url),
      isBilibiliUrl: (url) => /(?:bilibili\.com|b23\.tv)/i.test(url),
      quickCheckBilibiliUrl: (url) => /(?:bilibili\.com|b23\.tv)/i.test(url),
      shouldUseLocalCache: (_url) => false,
    },
    settings: {
      get: () => undefined as unknown as any,
      getYoutubeProxy: () => null,
      isDarkMode: () => readMobileTheme() === "dark",
    },
    theme: {
      current: () => readMobileTheme(),
      colors: () => createThemeColors(readMobileTheme()),
    },
    ai: {
      chatStream: (_params) => rejectUnsupported("ai.chatStream"),
      chatLLMStream: (_provider, _model, _messages, _options) =>
        rejectUnsupported("ai.chatLLMStream"),
      textToSpeech: (_text, _voiceId) => rejectUnsupported("ai.textToSpeech"),
      getVoiceList: () => Promise.resolve([]),
      isTTSConfigured: () => false,
    },
    utility: {
      formatDate: (date) => {
        const normalizedDate = toNormalizedDate(date);
        return normalizedDate ? normalizedDate.toLocaleString() : "";
      },
      openUrl: async (url) => {
        await tauriOpenUrl(url);
      },
      nodeFetch: async (url, options) => {
        const response = await fetch(url, options);
        if (!response.ok) {
          throw new Error(
            `MOBILE_UNSUPPORTED: utility.nodeFetch - HTTP ${response.status}`,
          );
        }
        return response.text();
      },
      getMarkdown: (content) => descendantsToMarkdown(content),
      normalizeWebviewUrl: (url) => url,
    },
    components: {
      Image: LocalImage,
      Video: LocalVideo,
      Audio: LocalAudio,
      ResourcePickerModal: PlaceholderModal,
      BilibiliVideoLoader: PlaceholderVideoLoader,
      YoutubeVideoLoader: PlaceholderVideoLoader,
      NotionVideoLoader: PlaceholderVideoLoader,
      RemoteVideoLoader: PlaceholderVideoLoader,
      BilibiliVideoSelectModal: PlaceholderModal,
      YoutubeVideoSelectModal: PlaceholderModal,
      NotionVideoSelectModal: PlaceholderModal,
    },
  };
}
