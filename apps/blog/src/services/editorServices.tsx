import type { Descendant, Text } from "slate";
import type {
  EditorServices,
  MediaInfo,
  ThemeColors,
  ComponentService,
} from "@tau/editor";

const createDefaultThemeColors = (): ThemeColors => ({
  hoverClass: "hover:bg-gray-100 dark:hover:bg-gray-800",
  activeClass: "bg-gray-100 dark:bg-gray-800",
  hoverTextClass: "hover:text-gray-900 dark:hover:text-gray-100",
  borderClass: "border-gray-200 dark:border-gray-700",
  hoverBorderClass: "hover:border-gray-300 dark:hover:border-gray-600",
  focusBorderClass: "focus:border-blue-500 dark:focus:border-blue-400",
  textClass: "text-gray-700 dark:text-gray-300",
  secondaryTextClass: "text-gray-500 dark:text-gray-500",
  activeTextClass: "text-gray-900 dark:text-gray-100",
  cardBorderClass: "border-gray-200 dark:border-gray-700",
  cardBgClass: "bg-white dark:bg-gray-900",
  accentColor: "#3b82f6",
  accentSoftBg: "rgba(59, 130, 246, 0.15)",
});

const isYoutube = (url: string): boolean => /youtu(\.be|be\.com)/i.test(url);

const isBilibili = (url: string): boolean => /bilibili\.com/i.test(url);

const resolveMediaInfo = async (url: string): Promise<MediaInfo> => ({
  title: url,
  thumbnail: undefined,
  duration: undefined,
  author: undefined,
});

const createComponentRegistry = (): ComponentService => {
  const ResourcePickerModal: ComponentService["ResourcePickerModal"] = () =>
    null;

  const VideoLoader = ({ message }: { message: string }) => (
    <div className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-500">
      {message}
    </div>
  );

  return {
    Image: ({ url }: { url: string }) => (
      <img src={url} alt={url} className="w-full h-full object-cover" />
    ),
    Video: ({ src }: { src: string }) => (
      <video src={src} controls className="w-full h-full object-cover" />
    ),
    Audio: ({ src }: { src: string }) => (
      <audio src={src} controls className="w-full h-full object-cover" />
    ),
    ResourcePickerModal,
    BilibiliVideoLoader: () => (
      <VideoLoader message="Bilibili 视频在桌面端可播放" />
    ),
    YoutubeVideoLoader: () => (
      <VideoLoader message="YouTube 视频在桌面端可播放" />
    ),
    NotionVideoLoader: () => (
      <VideoLoader message="Notion 视频仅支持在桌面端预览" />
    ),
  };
};

const extractText = (nodes: Descendant[]): string => {
  return nodes
    .map((node) => {
      if (isTextNode(node)) {
        return node.text;
      }
      if ("children" in node && Array.isArray(node.children)) {
        return extractText(node.children as Descendant[]);
      }
      return "";
    })
    .join("");
};

const isTextNode = (node: Descendant): node is Text =>
  typeof (node as Text).text === "string";

const formatDate = (
  value: Date | string | number,
  format = "YYYY-MM-DD HH:mm",
): string => {
  const date =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value)
        : new Date(Date.parse(value));
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  if (format === "timestamp") {
    return String(date.getTime());
  }
  const pad = (input: number) => input.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

export function createBlogEditorServices(): EditorServices {
  const components = createComponentRegistry();

  return {
    resource: {
      upload: async () => {
        throw new Error("Blog 模式不支持上传资源");
      },
      create: async () => {
        console.warn("Blog 模式下忽略 resource.create 调用");
      },
      decrementRef: async () => {
        console.warn("Blog 模式下忽略 resource.decrementRef 调用");
      },
    },

    file: {
      select: async () => {
        throw new Error("Blog 模式不支持文件选择");
      },
      readText: async () => {
        throw new Error("Blog 模式不支持文件读取");
      },
      getBaseName: (filePath: string) => {
        const normalized = filePath.replace(/\\/g, "/");
        const parts = normalized.split("/");
        return parts.at(-1) ?? "";
      },
      getHomeDir: async () => "",
      uploadFile: async () => {
        throw new Error("Blog 模式不支持文件上传");
      },
    },

    media: {
      getYoutubeInfo: resolveMediaInfo,
      getBilibiliInfo: resolveMediaInfo,
      getNotionInfo: resolveMediaInfo,
      isYoutubeUrl: isYoutube,
      isBilibiliUrl: isBilibili,
      quickCheckBilibiliUrl: (url: string) => isBilibili(url),
      shouldUseLocalCache: () => false,
    },

    settings: {
      get: <T,>(key: string): T => {
        console.warn(`Blog 模式下读取设置 "${key}" 默认返回 undefined`);
        return undefined as T;
      },
      getYoutubeProxy: () => null,
      isDarkMode: () => document.documentElement.classList.contains("dark"),
    },

    theme: {
      current: () =>
        document.documentElement.classList.contains("dark") ? "dark" : "light",
      colors: () => createDefaultThemeColors(),
    },

    ai: {
      chatStream: async () => {
        throw new Error("Blog 模式不支持 AI 能力");
      },
      textToSpeech: async () => null,
    },

    utility: {
      formatDate,
      normalizeWebviewUrl: (url: string) => url,
      openUrl: async (url: string) => {
        window.open(url, "_blank", "noopener,noreferrer");
      },
      getMarkdown: (content: Descendant[]) => extractText(content),
      nodeFetch: async (url: string, options: RequestInit) => {
        return await fetch(url, options).then((res) => res.text());
      },
    },

    components,
  };
}
