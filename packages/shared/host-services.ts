import { createServiceId, type ServiceIdentifier } from "./service-contract.ts";

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

/** 宿主跨域请求能力：桌面经主进程转发，没有该能力的宿主（网页端）不注册。 */
export interface FetchService {
  fetch: typeof globalThis.fetch;
}

export const IResourceService: ServiceIdentifier<ResourceService> =
  createServiceId<ResourceService>("resourceService");
export const IFileService: ServiceIdentifier<FileService> =
  createServiceId<FileService>("fileService");
export const IOpenerService: ServiceIdentifier<OpenerService> =
  createServiceId<OpenerService>("openerService");
export const IFetchService: ServiceIdentifier<FetchService> =
  createServiceId<FetchService>("fetchService");
