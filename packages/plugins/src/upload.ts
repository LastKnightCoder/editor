import type { Disposable, JsonValue } from "./contract";

export interface UploadFile {
  /** 宿主已完成压缩和唯一命名，插件只负责追加远端路径前缀。 */
  name: string;
  mimeType: string;
  content: Uint8Array;
}
export interface UploadProviderDefinition {
  id: string;
  name: string;
  /** 返回可供正文直接引用的HTTP(S)地址，不返回临时签名URL。 */
  upload(file: UploadFile, config: JsonValue): Promise<string>;
}
export interface PluginUpload {
  register(definition: UploadProviderDefinition): Disposable;
}
