// ==================== Resource Management ====================

export interface ResourceService {
  /**
   * 上传资源文件，返回可写入文档的资源地址（上传失败返回空串或抛错）
   */
  upload: (file: File) => Promise<string>;

  /**
   * Convert remote resource to local path
   */
  remoteResourceToLocal?: (url: string) => Promise<string>;

  /**
   * 解析资源的 CDN 地址（宿主的 CDN 策略），无 CDN 时返回 null
   */
  resolveCdnUrl?: (url?: string) => string | null | undefined;
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
   * Convert file path to src URL
   */
  convertFileSrc?: (filePath: string) => Promise<string>;
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
  accentColor?: string;
  accentSoftBg?: string;
  badgeBgClass?: string;
  badgeBgColor?: string;
  [key: string]: string | undefined;
}

export interface CompilerService {
  typst: (code: string) => Promise<string>; // Returns SVG or PDF
  tailwindRuntime: (html: string) => Promise<string>;
}
