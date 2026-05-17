import type { ComponentType } from "react";
import type { Descendant } from "slate";

// ==================== Resource Management ====================
export interface CreateResourceParams {
  name: string;
  path: string;
  type: string;
  source: { type: string; id: number };
}

export interface ResourceService {
  /**
   * Upload a resource (file, image, video, etc.)
   */
  upload: (file: File) => Promise<IResource>;

  /**
   * Create or update a resource record
   */
  create: (params: CreateResourceParams) => Promise<void>;

  /**
   * Decrement resource reference count
   */
  decrementRef: (resourceId: string) => Promise<void>;

  /**
   * Convert remote resource to local path
   */
  remoteResourceToLocal?: (url: string) => Promise<string>;

  /**
   * Whether to use GitHub CDN URL
   */
  useGithubCdnUrl?: (url?: string) => string | null | undefined;
}

// ==================== File Operations ====================
export interface FileService {
  /**
   * Open file selection dialog
   */
  select: (options?: {
    properties?: string[];
    filters?: Array<{ name: string; extensions: string[] }>;
    multiple?: boolean;
  }) => Promise<string[] | null>;

  /**
   * Read text content from file
   */
  readText: (filePath: string) => Promise<string>;

  /**
   * Get base name of file path
   */
  getBaseName: (filePath: string) => string;

  /**
   * Get user's home directory
   */
  getHomeDir: () => Promise<string>;

  /**
   * Upload a file and return its URL
   */
  uploadFile: (file: File) => Promise<string | null>;

  /**
   * Convert file path to src URL
   */
  convertFileSrc?: (filePath: string) => Promise<string>;
}

// ==================== Media Services ====================
export interface MediaInfo {
  title: string;
  thumbnail?: string;
  duration?: number;
  author?: string;
}

export interface MediaService {
  getYoutubeInfo: (url: string) => Promise<MediaInfo>;
  getBilibiliInfo: (url: string) => Promise<MediaInfo>;
  getNotionInfo: (url: string) => Promise<MediaInfo>;
  isYoutubeUrl: (url: string) => boolean;
  isBilibiliUrl: (url: string) => boolean;
  quickCheckBilibiliUrl: (url: string) => boolean;
  shouldUseLocalCache: (url: string) => boolean;
}

export interface SettingsService {
  get: <T = any>(key: string) => T;
  getYoutubeProxy: () => string | null;
  isDarkMode: () => boolean;
  subscribe?: (listener: () => void) => () => void;
}

export interface ThemeColors {
  hoverClass: string;
  activeClass: string;
  hoverTextClass: string;
  borderClass: string;
  hoverBorderClass: string;
  focusBorderClass: string;
  textClass: string;
  secondaryTextClass: string;
  activeTextClass: string;
  cardBorderClass: string;
  cardBgClass: string;
  accentColor?: string;
  accentSoftBg?: string;
  badgeBgClass?: string;
  badgeBgColor?: string;
  [key: string]: string | undefined;
}

export interface ThemeService {
  current: () => "light" | "dark";
  colors: () => ThemeColors;
}

export interface ChatMessage {
  role: string;
  content: unknown;
}

export interface ChatStreamOptions {
  onFinish?: () => void;
  onUpdate?: (fullText: string, incrementalText: string) => void;
  onError?: (error: Error) => void;
}

export interface ChatProviderConfig {
  id: string;
  [key: string]: unknown;
}

export interface ChatModelConfig {
  id: string;
  name?: string;
  [key: string]: unknown;
}

export type KnowledgeOptions = Record<string, unknown>;

export interface AIService {
  chatStream: (params: {
    provider: ChatProviderConfig;
    model: ChatModelConfig;
    messages: ChatMessage[];
    options?: ChatStreamOptions;
    knowledge?: KnowledgeOptions;
  }) => Promise<void>;
  chatLLMStream?: (
    provider: ChatProviderConfig,
    model: ChatModelConfig,
    messages: ChatMessage[],
    options?: ChatStreamOptions,
  ) => Promise<void>;
  textToSpeech: (text: string, voiceId?: string) => Promise<Blob | null>;
  getVoiceList?: () => Promise<
    Array<{ id: string; name: string; description?: string }>
  >;
  isTTSConfigured?: () => boolean;
}

export interface ImageGenerationResult {
  url: string;
  fileName?: string;
  mimeType?: string;
  revisedPrompt?: string;
}

export interface ImageGenerationService {
  isAvailable: () => boolean;
  generateImage: (params: { prompt: string }) => Promise<ImageGenerationResult>;
  editImage: (params: {
    prompt: string;
    images: string[];
  }) => Promise<ImageGenerationResult>;
}

export interface CompilerService {
  typst: (code: string) => Promise<string>; // Returns SVG or PDF
  tailwindRuntime: (html: string) => Promise<string>;
}

export interface UtilityService {
  formatDate: (date: Date | string | number, format?: string) => string;
  normalizeWebviewUrl?: (url: string) => string;
  openUrl: (url: string) => Promise<void>;
  nodeFetch: (url: string, options: RequestInit) => Promise<string>;
  getMarkdown: (content: Descendant[]) => string;
  importFromMarkdown: (
    markdown: string,
    ignoreTypes?: string[],
  ) => Descendant[];
  isMarkdownLikeText: (text: string) => boolean;
}

export interface WebviewProps {
  src?: string;
  className?: string;
  style?: React.CSSProperties;
  preload?: string;
  allowPopups?: boolean;
}

export interface CustomBlockManifest {
  name: string;
  description?: string;
  author?: string;
}

export interface CustomBlockTemplate {
  id: string;
  source: string;
  manifest: CustomBlockManifest;
  isLocal?: boolean;
}

export interface CustomBlockService {
  listEnabledTemplates: () => Promise<CustomBlockTemplate[]>;
}

export interface ComponentService {
  Image: ComponentType<any>;
  Video: ComponentType<any>;
  Audio: ComponentType<any>;
  ResourcePickerModal: ComponentType<any>;
  BilibiliVideoLoader?: ComponentType<any>;
  YoutubeVideoLoader?: ComponentType<any>;
  NotionVideoLoader?: ComponentType<any>;
  RemoteVideoLoader?: ComponentType<any>;
  BilibiliVideoSelectModal?: ComponentType<any>;
  YoutubeVideoSelectModal?: ComponentType<any>;
  NotionVideoSelectModal?: ComponentType<any>;
}

export interface IResource {
  id: string;
  url: string;
  type: string;
  name?: string;
  path?: string;
}

export enum WebLinkSourceType {
  URL = "url",
  YOUTUBE = "youtube",
  BILIBILI = "bilibili",
  NOTION = "notion",
  REMOTE = "remote",
  LOCAL = "local",
}

export interface EditorServices {
  resource: ResourceService;
  file: FileService;
  media: MediaService;
  settings: SettingsService;
  theme: ThemeService;
  ai: AIService;
  imageGeneration?: ImageGenerationService;
  compiler?: CompilerService;
  utility: UtilityService;
  customBlock?: CustomBlockService;
  components?: ComponentService;
}
