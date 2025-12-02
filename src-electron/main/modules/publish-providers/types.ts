/**
 * 发布提供者接口
 */
export interface IPublishProvider {
  /**
   * 提供者名称
   */
  readonly name: string;

  /**
   * 上传单个文件
   * @param path 远程文件路径
   * @param content 文件内容
   */
  uploadFile(path: string, content: Buffer): Promise<void>;

  /**
   * 删除单个文件
   * @param path 远程文件路径
   */
  deleteFile(path: string): Promise<void>;

  /**
   * 列出指定前缀下的所有文件
   * @param prefix 路径前缀
   */
  listFiles(prefix?: string): Promise<string[]>;

  /**
   * 检查连接是否可用
   */
  checkConnection(): Promise<boolean>;
}

/**
 * GitHub Pages 提供者配置
 */
export interface IGithubPagesConfig {
  token: string;
  repo: string; // 格式: owner/repo
  branch: string;
  committerName?: string;
  committerEmail?: string;
}

/**
 * S3 提供者配置
 */
export interface IS3HostingConfig {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  endpoint?: string;
  pathPrefix?: string;
  urlStyle?: "path" | "virtualHosted";
}

/**
 * 上传选项
 */
export interface IUploadOptions {
  maxRetries?: number;
  retryDelay?: number;
  concurrency?: number;
}

/**
 * 默认上传选项
 */
export const DEFAULT_UPLOAD_OPTIONS: Required<IUploadOptions> = {
  maxRetries: 3,
  retryDelay: 1000,
  concurrency: 5,
};
