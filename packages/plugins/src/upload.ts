import type { Disposable, JsonValue } from "./contract";

export interface UploadFile {
  /** 提供方收到宿主唯一命名后的文件；uploadRemote的调用者传原始文件名。 */
  name: string;
  mimeType: string;
  content: Uint8Array;
}
export interface UploadProviderDefinition {
  id: string;
  name: string;
  /** 返回可供正文直接引用的HTTP(S)地址，不返回临时签名URL。 */
  upload(file: UploadFile, config: JsonValue, signal: AbortSignal): Promise<string>;
}
export interface PluginUpload {
  register(definition: UploadProviderDefinition): Disposable;
  /** 使用用户当前远端配置；本地模式明确失败，不自动选择其他存储。 */
  uploadRemote(file: UploadFile, options?: { signal?: AbortSignal }): Promise<string>;
  /**
   * 按用户当前的资源存储（本地库或资源上传插件）保存文件，与正文里插入图片走同一条路径；返回的地址
   * 可写入正文，或交给 useResource / MediaAudio 播放。宿主不支持时抛 UPLOAD_UNAVAILABLE 开头的错误。
   */
  save(file: UploadFile, options?: { signal?: AbortSignal }): Promise<string>;
}
