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

// ==================== Opener ====================

export interface OpenerService {
  /** 打开链接：外部 URL，或宿主能解析的本地 / 相对路径。未注册时编辑器用 window.open */
  open: (url: string) => void | Promise<void>;
}
