import type { ComponentType } from "react";
import type { Descendant } from "slate";
import type {
  DataTable,
  ColumnDef as DataTableColumn,
  RowData as DataTableRow,
  DataTableView,
  CreateDataTableView,
  UpdateDataTableView,
  TableViewConfig as DataTableViewConfig,
  DatabaseData,
} from "@tau/shared";

// Types not in shared
export interface CreateDataTable {
  columns: DataTableColumn[];
  rows: DataTableRow[];
  activeViewId?: number | null;
}

export interface UpdateDataTable {
  id: number;
  columns?: DataTableColumn[];
  rows?: DataTableRow[];
  activeViewId?: number | null;
  height?: number;
}

// ==================== Whiteboard Types ====================
export interface WhiteboardViewPort {
  minX: number;
  minY: number;
  width: number;
  height: number;
  zoom: number;
}

export interface WhiteboardSelection {
  selectedIds: string[];
}

export interface WhiteboardData {
  children: unknown[];
  viewPort: WhiteboardViewPort;
  selection: WhiteboardSelection;
  presentationSequences?: unknown;
}

export interface WhiteBoardContent {
  id: number;
  name: string;
  content: WhiteboardData;
  data?: WhiteboardData;
}

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
}

// ==================== Data Table Management ====================
export interface DataTableService {
  /**
   * Create a new data table
   */
  create: (payload: CreateDataTable) => Promise<DataTable>;

  /**
   * Update an existing data table
   */
  update?: (payload: UpdateDataTable) => Promise<DataTable>;

  /**
   * Increment table reference count
   */
  incrementRef?: (tableId: number) => Promise<void>;

  /**
   * Delete a data table
   */
  delete?: (tableId: number) => Promise<void>;
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
  getHomeDir: () => string;

  /**
   * Upload a file and return its URL
   */
  uploadFile: (file: File) => Promise<string | null>;
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

export interface WhiteboardService {
  getAll: () => Promise<WhiteBoardContent[]>;
  getById?: (id: number) => Promise<WhiteBoardContent | null>;
  create: (content: any) => Promise<number>; // Returns whiteboard ID
  update: (id: number, content: any) => Promise<void>;
  delete: (id: number) => Promise<void>;
}

export interface SettingsService {
  get: <T = any>(key: string) => T;
  getYoutubeProxy: () => string | null;
  isDarkMode: () => boolean;
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
}

// ==================== Component Props Types ====================
export interface DatabaseProps {
  data: DataTableRow[];
  columns: DataTableColumn[];
  views: DataTableView[];
  activeViewId: number | null;
  viewConfig: DataTableViewConfig;
  config?: DataTableViewConfig;
  plugins?: unknown[];
  onDataChange?: (data: DatabaseData) => Promise<void> | void;
  onViewConfigChange?: (config: DataTableViewConfig) => Promise<void> | void;
  onActiveViewIdChange?: (viewId: number | null) => Promise<void> | void;
  onCreateView?: (view: CreateDataTableView) => Promise<DataTableView | null>;
  onDeleteView?: (viewId: number) => Promise<number | null>;
  onRenameView?: (
    viewId: number,
    name: string,
  ) => Promise<DataTableView | null>;
  onUpdateView?: (
    viewId: number,
    updates: UpdateDataTableView,
  ) => Promise<DataTableView | null>;
  onReorderViews?: (orderedIds: number[]) => Promise<void>;
  readonly?: boolean;
}

export interface WhiteBoardProps {
  className?: string;
  style?: React.CSSProperties;
  initData: any[];
  initViewPort?: any;
  initSelection?: any;
  readOnly?: boolean;
  onChange?: (data: any) => void;
  onViewPortChange?: (viewPort: any) => void;
  onSelectionChange?: (selection: any) => void;
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
  Database: ComponentType<DatabaseProps>;
  WhiteBoard: ComponentType<WhiteBoardProps>;
  WhiteBoardSelectModal: ComponentType<any>;
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

export interface WhiteBoard {
  id: number;
  name: string;
  content: WhiteboardData;
}

export interface EditorServices {
  resource: ResourceService;
  dataTable: DataTableService;
  file: FileService;
  media: MediaService;
  whiteboard: WhiteboardService;
  settings: SettingsService;
  theme: ThemeService;
  ai: AIService;
  compiler: CompilerService;
  utility: UtilityService;
  customBlock?: CustomBlockService;
  components?: ComponentService;
}
