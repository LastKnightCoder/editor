import { createServiceId } from "./service-contract.ts";

/** 共用宿主资源能力，上传文件沿用浏览器 File 契约。 */

export interface ResourceService {
  /**
   * 上传资源文件，返回可写入文档的资源地址（上传失败返回空串或抛错）
   */
  upload: (file: File) => Promise<string>;

  /**
   * 将远程资源转换为宿主本地路径。
   */
  remoteResourceToLocal?: (url: string) => Promise<string>;

  /**
   * 解析资源的 CDN 地址（宿主的 CDN 策略），无 CDN 时返回 null
   */
  resolveCdnUrl?: (url?: string) => string | null | undefined;
}

/** 宿主文件选择与读取能力。 */
export interface FileService {
  /**
   * 打开宿主文件选择器。
   */
  select: (options?: {
    properties?: string[];
    filters?: Array<{ name: string; extensions: string[] }>;
    multiple?: boolean;
  }) => Promise<string[] | null>;

  /**
   * 读取文件文本。
   */
  readText: (filePath: string) => Promise<string>;

  /**
   * 获取文件路径的基础名称。
   */
  getBaseName: (filePath: string) => string;

  /**
   * 获取用户主目录。
   */
  getHomeDir: () => Promise<string>;

  /**
   * 将文件路径转换为可渲染地址。
   */
  convertFileSrc?: (filePath: string) => Promise<string>;
}

/** 宿主打开链接能力。 */

export interface OpenerService {
  /** 打开外部 URL 或宿主支持的本地/相对路径；缺失能力由调用方选择降级。 */
  open: (url: string) => void | Promise<void>;
}

export const IResourceService = createServiceId<ResourceService>("resourceService");
export const IFileService = createServiceId<FileService>("fileService");
export const IOpenerService = createServiceId<OpenerService>("openerService");
