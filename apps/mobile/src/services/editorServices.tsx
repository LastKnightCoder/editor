import { convertFileSrc as tauriConvertFileSrc } from "@tauri-apps/api/core";
import { openUrl as tauriOpenUrl } from "@tauri-apps/plugin-opener";
import type { EditorServices } from "@tau/editor/src/types/services";
import LocalAudio from "../components/editor/LocalAudio";
import LocalImage from "../components/editor/LocalImage";
import LocalVideo from "../components/editor/LocalVideo";
import { getMobileHomeDir } from "../components/editor/localMedia";

const THEME_COLORS = {
  hoverClass: "hover:bg-indigo-50",
  activeClass: "bg-indigo-100 text-indigo-700",
  hoverTextClass: "hover:text-indigo-600",
  borderClass: "border-slate-200",
  hoverBorderClass: "hover:border-indigo-200",
  focusBorderClass: "border-indigo-300",
  textClass: "text-slate-600",
  secondaryTextClass: "text-slate-400",
  activeTextClass: "text-indigo-700",
  cardBorderClass: "border-slate-200",
  cardBgClass: "bg-white",
  accentColor: "rgb(99 102 241)",
  accentSoftBg: "rgba(99, 102, 241, 0.12)",
};

const UNSUPPORTED_REASON = "移动端当前仅支持只读预览，本期未实现对应后端命令";

const EMPTY_MARKDOWN = "";

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
      upload: (_file) => rejectUnsupported("resource.upload"),
      create: (_params) => rejectUnsupported("resource.create"),
      decrementRef: (_resourceId) => rejectUnsupported("resource.decrementRef"),
      remoteResourceToLocal: async (url) => url,
      useGithubCdnUrl: (url) => url,
    },
    file: {
      select: (_options) => rejectUnsupported("file.select"),
      readText: (_filePath) => rejectUnsupported("file.readText"),
      getBaseName: (filePath) => readLastPathSegment(filePath),
      getHomeDir: async () => getMobileHomeDir(),
      uploadFile: (_file) => rejectUnsupported("file.uploadFile"),
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
      get: <T = any,>(_key: string) => undefined as T,
      getYoutubeProxy: () => null,
      isDarkMode: () => false,
    },
    theme: {
      current: () => "light",
      colors: () => THEME_COLORS,
    },
    ai: {
      chatStream: (_params) => rejectUnsupported("ai.chatStream"),
      chatLLMStream: (_provider, _model, _messages, _options) =>
        rejectUnsupported("ai.chatLLMStream"),
      textToSpeech: (_text, _voiceId) => rejectUnsupported("ai.textToSpeech"),
      getVoiceList: () => Promise.resolve([]),
      isTTSConfigured: () => false,
    },
    compiler: {
      typst: (_code) => rejectUnsupported("compiler.typst"),
      tailwindRuntime: (_html) => rejectUnsupported("compiler.tailwindRuntime"),
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
